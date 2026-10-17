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
const { sendOtpChannels } = require("./notification.service");
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
  normalizeEmail,
  isAllowedUniversityEmail,
  emailDomainOf,
} = require("../config/university");

const err = (msg, code = 400) =>
  Object.assign(new Error(msg), { statusCode: code });
const adminRoles = ["SUPER_ADMIN", "MOD_ADMIN", "FINANCE_ADMIN"];
// OTP purposes a client is allowed to (re)request via /resend-otp. LOGIN and
// UPI_VERIFY are reserved in the schema but have no issuing flow, so they are
// deliberately excluded here.
const RESENDABLE_OTP_PURPOSES = ["EMAIL_VERIFY", "PASSWORD_RESET", "ADMIN_2FA"];
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
  const domain = emailDomainOf(normalizedEmail);

  // The campus list in the database is the source of truth: a domain that has
  // an active University row is allowed. The ALLOWED_UNIVERSITY_DOMAINS env var
  // is the bootstrap allow-list used to self-heal a missing row (below).
  let university = await prisma.university.findFirst({
    where: { emailDomain: domain, isActive: true },
  });

  if (!university) {
    if (!isAllowedUniversityEmail(normalizedEmail)) {
      throw err(`Only @${getAllowedDomainsText()} email addresses are allowed`);
    }
    // Self-heal: the domain is in ALLOWED_UNIVERSITY_DOMAINS, so it is a
    // first-class campus. Create the missing row instead of failing
    // registration (previously a 500 until the seed ran).
    const knownNames = {
      "lpu.in": "Lovely Professional University",
      "rguktn.ac.in": "Rajiv Gandhi University of Knowledge and Technologies",
    };
    university = await prisma.university.create({
      data: {
        id: createId(),
        name: knownNames[domain] || domain,
        shortName: domain.split(".")[0].toUpperCase(),
        emailDomain: domain,
        city: "Unknown",
        state: "Unknown",
        isActive: true,
      },
    });
  }

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

  await sendOtp(user.id, normalizedEmail, "EMAIL_VERIFY");
  return {
    message: "Account created. Check your email for the OTP.",
  };
};

const sendOtp = async (userId, email, purpose) => {
  const otp = generateOtp();

  // Invalidate any prior live OTPs for this user+purpose so only the newest code
  // is ever valid (prevents older, still-unexpired codes from being reused).
  await prisma.otpCode.updateMany({
    where: { userId, purpose, used: false },
    data: { used: true },
  });

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

const verifyEmailOtp = async ({ email, otp, requestedRole }) => {
  const normalizedEmail = normalizeEmail(email);
  const requested = normalizeRequestedRole(requestedRole);

  const users = await findUsersByPortal(normalizedEmail, requested);
  if (!users.length) {
    if (requested) throw err(roleAccessError(requested), 403);
    throw err("User not found", 404);
  }

  // This endpoint verifies email ownership only. It must NEVER issue login
  // tokens for other OTP purposes (PASSWORD_RESET / ADMIN_2FA / LOGIN) — those
  // have their own dedicated flows (resetPassword, login+twoFaCode). Matching is
  // therefore hard-scoped to EMAIL_VERIFY regardless of any client-supplied purpose.
  const recs = await prisma.otpCode.findMany({
    where: {
      userId: { in: users.map((u) => u.id) },
      purpose: "EMAIL_VERIFY",
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

  await prisma.user.update({
    where: { id: matched.user.id },
    data: { emailVerified: true },
  });

  return { message: "Email verified. You can now log in." };
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
      await sendOtp(targetUser.id, targetUser.email, "ADMIN_2FA");
      return {
        requires2FA: true,
        email: targetUser.email,
        message: "2FA authentication code sent to admin email.",
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
  if (!token || typeof token !== "string") throw err("No refresh token", 401);
  let decoded;
  try {
    decoded = verifyRefreshToken(token);
  } catch {
    throw err("Invalid refresh token", 401);
  }
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date())
    throw err("Invalid refresh token", 401);

  // Atomic single-use rotation: only the request that claims the token may
  // mint the next pair. A parallel replay loses the claim and gets a 401.
  const claimed = await prisma.refreshToken.updateMany({
    where: { id: stored.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (claimed.count !== 1) throw err("Invalid refresh token", 401);

  const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
  if (!user) throw err("User not found", 404);
  if (user.isBanned || user.isSuspended || !user.isActive) {
    throw err("Account is not active. Contact support.", 403);
  }
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
  // Only allow known, issuable purposes; anything else falls back to email
  // verification rather than letting a caller trigger arbitrary OTP mails.
  const safePurpose = RESENDABLE_OTP_PURPOSES.includes(String(purpose || "").toUpperCase())
    ? String(purpose).toUpperCase()
    : "EMAIL_VERIFY";

  let users = await findUsersByPortal(normalizedEmail, requested);
  if (!users.length && requested) {
    users = await findUsersByPortal(normalizedEmail, undefined);
  }

  // Always return the same generic response whether or not the account exists,
  // so this endpoint can't be used to enumerate registered emails. If a matching
  // account is found we send; otherwise we silently no-op.
  if (users.length) {
    await sendOtp(users[0].id, normalizedEmail, safePurpose);
  }
  return { message: "If an account exists for this email, an OTP has been sent." };
};

const forgotPassword = async ({ email, requestedRole }) => {
  const normalizedEmail = normalizeEmail(email);
  const requested = normalizeRequestedRole(requestedRole);

  const users = await findUsersByPortal(normalizedEmail, requested);
  if (!users.length) {
    return { message: "If an account exists with this email, a password reset OTP has been sent." };
  }

  const targetUser = users[0];
  await sendOtp(targetUser.id, normalizedEmail, "PASSWORD_RESET");

  return {
    message: "If an account exists with this email, a password reset OTP has been sent.",
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

const changePassword = async (userId, { currentPassword, newPassword }) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw err("User not found", 404);

  const matches = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!matches) throw err("Current password is incorrect", 400);

  const sameAsOld = await bcrypt.compare(newPassword, user.passwordHash);
  if (sameAsOld) throw err("New password must be different from the current one", 400);

  const passwordHash = await bcrypt.hash(newPassword, 12);

  // Update the password and revoke all existing refresh tokens so any other
  // sessions are forced to re-authenticate with the new credentials.
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  return { message: "Password changed. Please sign in again on other devices." };
};

const updateProfile = async (userId, { firstName, lastName, phone }) => {
  const data = {};
  if (firstName !== undefined) data.firstName = firstName;
  if (lastName !== undefined) data.lastName = lastName;
  if (phone !== undefined) data.phone = normalizePhone(phone);

  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: {
      id: true,
      email: true,
      role: true,
      firstName: true,
      lastName: true,
      phone: true,
      kycStatus: true,
    },
  });
  return user;
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
  changePassword,
  updateProfile,
};
