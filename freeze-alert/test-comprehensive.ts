/**
 * Comprehensive NWS API Diagnostic Test
 *
 * This script traces through EVERY step of the forecast fetch process
 * showing all inputs and outputs at each stage.
 *
 * Run with: npm run test:verbose
 *
 * Flow:
 *   1. Zipcode Input
 *   2. Zipcode → Coordinates (from local JSON)
 *   3. Coordinates → NWS Points API (get forecast URL)
 *   4. Forecast URL → NWS Forecast API (get periods)
 *   5. Period Selection (find overnight low)
 *   6. Final Output
 */

import { getCoordinatesForZip, getTimezoneForZip } from './src/lib/timezones';

// ============================================================================
// CONFIGURATION
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

// ============================================================================
// TYPES
// ============================================================================

interface NWSPointsResponse {
  properties: {
    forecast: string;
    forecastHourly: string;
    gridId: string;
    gridX: number;
    gridY: number;
    relativeLocation: {
      properties: {
        city: string;
        state: string;
      };
    };
  };
}

interface ForecastPeriod {
  number: number;
  name: string;
  startTime: string;
  endTime: string;
  isDaytime: boolean;
  temperature: number;
  temperatureUnit: string;
  temperatureTrend: string | null;
  windSpeed: string;
  windDirection: string;
  shortForecast: string;
  detailedForecast: string;
}

