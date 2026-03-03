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

module.exports = {
  allowedEmailDomains,
  allowedEmailSuffixes,
  normalizeEmail,
  isAllowedUniversityEmail,
};
