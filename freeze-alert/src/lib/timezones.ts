import zipData from '../../data/zip-timezones.json';

/**
 * Timezone lookup error
 */
export class TimezoneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimezoneError';
  }
}

/**
 * US timezone identifiers we support
 */
export const US_TIMEZONES = [
  'America/New_York',      // Eastern
  'America/Chicago',       // Central
  'America/Denver',        // Mountain
  'America/Phoenix',       // Arizona (no DST)
  'America/Los_Angeles',   // Pacific
  'America/Anchorage',     // Alaska
  'Pacific/Honolulu',      // Hawaii
] as const;

export type USTimezone = typeof US_TIMEZONES[number];

/**
 * Zip code data structure from JSON
 * Optimized format: [timezone, lat, lon]
 */
type ZipData = [USTimezone, number, number];

/**
 * Zip code to timezone/coordinates mapping
 * Filter out metadata keys (_comment, _format, _source, _generated, _total_zips)
 */
const ZIP_DATA = Object.fromEntries(
  Object.entries(zipData as Record<string, ZipData | string | number>).filter(
    ([key]) => !key.startsWith('_')
  )
) as Record<string, ZipData>;

/**
 * Get the IANA timezone for a US zip code
 *
 * @param zipCode - 5-digit US zip code
 * @returns IANA timezone identifier
 * @throws {TimezoneError} If zip code is not found
 */
export function getTimezoneForZip(zipCode: string): USTimezone {
  const data = ZIP_DATA[zipCode];

  if (!data) {
    throw new TimezoneError(`Unknown zip code: ${zipCode}`);
  }

  // Optimized format: [timezone, lat, lon]
  return data[0];
}

/**
 * Get coordinates for a US zip code
 *
 * @param zipCode - 5-digit US zip code
 * @returns Object with lat and lon
 * @throws {TimezoneError} If zip code is not found
 */
export function getCoordinatesForZip(zipCode: string): { lat: number; lon: number } {
  const data = ZIP_DATA[zipCode];

  if (!data) {
    throw new TimezoneError(`Unknown zip code: ${zipCode}`);
  }

  // Optimized format: [timezone, lat, lon]
  return { lat: data[1], lon: data[2] };
}

/**
 * Find all timezones where the current hour matches the target hour
 *
 * @param now - Current UTC time
 * @param targetHour - Target hour in 24h format (e.g., 20 for 8pm)
 * @returns Array of IANA timezone identifiers
 */
export function findTimezonesAtHour(now: Date, targetHour: number): string[] {
  const matchingTimezones: string[] = [];

  for (const tz of US_TIMEZONES) {
    // Get the current hour in this timezone
    const localHour = getHourInTimezone(now, tz);

    if (localHour === targetHour) {
      matchingTimezones.push(tz);
    }
  }

  return matchingTimezones;
}

/**
 * Get the current hour (0-23) in a specific timezone
 */
function getHourInTimezone(date: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    hour12: false,
    timeZone: timezone,
  });

  const hourStr = formatter.format(date);
  return parseInt(hourStr, 10);
}

/**
 * Check if a zip code exists in our database
 */
export function isValidZipCode(zipCode: string): boolean {
  return zipCode in ZIP_DATA;
}

