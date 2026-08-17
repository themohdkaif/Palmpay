/**
 * Vault & Vein Registration & Form Validation Utilities
 */

export const DISPOSABLE_EMAIL_DOMAINS = [
  "mailinator.com",
  "tempmail.com",
  "guerrillamail.com",
  "10minutemail.com",
  "dispostable.com",
  "yopmail.com",
  "trashmail.com",
  "sharklasers.com",
  "getairmail.com",
  "temp-mail.org",
  "throwawaymail.com",
  "asdf.com",
  "test.com",
];

export const ALLOWED_EMAIL_DOMAINS = [
  "gmail.com",
  "outlook.com",
  "hotmail.com",
  "yahoo.com",
  "icloud.com",
  "live.com",
  "proton.me",
  "protonmail.com",
  "zoho.com",
  "gmx.com",
  "mail.com",
  "yahoo.co.in",
  "rediffmail.com",
];

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export const validateEmail = (email: string): ValidationResult => {
  const trimmed = email.trim().toLowerCase();
  if (!trimmed) return { valid: false, reason: "Email address is required" };

  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(trimmed)) {
    return { valid: false, reason: "Invalid format (e.g. name@domain.com)" };
  }

  const parts = trimmed.split("@");
  const domain = parts[1];

  if (DISPOSABLE_EMAIL_DOMAINS.includes(domain)) {
    return { valid: false, reason: "Disposable/temp email addresses are not permitted" };
  }

  const mainDomain = domain.split(".")[0];
  if (mainDomain.length < 3 || /^([a-z])\1+$/.test(mainDomain)) {
    return { valid: false, reason: "Valid domain name required" };
  }

  const isLegit =
    ALLOWED_EMAIL_DOMAINS.includes(domain) ||
    domain.endsWith(".edu") ||
    domain.endsWith(".ac.in") ||
    domain.endsWith(".org");

  if (!isLegit) {
    return { valid: false, reason: "Please use Gmail, Outlook, Yahoo, iCloud or standard email provider" };
  }

  return { valid: true };
};

export const validatePhone = (phone: string): ValidationResult => {
  const cleaned = phone.trim().replace(/[\s\-\+\(\)]/g, "");
  // Indian 10-digit mobile number starting with 6,7,8,9
  if (!/^[6-9][0-9]{9}$/.test(cleaned)) {
    return { valid: false, reason: "Must be a 10-digit Indian mobile number starting with 6-9 (e.g. 9876543210)" };
  }
  return { valid: true };
};

export const validateUpiVpa = (vpa: string): ValidationResult => {
  const trimmed = vpa.trim();
  if (!/^[\w.-]+@[\w.-]+$/.test(trimmed)) {
    return { valid: false, reason: "Valid UPI VPA format required (e.g. name@bank)" };
  }
  return { valid: true };
};
