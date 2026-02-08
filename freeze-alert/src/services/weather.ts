import type { NWSForecast } from '../types';
import { getCoordinatesForZip, TimezoneError } from '../lib/timezones';

/**
 * Weather API error
 */
export class WeatherError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'WeatherError';
  }
}

/**
 * NWS API points response (for getting forecast URL)
 */
interface NWSPointsResponse {
  properties: {
    forecast: string;
  };
}

/**
 * NWS API forecast response
 */
interface NWSForecastResponse {
  properties: {
    periods: Array<{
      name: string;
      temperature: number;
      isDaytime: boolean;
    }>;
  };
}

/**
 * Convert zip code to lat/lon coordinates
 *
 * @param zipCode - 5-digit US zip code
 * @returns Object with lat and lon coordinates
 * @throws {WeatherError} If zip code is not found
 */
async function zipToCoordinates(
  zipCode: string
): Promise<{ lat: number; lon: number }> {
  try {
    return getCoordinatesForZip(zipCode);
  } catch (err) {
    if (err instanceof TimezoneError) {
      throw new WeatherError(`Invalid zip code: ${zipCode}`);
    }
    throw err;
  }
}

/**
 * Fetch overnight low temperature from NWS API
 *
 * NWS API flow:
 * 1. GET https://api.weather.gov/points/{lat},{lon} → get forecast URL
 * 2. GET {forecastUrl} → get forecast periods
 * 3. Find tonight's/overnight low temperature
 *
 * @throws {WeatherError} If the forecast cannot be fetched
 */
export async function fetchNWSForecast(zipCode: string): Promise<NWSForecast> {
  const coords = await zipToCoordinates(zipCode);

  // Step 1: Get the forecast URL for this location
  const pointsUrl = `https://api.weather.gov/points/${coords.lat},${coords.lon}`;
  const pointsResponse = await fetch(pointsUrl, {
    headers: {
      'User-Agent': 'FreezeAlert/1.0 (alerts@example.com)',
      'Accept': 'application/geo+json',
    },
  });

  if (!pointsResponse.ok) {
    throw new WeatherError(
      `NWS points API error: ${pointsResponse.status}`,
      pointsResponse.status
    );
  }

  const pointsData = await pointsResponse.json() as NWSPointsResponse;
  const forecastUrl = pointsData.properties.forecast;

  // Step 2: Get the actual forecast
  const forecastResponse = await fetch(forecastUrl, {
    headers: {
      'User-Agent': 'FreezeAlert/1.0 (alerts@example.com)',
      'Accept': 'application/geo+json',
    },
  });

  if (!forecastResponse.ok) {
    throw new WeatherError(
      `NWS forecast API error: ${forecastResponse.status}`,
      forecastResponse.status
    );
  }

  const forecastData = await forecastResponse.json() as NWSForecastResponse;

  // Step 3: Find the overnight low
  // Prioritize periods named "Tonight" or "Overnight", then fall back to first non-daytime period
  const periods = forecastData.properties.periods;

  // First, try to find a period with "tonight" or "overnight" in the name
  let overnightPeriod = periods.find(
    p => p.name.toLowerCase().includes('tonight') ||
         p.name.toLowerCase().includes('overnight')
  );

  // If not found, fall back to the first non-daytime period
  if (!overnightPeriod) {
    overnightPeriod = periods.find(p => !p.isDaytime);
  }

  if (!overnightPeriod) {
    throw new WeatherError('Could not find overnight forecast period');
  }

  // Validate temperature is present and not null
  if (overnightPeriod.temperature === null || overnightPeriod.temperature === undefined) {
    throw new WeatherError('Temperature data missing from forecast period');
  }

  // NWS (US National Weather Service) always returns Fahrenheit
  // Round to avoid decimal precision issues in alerts
  const tempF = Math.round(overnightPeriod.temperature);

  return { overnightLow: tempF };
}

