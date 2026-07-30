const bcrypt = require("bcrypt");
const crypto = require("crypto");
const logger = require("../config/logger");
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

const recordDeviceSession = async (userId, reqInfo = {}) => {
  try {
    const { ipAddress = "127.0.0.1", userAgent = "Unknown", fingerprint } = reqInfo;
    const fp = fingerprint || crypto.createHash("sha256").update(`${ipAddress}-${userAgent}`).digest("hex");

    await prisma.deviceSession.upsert({
      where: {
        userId_fingerprint: { userId, fingerprint: fp },
      },
      update: { lastSeenAt: new Date(), ipAddress, userAgent },
      create: {
        id: createId(),
        userId,
        fingerprint: fp,
        ipAddress,
        userAgent,
      },
    });
  } catch (e) {
    // Non-blocking device session recording
  }
};
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
  isDev || String(process.env.EXPOSE_DEV_OTP || "true").toLowerCase() === "true";
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
    if (!delivery?.sentAny) {
      logger.warn(`OTP email delivery warning for ${email}: ${delivery?.email?.error || 'SMTP timeout'}`);
    }
  } catch (deliveryError) {
    logger.warn(`OTP delivery exception for ${email}: ${deliveryError.message}`);
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
      ...(purpose ? { purpose } : {}),
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

  if (!matched) throw err("Invalid or expired OTP", 400);

  await prisma.otpCode.update({
    where: { id: matched.id },
    data: { used: true },
  });

  if (matched.purpose === "EMAIL_VERIFY" || purpose === "EMAIL_VERIFY") {
    await prisma.user.update({
      where: { id: matched.user.id },
      data: { emailVerified: true },
    });
    return { message: "Email verified. You can now log in." };
  }

  return issueTokens(matched.user);
};

const login = async ({ email, password, requestedRole, twoFaCode }, reqInfo = {}) => {
  const normalizedEmail = normalizeEmail(email);
  const requested = normalizeRequestedRole(requestedRole);
  const accounts = await prisma.user.findMany({
    where: { email: normalizedEmail },
    orderBy: { createdAt: "desc" },
  });

  if (!accounts.length) throw err("Invalid credentials", 401);

  let targetUser = null;

  if (!requested) {
    for (const account of accounts) {
      if (await bcrypt.compare(password, account.passwordHash)) {
        targetUser = account;
        break;
      }
    }
    if (!targetUser) throw err("Invalid credentials", 401);
  } else {
    const allowedRoles = portalRoleMap[requested];
    const candidates = accounts.filter((account) =>
      allowedRoles.includes(account.role),
    );
    if (!candidates.length) throw err(roleAccessError(requested), 403);

    for (const candidate of candidates) {
      if (await bcrypt.compare(password, candidate.passwordHash)) {
        targetUser = candidate;
        break;
      }
    }

    if (!targetUser) {
      for (const account of accounts) {
        if (allowedRoles.includes(account.role)) continue;
        if (await bcrypt.compare(password, account.passwordHash)) {
          throw err(roleAccessError(requested), 403);
        }
      }
      throw err("Invalid credentials", 401);
    }
  }

  if (!targetUser.emailVerified)
    throw err("Please verify your email first", 403);
  if (targetUser.isBanned) throw err("Account banned", 403);
  if (targetUser.isSuspended) throw err("Account suspended", 403);

  // Admin 2FA Verification Flow
  const isAdmin = adminRoles.includes(targetUser.role) || requested === "ADMIN";
  if (isAdmin) {
    if (!twoFaCode) {
      const otp = await sendOtp(targetUser.id, targetUser.email, "ADMIN_2FA");
      return {
        requires2FA: true,
        email: targetUser.email,
        message: "2FA authentication code sent to admin email.",
        ...(exposeDevOtp && { devOtp: otp }),
      };
    }

    // Verify provided 2FA code
    const otpRecord = await prisma.otpCode.findFirst({
      where: {
        userId: targetUser.id,
        purpose: "ADMIN_2FA",
        used: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!otpRecord) throw err("Invalid or expired 2FA verification code", 400);

    const isValid = await verifyOtp(twoFaCode, otpRecord.code);
    if (!isValid) throw err("Invalid 2FA verification code", 400);

    await prisma.otpCode.update({
      where: { id: otpRecord.id },
      data: { used: true },
    });
  }

  await prisma.user.update({
    where: { id: targetUser.id },
    data: { lastLoginAt: new Date() },
  });
  await recordDeviceSession(targetUser.id, reqInfo);
  return issueTokens(targetUser);
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
  let requested = normalizeRequestedRole(requestedRole);

  let users = await findUsersByPortal(normalizedEmail, requested);
  if (!users.length && requested) {
    users = await findUsersByPortal(normalizedEmail, undefined);
  }
  if (!users.length) {
    throw err("No account found for this email address.", 404);
  }

  const targetUser = users[0];
  const otp = await sendOtp(targetUser.id, normalizedEmail, purpose || "EMAIL_VERIFY");
  return {
    message: "OTP sent",
    ...(exposeDevOtp && { devOtp: otp }),
  };
};

const forgotPassword = async ({ email, requestedRole }) => {
  const normalizedEmail = normalizeEmail(email);
  const requested = normalizeRequestedRole(requestedRole);

  const users = await findUsersByPortal(normalizedEmail, requested);
  if (!users.length) {
    return { message: "If an account exists with this email, a password reset OTP has been sent." };
  }

  const targetUser = users[0];
  const otp = await sendOtp(targetUser.id, normalizedEmail, "PASSWORD_RESET");

  return {
    message: "If an account exists with this email, a password reset OTP has been sent.",
    ...(exposeDevOtp && { devOtp: otp }),
  };
};

const resetPassword = async ({ email, otp, newPassword, requestedRole }) => {
  const normalizedEmail = normalizeEmail(email);
  const requested = normalizeRequestedRole(requestedRole);

  const users = await findUsersByPortal(normalizedEmail, requested);
  if (!users.length) throw err("Invalid request or OTP expired", 400);

  const targetUser = users[0];

  const otpRecord = await prisma.otpCode.findFirst({
    where: {
      userId: targetUser.id,
      purpose: "PASSWORD_RESET",
      used: false,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!otpRecord) throw err("Invalid or expired OTP", 400);

  const isValid = await verifyOtp(otp, otpRecord.code);
  if (!isValid) throw err("Invalid or expired OTP", 400);

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await prisma.$transaction([
    prisma.otpCode.update({
      where: { id: otpRecord.id },
      data: { used: true },
    }),
    prisma.user.update({
      where: { id: targetUser.id },
      data: { passwordHash },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: targetUser.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  return { message: "Password reset successful. You may now log in with your new password." };
};

module.exports = {
  register,
  login,
  verifyEmailOtp,
  refresh,
  logout,
  resendOtp,
  forgotPassword,
  resetPassword,
};
