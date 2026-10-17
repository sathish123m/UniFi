const allowedEmailDomains = (
  process.env.ALLOWED_UNIVERSITY_DOMAINS || "lpu.in,rguktn.ac.in"
)
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter((d) => d);

const allowedEmailSuffixes = allowedEmailDomains.map((d) => `@${d}`);

const normalizeEmail = (email) =>
  String(email || "")
    .trim()
    .toLowerCase();

const isAllowedUniversityEmail = (email) => {
  const normalized = normalizeEmail(email);
  return allowedEmailSuffixes.some((suffix) => normalized.endsWith(suffix));
};

// Extract the domain portion of an email (e.g. "a@lpu.in" → "lpu.in").
const emailDomainOf = (email) => {
  const normalized = normalizeEmail(email);
  const at = normalized.lastIndexOf("@");
  return at === -1 ? "" : normalized.slice(at + 1);
};

module.exports = {
  allowedEmailDomains,
  allowedEmailSuffixes,
  normalizeEmail,
  isAllowedUniversityEmail,
  emailDomainOf,
};
