/**
 * Standalone script to view actual NWS forecast outputs
 *
 * Run with: npm run test:output
 * Or: npx tsx test-forecast-output.ts
 *
 * This shows the actual forecast data without running the full test suite
 */

import { fetchNWSForecast } from './src/services/weather';
import { getCoordinatesForZip } from './src/lib/timezones';

async function showForecastOutput() {
  console.log('🌡️  NWS Forecast Output Test\n');
  console.log('=' .repeat(60));

  const testZipcodes = [
    { zip: '78701', name: 'Austin, TX' },
    { zip: '10001', name: 'New York, NY' },
    { zip: '90001', name: 'Los Angeles, CA' },
    { zip: '37388', name: 'Tullahoma, TN' },
    { zip: '80202', name: 'Denver, CO' },
  ];

  for (const { zip, name } of testZipcodes) {
    try {
      console.log(`\n📍 ${name} (${zip})`);
      console.log('-'.repeat(60));

      // Get coordinates
      const coords = getCoordinatesForZip(zip);
      console.log(`Coordinates: ${coords.lat}, ${coords.lon}`);

      // Get forecast
      const forecast = await fetchNWSForecast(zip);
      console.log(`Overnight Low: ${forecast.overnightLow}°F`);

      // Check if freeze alert would trigger (threshold is 28°F)
      const wouldAlert = forecast.overnightLow <= 28;
      console.log(`Freeze Alert: ${wouldAlert ? '🚨 YES' : '✅ No (above 28°F)'}`);

    } catch (error) {
      console.error(`❌ Error for ${zip}:`, error instanceof Error ? error.message : error);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Test complete!\n');
}

showForecastOutput().catch(console.error);

