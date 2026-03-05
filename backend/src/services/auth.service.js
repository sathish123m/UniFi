const bcrypt = require("bcrypt");
const prisma = require("../config/db");
const {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  hashToken,
} = require("../utils/jwt");
const {
  generateOtp,
  hashOtp,
  verifyOtp,
  otpExpiresAt,
} = require("../utils/otp");
const { sendOtpChannels, smsRealEnabled } = require("./notification.service");
const { createId } = require("@paralleldrive/cuid2");
const {
  allowedEmailDomains,
  allowedEmailSuffixes,
  normalizeEmail,
  isAllowedUniversityEmail,
} = require("../config/university");

const err = (msg, code = 400) =>
  Object.assign(new Error(msg), { statusCode: code });
const isDev = (process.env.NODE_ENV || "development") !== "production";
const exposeDevOtp =
  isDev &&
  String(process.env.EXPOSE_DEV_OTP || "false").toLowerCase() === "true";
const requireEmailVerification =
  String(process.env.AUTH_REQUIRE_EMAIL_VERIFIED || "true").toLowerCase() !==
  "false";
const adminRoles = ["SUPER_ADMIN", "MOD_ADMIN", "FINANCE_ADMIN"];
const portalRoleMap = {
  BORROWER: ["BORROWER"],
  PROVIDER: ["PROVIDER"],
  ADMIN: adminRoles,
};

const normalizePhone = (phone) => {
  const raw = String(phone || "").trim();
  if (!raw) return null;
  return raw.replace(/\s+/g, "");
};

const normalizeRequestedRole = (value) => {
  const role = String(value || "")
    .trim()
    .toUpperCase();
  return ["BORROWER", "PROVIDER", "ADMIN"].includes(role) ? role : null;
};

const roleAccessError = (requestedRole) => {
  const page = String(requestedRole || "").toLowerCase();
  return `You don't have access to ${page} page. Please use the correct portal or create a separate account.`;
};

const getAllowedDomainsText = () => allowedEmailDomains.join(" or ");

const register = async ({
  email,
  password,
  firstName,
  lastName,
  role,
  phone,
}) => {
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizePhone(phone);
  if (!isAllowedUniversityEmail(normalizedEmail)) {
    throw err(`Only @${getAllowedDomainsText()} email addresses are allowed`);
  }

  const university = await prisma.university.findFirst({
    where: {
      emailDomain: { in: allowedEmailDomains },
      isActive: true,
    },
  });
  if (!university)
    throw err(
      `University configuration missing for @${getAllowedDomainsText()}`,
      500,
    );

  const roleEmailExists = await prisma.user.findFirst({
    where: { email: normalizedEmail, role },
    select: { id: true },
  });
  if (roleEmailExists) {
    throw err(
      `Email already registered for ${role.toLowerCase()} account`,
      409,
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: {
      id: createId(),
      email: normalizedEmail,
      passwordHash,
      firstName,
      lastName,
      role,
      universityId: university.id,
      phone: normalizedPhone,
    },
  });

  const otp = await sendOtp(user.id, normalizedEmail, "EMAIL_VERIFY");
  return {
    message:
      normalizedPhone && smsRealEnabled
        ? "Account created. OTP sent to your email and phone (fallback)."
        : "Account created. Check your email for the OTP.",
    ...(exposeDevOtp && { devOtp: otp }),
  };
};

const sendOtp = async (userId, email, purpose) => {
  await prisma.otpCode.updateMany({
    where: { userId, purpose, used: false },
    data: { used: true },
  });
  const otp = generateOtp();
  const rec = await prisma.otpCode.create({
    data: {
      id: createId(),
      userId,
      code: await hashOtp(otp),
      purpose,
      expiresAt: otpExpiresAt(10),
    },
  });

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { phone: true },
    });
    const delivery = await sendOtpChannels({
      email,
      phone: user?.phone || null,
      otp,
      purpose,
    });
    if (!delivery.sentAny) throw new Error("All OTP channels failed");
  } catch (_e) {
    await prisma.otpCode.update({
      where: { id: rec.id },
      data: { used: true },
    });
    throw err(
      "Unable to deliver OTP right now. Please try again in a few minutes.",
      503,
    );
  }

  return otp;
};

