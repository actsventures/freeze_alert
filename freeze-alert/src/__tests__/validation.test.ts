import { describe, it, expect } from 'vitest';
import {
  validatePhone,
  validateZip,
  extractZipFromMessage,
  ValidationError,
  VALIDATION_ERROR_CODES,
} from '../lib/validation';

describe('Phone Validation', () => {
  it('should normalize valid US phone numbers to E.164 format', () => {
    expect(validatePhone('+15125551234')).toBe('+15125551234');
    expect(validatePhone('15125551234')).toBe('+15125551234');
    expect(validatePhone('5125551234')).toBe('+15125551234');
    expect(validatePhone('(512) 555-1234')).toBe('+15125551234');
    expect(validatePhone('512-555-1234')).toBe('+15125551234');
  });

  it('should throw ValidationError for invalid phone numbers', () => {
    expect(() => validatePhone('123')).toThrow(ValidationError);
    expect(() => validatePhone('not a phone')).toThrow(ValidationError);
    expect(() => validatePhone('')).toThrow(ValidationError);

    try {
      validatePhone('invalid');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).code).toBe(VALIDATION_ERROR_CODES.INVALID_PHONE);
    }
  });
});

describe('Zip Code Validation', () => {
  it('should validate and trim 5-digit zip codes', () => {
    expect(validateZip('78701')).toBe('78701');
    expect(validateZip(' 78701 ')).toBe('78701');
    expect(validateZip('12345')).toBe('12345');
  });

  it('should throw ValidationError for invalid zip codes', () => {
    expect(() => validateZip('1234')).toThrow(ValidationError);
    expect(() => validateZip('123456')).toThrow(ValidationError);
    expect(() => validateZip('abcde')).toThrow(ValidationError);
    expect(() => validateZip('')).toThrow(ValidationError);

    try {
      validateZip('invalid');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).code).toBe(VALIDATION_ERROR_CODES.INVALID_ZIP);
    }
  });
});

describe('Zip Code Extraction from SMS', () => {
  it('should extract zip code when message is just a zip', () => {
    expect(extractZipFromMessage('78701')).toBe('78701');
    expect(extractZipFromMessage(' 78701 ')).toBe('78701');
  });

  it('should extract zip code from natural language messages', () => {
    expect(extractZipFromMessage('Sign me up for 78701')).toBe('78701');
    expect(extractZipFromMessage('alerts for 78701 please')).toBe('78701');
    expect(extractZipFromMessage('I live in 78701')).toBe('78701');
    expect(extractZipFromMessage('zip: 12345')).toBe('12345');
  });

  it('should throw ValidationError when no zip found', () => {
    expect(() => extractZipFromMessage('hello')).toThrow(ValidationError);
    expect(() => extractZipFromMessage('no zip here')).toThrow(ValidationError);
    expect(() => extractZipFromMessage('')).toThrow(ValidationError);
    expect(() => extractZipFromMessage('1234')).toThrow(ValidationError); // Only 4 digits
  });
});