interface NWSForecastResponse {
  properties: {
    updated: string;
    generatedAt: string;
    periods: ForecastPeriod[];
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function printHeader(title: string) {
  console.log('\n' + '═'.repeat(80));
  console.log(`  ${title}`);
  console.log('═'.repeat(80));
}

function printSubHeader(title: string) {
  console.log('\n' + '─'.repeat(60));
  console.log(`  ${title}`);
  console.log('─'.repeat(60));
}

function printStep(stepNum: number, title: string) {
  console.log(`\n┌${'─'.repeat(70)}┐`);
  console.log(`│  STEP ${stepNum}: ${title.padEnd(60)}│`);
  console.log(`└${'─'.repeat(70)}┘`);
}

function printKeyValue(key: string, value: any, indent = 0) {
  const spaces = ' '.repeat(indent);
  console.log(`${spaces}${key}: ${JSON.stringify(value)}`);
}

function printJSON(obj: any, indent = 2) {
  console.log(JSON.stringify(obj, null, indent));
}

// ============================================================================
// MAIN TEST FLOW
// ============================================================================

async function runComprehensiveTest(zipcode: string, locationName: string) {
  printHeader(`TESTING: ${locationName} (${zipcode})`);

  let coords: { lat: number; lon: number };
  let timezone: string;
  let pointsUrl: string;
  let pointsResponse: NWSPointsResponse;
  let forecastUrl: string;
  let forecastResponse: NWSForecastResponse;
  let selectedPeriod: ForecastPeriod | undefined;
  let overnightLow: number;

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: Input Zipcode
  // ═══════════════════════════════════════════════════════════════════════════
  printStep(1, 'INPUT ZIPCODE');
  console.log('\n  📥 INPUT:');
  printKeyValue('    Zipcode', zipcode);
  printKeyValue('    Location Name', locationName);

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: Lookup Coordinates & Timezone from Local JSON
  // ═══════════════════════════════════════════════════════════════════════════
  printStep(2, 'ZIPCODE → COORDINATES (Local JSON Lookup)');

  console.log('\n  📥 INPUT:');
  printKeyValue('    Zipcode', zipcode);

  try {
    coords = getCoordinatesForZip(zipcode);
    timezone = getTimezoneForZip(zipcode);

    console.log('\n  📤 OUTPUT:');
    printKeyValue('    Latitude', coords.lat);
    printKeyValue('    Longitude', coords.lon);
    printKeyValue('    Timezone', timezone);
    console.log('\n  ✅ Success: Coordinates found in local database');
  } catch (error) {
    console.log('\n  ❌ ERROR: Zipcode not found in local database');
    console.log(`     ${error instanceof Error ? error.message : error}`);
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3: Call NWS Points API
  // ═══════════════════════════════════════════════════════════════════════════
  printStep(3, 'COORDINATES → NWS POINTS API');

  pointsUrl = `https://api.weather.gov/points/${coords.lat},${coords.lon}`;

  console.log('\n  📥 INPUT:');
  printKeyValue('    Coordinates', `${coords.lat}, ${coords.lon}`);
  printKeyValue('    API URL', pointsUrl);
  console.log('    Headers:');
  console.log('      User-Agent: "FreezeAlert/1.0 (alerts@example.com)"');
  console.log('      Accept: "application/geo+json"');

  try {
    const startTime = Date.now();
    const response = await fetch(pointsUrl, {
      headers: {
        'User-Agent': 'FreezeAlert/1.0 (alerts@example.com)',
        'Accept': 'application/geo+json',
      },
    });
    const elapsed = Date.now() - startTime;

    console.log('\n  📤 RESPONSE:');
    printKeyValue('    HTTP Status', response.status);
    printKeyValue('    Response Time', `${elapsed}ms`);

    if (!response.ok) {
      console.log(`\n  ❌ ERROR: NWS Points API returned ${response.status}`);
      return;
    }

    pointsResponse = await response.json() as NWSPointsResponse;

    console.log('\n  📤 OUTPUT (Parsed Response):');
    console.log('    Grid Info:');
    printKeyValue('      Grid ID', pointsResponse.properties.gridId);
    printKeyValue('      Grid X', pointsResponse.properties.gridX);
    printKeyValue('      Grid Y', pointsResponse.properties.gridY);
    console.log('    Location:');
    printKeyValue('      City', pointsResponse.properties.relativeLocation?.properties?.city || 'N/A');
    printKeyValue('      State', pointsResponse.properties.relativeLocation?.properties?.state || 'N/A');
    console.log('    Forecast URLs:');
    printKeyValue('      Forecast URL', pointsResponse.properties.forecast);
    printKeyValue('      Hourly URL', pointsResponse.properties.forecastHourly);

    forecastUrl = pointsResponse.properties.forecast;
    console.log('\n  ✅ Success: Got forecast URL from NWS Points API');
  } catch (error) {
    console.log('\n  ❌ ERROR: Failed to call NWS Points API');
    console.log(`     ${error instanceof Error ? error.message : error}`);
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 4: Call NWS Forecast API
  // ═══════════════════════════════════════════════════════════════════════════
  printStep(4, 'FORECAST URL → NWS FORECAST API');

  console.log('\n  📥 INPUT:');
  printKeyValue('    API URL', forecastUrl);
  console.log('    Headers:');
  console.log('      User-Agent: "FreezeAlert/1.0 (alerts@example.com)"');
  console.log('      Accept: "application/geo+json"');

  try {
    const startTime = Date.now();
    const response = await fetch(forecastUrl, {
      headers: {
        'User-Agent': 'FreezeAlert/1.0 (alerts@example.com)',
        'Accept': 'application/geo+json',
      },
    });
    const elapsed = Date.now() - startTime;

    console.log('\n  📤 RESPONSE:');
    printKeyValue('    HTTP Status', response.status);
    printKeyValue('    Response Time', `${elapsed}ms`);

    if (!response.ok) {
      console.log(`\n  ❌ ERROR: NWS Forecast API returned ${response.status}`);
      return;
    }

    forecastResponse = await response.json() as NWSForecastResponse;

    console.log('\n  📤 OUTPUT (Forecast Metadata):');
    printKeyValue('    Updated', forecastResponse.properties.updated);
    printKeyValue('    Generated At', forecastResponse.properties.generatedAt);
    printKeyValue('    Number of Periods', forecastResponse.properties.periods.length);

    console.log('\n  📋 ALL FORECAST PERIODS:');
    console.log('  ┌' + '─'.repeat(76) + '┐');
    console.log('  │ #  │ Period Name        │ Day? │ Temp  │ Short Forecast                   │');
    console.log('  ├' + '─'.repeat(76) + '┤');

    forecastResponse.properties.periods.forEach((period, idx) => {
      const num = String(idx + 1).padStart(2);
      const name = period.name.substring(0, 18).padEnd(18);
      const isDay = period.isDaytime ? 'Yes ' : 'No  ';
      const temp = `${period.temperature}°${period.temperatureUnit}`.padStart(5);
      const forecast = period.shortForecast.substring(0, 32).padEnd(32);
      console.log(`  │ ${num} │ ${name} │ ${isDay} │ ${temp} │ ${forecast} │`);
    });
    console.log('  └' + '─'.repeat(76) + '┘');

    console.log('\n  ✅ Success: Got forecast periods from NWS Forecast API');
  } catch (error) {
    console.log('\n  ❌ ERROR: Failed to call NWS Forecast API');
    console.log(`     ${error instanceof Error ? error.message : error}`);
    return;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 5: Select Overnight Period
  // ═══════════════════════════════════════════════════════════════════════════
  printStep(5, 'PERIOD SELECTION (Find Overnight Low)');

  const periods = forecastResponse.properties.periods;

  console.log('\n  📥 INPUT:');
  printKeyValue('    Number of Periods', periods.length);
  console.log('    Selection Strategy:');
  console.log('      1. First, look for period with "Tonight" or "Overnight" in name');
  console.log('      2. If not found, use first non-daytime (isDaytime: false) period');

  // Try to find "Tonight" or "Overnight"
  let tonightPeriod = periods.find(
    p => p.name.toLowerCase().includes('tonight') ||
         p.name.toLowerCase().includes('overnight')
  );

  if (tonightPeriod) {
    console.log('\n  🔍 SEARCH RESULT:');
    console.log(`    Found period with "Tonight/Overnight" in name:`);
    printKeyValue('      Period Name', tonightPeriod.name);
    selectedPeriod = tonightPeriod;
  } else {
    console.log('\n  🔍 SEARCH RESULT:');
    console.log('    No "Tonight/Overnight" period found, looking for first non-daytime...');

    const nightPeriod = periods.find(p => !p.isDaytime);
    if (nightPeriod) {
      console.log(`    Found first non-daytime period:`);
      printKeyValue('      Period Name', nightPeriod.name);
      selectedPeriod = nightPeriod;
    }
  }

  if (!selectedPeriod) {
    console.log('\n  ❌ ERROR: Could not find overnight period');
    return;
  }

  console.log('\n  📤 SELECTED PERIOD DETAILS:');
  console.log(`    ┌${'─'.repeat(50)}┐`);
  printKeyValue('    │ Name', selectedPeriod.name);
  printKeyValue('    │ Temperature', `${selectedPeriod.temperature}°${selectedPeriod.temperatureUnit}`);
  printKeyValue('    │ Is Daytime', selectedPeriod.isDaytime);
  printKeyValue('    │ Start Time', selectedPeriod.startTime);
  printKeyValue('    │ End Time', selectedPeriod.endTime);
  printKeyValue('    │ Wind', `${selectedPeriod.windSpeed} ${selectedPeriod.windDirection}`);
  printKeyValue('    │ Short Forecast', selectedPeriod.shortForecast);
  console.log(`    └${'─'.repeat(50)}┘`);
  console.log('\n  📝 Detailed Forecast:');
  console.log(`    "${selectedPeriod.detailedForecast}"`);

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 6: Final Output
  // ═══════════════════════════════════════════════════════════════════════════
  printStep(6, 'FINAL OUTPUT');

  overnightLow = Math.round(selectedPeriod.temperature);
  const wouldTriggerAlert = overnightLow <= FREEZE_THRESHOLD;

  console.log('\n  📥 INPUT:');
  printKeyValue('    Raw Temperature', selectedPeriod.temperature);
  printKeyValue('    Temperature Unit', selectedPeriod.temperatureUnit);

  console.log('\n  📤 OUTPUT:');
  printKeyValue('    Rounded Temperature', overnightLow);
  printKeyValue('    Freeze Threshold', `${FREEZE_THRESHOLD}°F`);

  console.log('\n  🎯 RESULT:');
  console.log(`    ┌${'─'.repeat(50)}┐`);
  console.log(`    │  Location: ${locationName.padEnd(37)}│`);
  console.log(`    │  Zipcode: ${zipcode.padEnd(38)}│`);
  console.log(`    │  Overnight Low: ${(overnightLow + '°F').padEnd(31)}│`);
  console.log(`    │  Freeze Alert: ${(wouldTriggerAlert ? '🚨 YES - WOULD TRIGGER!' : '✅ No').padEnd(31)}│`);
  console.log(`    └${'─'.repeat(50)}┘`);

  return {
    zipcode,
    locationName,
    coords,
    timezone,
    gridId: pointsResponse.properties.gridId,
    overnightLow,
    wouldTriggerAlert,
  };
}

// ============================================================================
// SUMMARY TABLE
// ============================================================================

interface TestResult {
  zipcode: string;
  locationName: string;
  coords: { lat: number; lon: number };
  timezone: string;
  gridId: string;
  overnightLow: number;
  wouldTriggerAlert: boolean;
}

function printSummary(results: TestResult[]) {
  printHeader('SUMMARY - ALL ZIPCODES');

  console.log('\n  ┌' + '─'.repeat(94) + '┐');
  console.log('  │ Zipcode │ Location            │ Coordinates          │ Timezone         │ Low  │ Alert │');
  console.log('  ├' + '─'.repeat(94) + '┤');

  results.forEach(r => {
    const zip = r.zipcode.padEnd(7);
    const loc = r.locationName.substring(0, 19).padEnd(19);
    const coords = `${r.coords.lat.toFixed(4)}, ${r.coords.lon.toFixed(4)}`.padEnd(20);
    const tz = r.timezone.substring(8).padEnd(16); // Remove "America/"
    const low = `${r.overnightLow}°F`.padStart(4);
    const alert = r.wouldTriggerAlert ? '🚨 YES' : '  No  ';
    console.log(`  │ ${zip} │ ${loc} │ ${coords} │ ${tz} │ ${low} │ ${alert} │`);
  });

  console.log('  └' + '─'.repeat(94) + '┘');

  const alertCount = results.filter(r => r.wouldTriggerAlert).length;
  console.log(`\n  📊 Total: ${results.length} zipcodes tested`);
  console.log(`  🚨 Alerts: ${alertCount} would trigger (≤${FREEZE_THRESHOLD}°F)`);
  console.log(`  ✅ No alert: ${results.length - alertCount} above threshold`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.clear();
  console.log('\n');
  console.log('╔' + '═'.repeat(78) + '╗');
  console.log('║' + ' '.repeat(20) + '🌡️  COMPREHENSIVE NWS API TEST' + ' '.repeat(27) + '║');
  console.log('║' + ' '.repeat(78) + '║');
  console.log('║  This test traces through every step of the forecast fetch process        ║');
  console.log('║  showing all inputs and outputs at each stage.                            ║');
  console.log('╚' + '═'.repeat(78) + '╝');

  console.log(`\n  📋 Testing ${TEST_ZIPCODES.length} zipcodes:`);
  TEST_ZIPCODES.forEach(({ zip, name }) => {
    console.log(`     • ${zip} - ${name}`);
  });

  const results: TestResult[] = [];

  for (const { zip, name } of TEST_ZIPCODES) {
    const result = await runComprehensiveTest(zip, name);
    if (result) {
      results.push(result);
    }

    // Small delay between API calls to be nice to NWS servers
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  printSummary(results);

  console.log('\n' + '═'.repeat(80));
  console.log('  ✅ COMPREHENSIVE TEST COMPLETE');
  console.log('═'.repeat(80) + '\n');
}

main().catch(console.error);