const findUsersByPortal = async (email, requestedRole) => {
  const normalized = normalizeRequestedRole(requestedRole);
  const roleFilter = normalized ? { in: portalRoleMap[normalized] } : undefined;
  return prisma.user.findMany({
    where: {
      email,
      ...(roleFilter ? { role: roleFilter } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
};

const verifyEmailOtp = async ({ email, otp, purpose, requestedRole }) => {
  const normalizedEmail = normalizeEmail(email);
  const requested = normalizeRequestedRole(requestedRole);

  const users = await findUsersByPortal(normalizedEmail, requested);
  if (!users.length) {
    if (requested) throw err(roleAccessError(requested), 403);
    throw err("User not found", 404);
  }

  const recs = await prisma.otpCode.findMany({
    where: {
      userId: { in: users.map((u) => u.id) },
      purpose,
      used: false,
      expiresAt: { gt: new Date() },
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          role: true,
          firstName: true,
          lastName: true,
          kycStatus: true,
          emailVerified: true,
          isBanned: true,
          isSuspended: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  let matched = null;
  for (const rec of recs) {
    if (await verifyOtp(otp, rec.code)) {
      matched = rec;
      break;
    }
  }

  if (!matched) throw err("Invalid OTP");

  await prisma.otpCode.update({
    where: { id: matched.id },
    data: { used: true },
  });

  if (purpose === "EMAIL_VERIFY") {
    await prisma.user.update({
      where: { id: matched.user.id },
      data: { emailVerified: true },
    });
    return { message: "Email verified. You can now log in." };
  }

  return issueTokens(matched.user);
};

const login = async ({ email, password, requestedRole }) => {
  const normalizedEmail = normalizeEmail(email);
  const requested = normalizeRequestedRole(requestedRole);
  const accounts = await prisma.user.findMany({
    where: { email: normalizedEmail },
    orderBy: { createdAt: "desc" },
  });

  if (!accounts.length) throw err("Invalid credentials", 401);

  if (!requested) {
    let matched = null;
    for (const account of accounts) {
      if (await bcrypt.compare(password, account.passwordHash)) {
        matched = account;
        break;
      }
    }
    if (!matched) throw err("Invalid credentials", 401);

    if (requireEmailVerification && !matched.emailVerified)
      throw err("Please verify your email first", 403);
    if (matched.isBanned) throw err("Account banned", 403);
    if (matched.isSuspended) throw err("Account suspended", 403);

    await prisma.user.update({
      where: { id: matched.id },
      data: { lastLoginAt: new Date() },
    });
    return issueTokens(matched);
  }

  const allowedRoles = portalRoleMap[requested];
  const candidates = accounts.filter((account) =>
    allowedRoles.includes(account.role),
  );
  if (!candidates.length) throw err(roleAccessError(requested), 403);

  let matchCandidate = null;
  for (const candidate of candidates) {
    if (await bcrypt.compare(password, candidate.passwordHash)) {
      matchCandidate = candidate;
      break;
    }
  }

  if (!matchCandidate) {
    for (const account of accounts) {
      if (allowedRoles.includes(account.role)) continue;
      if (await bcrypt.compare(password, account.passwordHash)) {
        throw err(roleAccessError(requested), 403);
      }
    }
    throw err("Invalid credentials", 401);
  }

  if (requireEmailVerification && !matchCandidate.emailVerified)
    throw err("Please verify your email first", 403);
  if (matchCandidate.isBanned) throw err("Account banned", 403);
  if (matchCandidate.isSuspended) throw err("Account suspended", 403);

  await prisma.user.update({
    where: { id: matchCandidate.id },
    data: { lastLoginAt: new Date() },
  });
  return issueTokens(matchCandidate);
};

const issueTokens = async (user) => {
  const payload = { userId: user.id, role: user.role };
  const accessToken = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);
  const exp = new Date();
  exp.setDate(exp.getDate() + 7);

  await prisma.refreshToken.create({
    data: {
      id: createId(),
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: exp,
    },
  });

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      kycStatus: user.kycStatus,
    },
  };
};

const refresh = async (token) => {
  if (!token) throw err("No refresh token", 401);
  const decoded = verifyRefreshToken(token);
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date())
    throw err("Invalid refresh token", 401);

  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });
  const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
  if (!user) throw err("User not found", 404);
  return issueTokens(user);
};

const logout = async (token) => {
  if (token) {
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(token) },
      data: { revokedAt: new Date() },
    });
  }
  return { message: "Logged out" };
};

const resendOtp = async (email, purpose, requestedRole) => {
  const normalizedEmail = normalizeEmail(email);
  const requested = normalizeRequestedRole(requestedRole);

  const users = await findUsersByPortal(normalizedEmail, requested);
  if (!users.length) {
    if (requested) throw err(roleAccessError(requested), 403);
    throw err("User not found", 404);
  }
  if (users.length > 1 && !requested) {
    throw err(
      "Multiple accounts found for this email. Choose borrower or provider portal before requesting OTP.",
      400,
    );
  }

  const targetUser = users[0];
  const otp = await sendOtp(targetUser.id, normalizedEmail, purpose);
  return {
    message: "OTP sent",
    ...(exposeDevOtp && { devOtp: otp }),
  };
};

module.exports = {
  register,
  login,
  verifyEmailOtp,
  refresh,
  logout,
  resendOtp,
};
