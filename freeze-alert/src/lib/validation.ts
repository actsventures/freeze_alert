/**
 * Validation error with specific error code
 */
export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly code: ValidationErrorCode
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export const VALIDATION_ERROR_CODES = {
  INVALID_PHONE: 'INVALID_PHONE',
  INVALID_ZIP: 'INVALID_ZIP',
  MISSING_FIELD: 'MISSING_FIELD',
} as const;

export type ValidationErrorCode = typeof VALIDATION_ERROR_CODES[keyof typeof VALIDATION_ERROR_CODES];

/**
 * US phone number regex
 * Accepts: +1XXXXXXXXXX, 1XXXXXXXXXX, XXXXXXXXXX
 * Also accepts formatted: (XXX) XXX-XXXX, XXX-XXX-XXXX
 */
const PHONE_REGEX = /^(?:\+?1)?[-.\s]?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})$/;

/**
 * US zip code regex (5 digits only, no ZIP+4)
 */
const ZIP_REGEX = /^[0-9]{5}$/;

/**
 * Validate and normalize a US phone number to E.164 format
 *
 * @param phone - Phone number in any common US format
 * @returns Phone in E.164 format (+1XXXXXXXXXX)
 * @throws {ValidationError} If phone number is invalid
 */
export function validatePhone(phone: string): string {
  const trimmed = phone.trim();
  const match = trimmed.match(PHONE_REGEX);

  if (!match) {
    throw new ValidationError(
      'Invalid phone number. Please use a 10-digit US number.',
      VALIDATION_ERROR_CODES.INVALID_PHONE
    );
  }

  // Normalize to E.164 format
  const [, areaCode, exchange, subscriber] = match;
  return `+1${areaCode}${exchange}${subscriber}`;
}

/**
 * Validate a US zip code
 *
 * @param zip - 5-digit zip code
 * @returns Validated zip code (trimmed)
 * @throws {ValidationError} If zip code is invalid format
 */
export function validateZip(zip: string): string {
  const trimmed = zip.trim();

  if (!ZIP_REGEX.test(trimmed)) {
    throw new ValidationError(
      'Invalid zip code. Please use a 5-digit US zip code.',
      VALIDATION_ERROR_CODES.INVALID_ZIP
    );
  }

  return trimmed;
}

/**
 * Extract a zip code from an SMS message body
 *
 * Handles messages like:
 * - "78701"
 * - "Sign me up for 78701"
 * - "alerts for 78701 please"
 *
 * @param body - SMS message body
 * @returns Extracted zip code
 * @throws {ValidationError} If no zip code found
 */
export function extractZipFromMessage(body: string): string {
  const trimmed = body.trim();

  // First, check if the entire message is just a zip code
  if (ZIP_REGEX.test(trimmed)) {
    return trimmed;
  }

  // Otherwise, look for a 5-digit sequence in the message
  const match = trimmed.match(/\b([0-9]{5})\b/);

  if (!match) {
    throw new ValidationError(
      'Could not find a zip code. Reply with your 5-digit zip code.',
      VALIDATION_ERROR_CODES.INVALID_ZIP
    );
  }

  return match[1];
}

