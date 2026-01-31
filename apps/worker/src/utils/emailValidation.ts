/**
 * Email validation and normalization utilities
 */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

export interface EmailValidationResult {
  valid: boolean;
  error?: string;
  normalized?: string;
}

export interface PasswordValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates and normalizes an email address
 */
export function validateAndNormalizeEmail(email: string): EmailValidationResult {
  if (!email) {
    return { valid: false, error: 'Email is required' };
  }

  const normalized = email.trim().toLowerCase();

  if (normalized.length === 0) {
    return { valid: false, error: 'Email cannot be empty' };
  }

  if (normalized.length > 320) {
    return { valid: false, error: 'Email is too long' };
  }

  if (!EMAIL_REGEX.test(normalized)) {
    return { valid: false, error: 'Invalid email format' };
  }

  return { valid: true, normalized };
}

/**
 * Validates password meets minimum requirements
 */
export function validatePassword(password: string): PasswordValidationResult {
  if (!password) {
    return { valid: false, error: 'Password is required' };
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      valid: false,
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
    };
  }

  return { valid: true };
}
