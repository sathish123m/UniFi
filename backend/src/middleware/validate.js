const { z } = require("zod");
const {
  allowedEmailDomains,
  allowedEmailSuffixes,
  isAllowedUniversityEmail,
} = require("../config/university");

const getAllowedDomainsText = () => allowedEmailDomains.join(" or ");

const validate = (schema) => (req, res, next) => {
  try {
    schema.parse({ body: req.body, query: req.query, params: req.params });
    next();
  } catch (err) {
    res.status(422).json({
      success: false,
      message: "Validation failed",
      errors: err.errors.map((e) => ({
        field: e.path.slice(1).join("."),
        message: e.message,
      })),
    });
  }
};

const registerSchema = z.object({
  body: z.object({
    email: z
      .string()
      .trim()
      .email()
      .refine(
        (value) => isAllowedUniversityEmail(value),
        `Only @${getAllowedDomainsText()} emails are allowed`,
      ),
    password: z
      .string()
      .min(8)
      .max(72)
      .regex(/[A-Z]/, "Must include uppercase")
      .regex(/[a-z]/, "Must include lowercase")
      .regex(/[0-9]/, "Must include number")
      .regex(/[^A-Za-z0-9]/, "Must include special character"),
    firstName: z.string().trim().min(1).max(50),
    lastName: z.string().trim().min(1).max(50),
    phone: z
      .string()
      .trim()
      .optional()
      .refine(
        (v) => !v || /^\+[1-9]\d{9,14}$/.test(v),
        "Phone must be in international format, e.g. +919876543210",
      ),
    role: z.enum(["BORROWER", "PROVIDER"]),
  }),
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().trim().email(),
    password: z.string().min(1),
    requestedRole: z.enum(["BORROWER", "PROVIDER", "ADMIN"]).optional(),
  }),
});

const verifyOtpSchema = z.object({
  body: z.object({
    email: z.string().trim().email(),
    otp: z.string().length(6).regex(/^\d+$/, "OTP must be numeric"),
    purpose: z.enum(["EMAIL_VERIFY", "LOGIN", "UPI_VERIFY"]),
    requestedRole: z.enum(["BORROWER", "PROVIDER", "ADMIN"]).optional(),
  }),
});

const loanRequestSchema = z.object({
  body: z.object({
    principalAmount: z.number().int().min(500).max(10000),
    tenure: z.enum(["SEVEN", "FOURTEEN", "THIRTY"]),
    purpose: z.enum([
      "FOOD",
      "BOOKS",
      "TRANSPORT",
      "MEDICAL",
      "ACCOMMODATION",
      "EMERGENCY",
      "OTHER",
    ]),
    purposeNote: z.string().trim().max(120).optional(),
  }),
});

const upiSchema = z.object({
  body: z.object({
    upiId: z
      .string()
      .trim()
      .min(6)
      .max(64)
      .regex(/^[a-zA-Z0-9._-]+@[a-zA-Z]{2,}$/i, "Invalid UPI ID format"),
  }),
});

module.exports = {
  validate,
  registerSchema,
  loginSchema,
  verifyOtpSchema,
  loanRequestSchema,
  upiSchema,
};
