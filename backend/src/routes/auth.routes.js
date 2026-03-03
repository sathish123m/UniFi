const router = require("express").Router();
const authSvc = require("../services/auth.service");
const prisma = require("../config/db");
const { protect } = require("../middleware/auth");
const {
  validate,
  registerSchema,
  loginSchema,
  verifyOtpSchema,
} = require("../middleware/validate");
const {
  authRateLimiter,
  otpRateLimiter,
} = require("../middleware/rateLimiter");
const { ok } = require("../utils/response");
const { allowedEmailDomains } = require("../config/university");

router.get("/universities", async (req, res) => {
  let universities = await prisma.university.findMany({
    where: {
      isActive: true,
      emailDomain: { in: allowedEmailDomains },
    },
    select: { name: true, shortName: true, emailDomain: true },
    orderBy: { name: "asc" },
  });
  if (!universities.length) {
    // Fallback: create default entries based on allowed domains
    const domainNames = {
      "lpu.in": "Lovely Professional University",
      "rguktn.ac.in": "Rajiv Gandhi University of Knowledge and Technologies",
    };
    universities = allowedEmailDomains.map((domain) => ({
      name: domainNames[domain] || domain,
      shortName: domain.split(".")[0].toUpperCase(),
      emailDomain: domain,
    }));
  }
  ok(res, universities);
});

router.post(
  "/register",
  authRateLimiter,
  validate(registerSchema),
  async (req, res) =>
    ok(res, await authSvc.register(req.body), "Account created", 201),
);
router.post(
  "/login",
  authRateLimiter,
  validate(loginSchema),
  async (req, res) => ok(res, await authSvc.login(req.body)),
);
router.post(
  "/verify-otp",
  authRateLimiter,
  validate(verifyOtpSchema),
  async (req, res) => ok(res, await authSvc.verifyEmailOtp(req.body)),
);
router.post("/resend-otp", otpRateLimiter, async (req, res) =>
  ok(
    res,
    await authSvc.resendOtp(
      req.body.email,
      req.body.purpose || "EMAIL_VERIFY",
      req.body.requestedRole,
    ),
  ),
);
router.post("/refresh", async (req, res) =>
  ok(res, await authSvc.refresh(req.body.refreshToken)),
);
router.post("/logout", protect, async (req, res) =>
  ok(res, await authSvc.logout(req.body.refreshToken)),
);
router.get("/me", protect, async (req, res) => ok(res, req.user));
module.exports = router;
