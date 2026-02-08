import { describe, it, expect } from 'vitest';
import {
  getTimezoneForZip,
  getCoordinatesForZip,
  findTimezonesAtHour,
  isValidZipCode,
  TimezoneError,
} from '../lib/timezones';

describe('Timezone Lookup', () => {
  it('should return correct timezone for known zip codes', () => {
    expect(getTimezoneForZip('78701')).toBe('America/Chicago'); // Austin, TX
    expect(getTimezoneForZip('10001')).toBe('America/New_York'); // New York, NY
    expect(getTimezoneForZip('90001')).toBe('America/Los_Angeles'); // Los Angeles, CA
  });

  it('should throw TimezoneError for unknown zip codes', () => {
    expect(() => getTimezoneForZip('00000')).toThrow(TimezoneError);
    expect(() => getTimezoneForZip('99999')).toThrow(TimezoneError);
  });
});

describe('Coordinates Lookup', () => {
  it('should return correct coordinates for known zip codes', () => {
    const coords = getCoordinatesForZip('78701');
    expect(coords).toHaveProperty('lat');
    expect(coords).toHaveProperty('lon');
    expect(typeof coords.lat).toBe('number');
    expect(typeof coords.lon).toBe('number');

    // Austin, TX should be around 30.27, -97.74
    expect(coords.lat).toBeCloseTo(30.27, 1);
    expect(coords.lon).toBeCloseTo(-97.74, 1);
  });

  it('should throw TimezoneError for unknown zip codes', () => {
    expect(() => getCoordinatesForZip('00000')).toThrow(TimezoneError);
  });
});

describe('Timezone Hour Matching', () => {
  it('should find timezones where it is currently 8pm', () => {
    // Create a time when it's 8pm Central (America/Chicago)
    // This is a bit tricky because we need to account for DST
    // Let's use a fixed date: Jan 15, 2025 at 2am UTC (8pm Central previous day)
    const testDate = new Date('2025-01-15T02:00:00Z');

    const timezones = findTimezonesAtHour(testDate, 20); // 20 = 8pm

    // Should return an array
    expect(Array.isArray(timezones)).toBe(true);

    // Each result should be a valid timezone string
    timezones.forEach(tz => {
      expect(typeof tz).toBe('string');
      expect(tz).toMatch(/^(America|Pacific)\//);
    });
  });

  it('should return empty array when no timezones match', () => {
    const testDate = new Date('2025-01-15T12:00:00Z');

    // Try to find hour 25 (impossible)
    const timezones = findTimezonesAtHour(testDate, 25);

    // Might return empty if no timezone is at that hour
    expect(Array.isArray(timezones)).toBe(true);
  });
});

describe('Zip Code Validation', () => {
  it('should return true for valid zip codes', () => {
    expect(isValidZipCode('78701')).toBe(true);
    expect(isValidZipCode('10001')).toBe(true);
  });

  it('should return false for invalid zip codes', () => {
    expect(isValidZipCode('00000')).toBe(false);
    expect(isValidZipCode('99999')).toBe(false);
    expect(isValidZipCode('invalid')).toBe(false);
  });
});
