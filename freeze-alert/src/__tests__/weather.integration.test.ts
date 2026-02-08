import { describe, it, expect } from 'vitest';
import { fetchNWSForecast, WeatherError } from '../services/weather';
import { getCoordinatesForZip, getTimezoneForZip, TimezoneError } from '../lib/timezones';

/**
 * Integration tests for NWS API and zipcode lookup
 * These tests make REAL API calls to the National Weather Service.
 */

// ============================================================================
// TEST CONFIGURATION
// ============================================================================

const TEST_ZIPCODES = [
  { zip: '37388', name: 'Tullahoma, TN' },
  { zip: '78701', name: 'Austin, TX' },
  { zip: '10001', name: 'New York, NY' },
  { zip: '90001', name: 'Los Angeles, CA' },
  { zip: '80202', name: 'Denver, CO' },
  { zip: '99501', name: 'Anchorage, AK' },
];

const FREEZE_THRESHOLD = 28; // °F
const API_TIMEOUT = 30000; // 30 seconds

// ============================================================================
// TYPES
// ============================================================================

interface NWSPointsResponse {
  properties: {
    forecast: string;
    gridId: string;
    relativeLocation: {
      properties: {
        city: string;
        state: string;
      };
    };
  };
}

interface ForecastPeriod {
  name: string;
  temperature: number;
  isDaytime: boolean;
}

interface NWSForecastResponse {
  properties: {
    periods: ForecastPeriod[];
  };
}

interface TestResult {
  zip: string;
  name: string;
  coords: { lat: number; lon: number };
  timezone: string;
  gridId: string;
  city: string;
  state: string;
  overnightLow: number;
  wouldTriggerAlert: boolean;
}

// ============================================================================
// MAIN TEST
// ============================================================================

describe('NWS Integration Tests', () => {

  it('should validate all zipcodes through complete NWS API flow', async () => {
    console.log('\n🌡️  NWS API Integration Test - Testing ' + TEST_ZIPCODES.length + ' zipcodes\n');

    const results: TestResult[] = [];

    for (const { zip, name } of TEST_ZIPCODES) {
      // Step 1: Get coordinates
      const coords = getCoordinatesForZip(zip);
      const timezone = getTimezoneForZip(zip);

      // Step 2: Call NWS Points API
      const pointsUrl = `https://api.weather.gov/points/${coords.lat},${coords.lon}`;
      const pointsResponse = await fetch(pointsUrl, {
        headers: {
          'User-Agent': 'FreezeAlert/1.0 (alerts@example.com)',
          'Accept': 'application/geo+json',
        },
      });
      const pointsData = await pointsResponse.json() as NWSPointsResponse;

      // Step 3: Call NWS Forecast API
      const forecastResponse = await fetch(pointsData.properties.forecast, {
        headers: {
          'User-Agent': 'FreezeAlert/1.0 (alerts@example.com)',
          'Accept': 'application/geo+json',
        },
      });
      const forecastData = await forecastResponse.json() as NWSForecastResponse;

      // Step 4: Select overnight period
      let selectedPeriod = forecastData.properties.periods.find(
        p => p.name.toLowerCase().includes('tonight') ||
             p.name.toLowerCase().includes('overnight')
      );
      if (!selectedPeriod) {
        selectedPeriod = forecastData.properties.periods.find(p => !p.isDaytime);
      }

      // Validate that a period was found (matching production code error handling)
      if (!selectedPeriod) {
        throw new Error(`Could not find overnight forecast period for zip ${zip}`);
      }

      // Step 5: Calculate result
      const overnightLow = Math.round(selectedPeriod.temperature);
      const wouldTriggerAlert = overnightLow <= FREEZE_THRESHOLD;

      results.push({
        zip,
        name,
        coords,
        timezone,
        gridId: pointsData.properties.gridId,
        city: pointsData.properties.relativeLocation?.properties?.city || 'N/A',
        state: pointsData.properties.relativeLocation?.properties?.state || 'N/A',
        overnightLow,
        wouldTriggerAlert,
      });
    }

    // Display results
    console.log('╔═══════════════════════════════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                                     📊 TEST RESULTS                                                   ║');
    console.log('╠═══════════════════════════════════════════════════════════════════════════════════════════════════════╣');
    console.log('║ Zip   │ Location             │ Coords              │ Grid │ NWS Location      │ Low   │ Alert      ║');
    console.log('╠═══════════════════════════════════════════════════════════════════════════════════════════════════════╣');

    for (const r of results) {
      const zip = r.zip.padEnd(5);
      const loc = r.name.padEnd(20);
      const coords = `${r.coords.lat.toFixed(2)}, ${r.coords.lon.toFixed(2)}`.padEnd(19);
      const grid = r.gridId.padEnd(4);
      const nwsLoc = `${r.city}, ${r.state}`.substring(0, 17).padEnd(17);
      const low = `${r.overnightLow}°F`.padStart(5);
      const alert = r.wouldTriggerAlert ? '🚨 ALERT  ' : 'No        ';
      console.log(`║ ${zip} │ ${loc} │ ${coords} │ ${grid} │ ${nwsLoc} │ ${low} │ ${alert} ║`);
    }

    console.log('╚═══════════════════════════════════════════════════════════════════════════════════════════════════════╝');

    const alertCount = results.filter(r => r.wouldTriggerAlert).length;
    console.log(`\n  ✅ ${results.length}/${TEST_ZIPCODES.length} passed  │  🚨 ${alertCount} alerts  │  Threshold: ≤${FREEZE_THRESHOLD}°F\n`);

    // Assertions
    expect(results.length).toBe(TEST_ZIPCODES.length);
    for (const r of results) {
      expect(r.overnightLow).toBeGreaterThan(-60);
      expect(r.overnightLow).toBeLessThan(120);
    }

  }, API_TIMEOUT);

});

// ============================================================================
// INDIVIDUAL VALIDATION TESTS
// ============================================================================

describe('Individual Validations', () => {
  const TIMEOUT = 10000;

  it('should convert all zipcodes to valid coordinates', () => {
    TEST_ZIPCODES.forEach(({ zip }) => {
      const coords = getCoordinatesForZip(zip);
      expect(coords.lat).toBeGreaterThan(18);
      expect(coords.lat).toBeLessThan(72);
    });
  });

  it('should throw TimezoneError for invalid zipcodes', () => {
    expect(() => getCoordinatesForZip('00000')).toThrow(TimezoneError);
    expect(() => getCoordinatesForZip('99999')).toThrow(TimezoneError);
  });

  it('should fetch forecast for each zipcode', async () => {
    for (const { zip } of TEST_ZIPCODES) {
      const forecast = await fetchNWSForecast(zip);
      expect(forecast.overnightLow).toBeDefined();
    }
  }, TIMEOUT * TEST_ZIPCODES.length);

  it('should throw WeatherError for invalid zipcodes', async () => {
    await expect(fetchNWSForecast('00000')).rejects.toThrow(WeatherError);
  }, TIMEOUT);
});
