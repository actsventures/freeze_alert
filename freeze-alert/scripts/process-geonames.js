#!/usr/bin/env node

/**
 * Process GeoNames US.txt file into optimized zip-timezones.json
 *
 * Input: data/US.txt (tab-separated, 41K+ zip codes)
 * Output: data/zip-timezones.json (optimized format)
 *
 * Optimizations:
 * - Compact array format: ["timezone", lat, lon] instead of {tz, lat, lon}
 * - Round coordinates to 2 decimal places (~1km accuracy)
 */

const fs = require('fs');
const path = require('path');

// Timezone mapping by state
// For states with multiple timezones, we'll use longitude boundaries
const STATE_TIMEZONES = {
  // Eastern Time
  'CT': 'America/New_York',
  'DE': 'America/New_York',
  'GA': 'America/New_York',
  'MA': 'America/New_York',
  'MD': 'America/New_York',
  'ME': 'America/New_York',
  'NC': 'America/New_York',
  'NH': 'America/New_York',
  'NJ': 'America/New_York',
  'NY': 'America/New_York',
  'OH': 'America/New_York',
  'PA': 'America/New_York',
  'RI': 'America/New_York',
  'SC': 'America/New_York',
  'VT': 'America/New_York',
  'VA': 'America/New_York',
  'WV': 'America/New_York',
  'DC': 'America/New_York',

  // Central Time
  'AL': 'America/Chicago',
  'AR': 'America/Chicago',
  'IA': 'America/Chicago',
  'IL': 'America/Chicago',
  'LA': 'America/Chicago',
  'MN': 'America/Chicago',
  'MS': 'America/Chicago',
  'MO': 'America/Chicago',
  'OK': 'America/Chicago',
  'WI': 'America/Chicago',

  // Mountain Time
  'CO': 'America/Denver',
  'MT': 'America/Denver',
  'NM': 'America/Denver',
  'WY': 'America/Denver',
  'UT': 'America/Denver',

  // Arizona (no DST)
  'AZ': 'America/Phoenix',

  // Pacific Time
  'CA': 'America/Los_Angeles',
  'NV': 'America/Los_Angeles',
  'WA': 'America/Los_Angeles',

  // Alaska
  'AK': 'America/Anchorage',

  // Hawaii
  'HI': 'Pacific/Honolulu',
};

// States with multiple timezones - use longitude to determine
// Longitude boundaries (negative = west)
const MULTI_TIMEZONE_STATES = {
  // Florida: Eastern (most) vs Central (panhandle)
  // Eastern: longitude > -87.5
  'FL': [
    { maxLon: -87.5, tz: 'America/Chicago' },   // Panhandle
    { maxLon: 180, tz: 'America/New_York' },    // Rest of state
  ],

  // Tennessee: Eastern (east) vs Central (west)
  // Eastern: longitude > -86.5
  'TN': [
    { maxLon: -86.5, tz: 'America/Chicago' },
    { maxLon: 180, tz: 'America/New_York' },
  ],

  // Kentucky: Eastern (east) vs Central (west)
  // Eastern: longitude > -86.5
  'KY': [
    { maxLon: -86.5, tz: 'America/Chicago' },
    { maxLon: 180, tz: 'America/New_York' },
  ],

  // Texas: Central (most) vs Mountain (far west)
  // Central: longitude > -105.0
  'TX': [
    { maxLon: -105.0, tz: 'America/Denver' },   // Far west
    { maxLon: 180, tz: 'America/Chicago' },     // Rest
  ],

  // Kansas: Central (most) vs Mountain (far west)
  // Central: longitude > -101.5
  'KS': [
    { maxLon: -101.5, tz: 'America/Denver' },
    { maxLon: 180, tz: 'America/Chicago' },
  ],

  // North Dakota: Central (most) vs Mountain (west)
  // Central: longitude > -103.5
  'ND': [
    { maxLon: -103.5, tz: 'America/Denver' },
    { maxLon: 180, tz: 'America/Chicago' },
  ],

  // South Dakota: Central (most) vs Mountain (west)
  // Central: longitude > -103.5
  'SD': [
    { maxLon: -103.5, tz: 'America/Denver' },
    { maxLon: 180, tz: 'America/Chicago' },
  ],

  // Nebraska: Central (most) vs Mountain (west)
  // Central: longitude > -104.0
  'NE': [
    { maxLon: -104.0, tz: 'America/Denver' },
    { maxLon: 180, tz: 'America/Chicago' },
  ],

  // Oregon: Pacific (most) vs Mountain (east)
  // Pacific: longitude < -117.0
  'OR': [
    { maxLon: -117.0, tz: 'America/Los_Angeles' },
    { maxLon: 180, tz: 'America/Denver' },
  ],

  // Idaho: Pacific (north) vs Mountain (south)
  // Mountain: longitude > -116.5
  'ID': [
    { maxLon: -116.5, tz: 'America/Los_Angeles' },
    { maxLon: 180, tz: 'America/Denver' },
  ],

  // Michigan: Eastern (most) vs Central (upper peninsula west)
  // Eastern: longitude > -87.5
  'MI': [
    { maxLon: -87.5, tz: 'America/Chicago' },
    { maxLon: 180, tz: 'America/New_York' },
  ],

  // Indiana: Eastern (most) vs Central (northwest counties)
  // Eastern: longitude > -87.5
  'IN': [
    { maxLon: -87.5, tz: 'America/Chicago' },
    { maxLon: 180, tz: 'America/New_York' },
  ],
};

/**
 * Determine timezone for a state/coordinate combination
 */
function getTimezone(state, lon) {
  // Check if state has multiple timezones
  if (MULTI_TIMEZONE_STATES[state]) {
    const rules = MULTI_TIMEZONE_STATES[state];
    for (const rule of rules) {
      if (lon <= rule.maxLon) {
        return rule.tz;
      }
    }
  }

  // Single timezone state
  const tz = STATE_TIMEZONES[state];
  if (!tz) {
    console.warn(`Unknown state: ${state}`);
    return 'America/New_York'; // Default fallback
  }

  return tz;
}

/**
 * Round to N decimal places
 */
function round(num, decimals = 2) {
  return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

/**
 * Process the GeoNames US.txt file
 */
function processGeoNames() {
  const inputPath = path.join(__dirname, '../data/US.txt');
  const outputPath = path.join(__dirname, '../data/zip-timezones.json');

  console.log('Reading GeoNames data...');
  const content = fs.readFileSync(inputPath, 'utf-8');
  const lines = content.trim().split('\n');

  console.log(`Processing ${lines.length} zip codes...`);

  const zipData = {};
  const stats = {
    total: 0,
    byTimezone: {},
  };

  for (const line of lines) {
    const parts = line.split('\t');

    // Parse columns
    const zip = parts[1];
    const state = parts[4]; // State abbreviation
    const lat = parseFloat(parts[9]);
    const lon = parseFloat(parts[10]);

    // Skip invalid data
    if (!zip || !state || isNaN(lat) || isNaN(lon)) {
      console.warn(`Skipping invalid line: ${line.substring(0, 50)}...`);
      continue;
    }

    // Determine timezone
    const tz = getTimezone(state, lon);

    // Create optimized entry: [timezone, lat, lon]
    // Round coordinates to 2 decimal places (saves space, still accurate)
    zipData[zip] = [tz, round(lat, 2), round(lon, 2)];

    // Update stats
    stats.total++;
    stats.byTimezone[tz] = (stats.byTimezone[tz] || 0) + 1;
  }

  // Create output object with metadata
  const output = {
    _comment: 'US zip code to timezone and coordinates mapping',
    _format: 'Each key is a 5-digit zip code, value is [timezone, lat, lon]',
    _source: 'GeoNames (http://download.geonames.org/export/zip/)',
    _generated: new Date().toISOString(),
    _total_zips: stats.total,
    ...zipData,
  };

  // Write output
  console.log('Writing optimized JSON...');
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');

  // Calculate file size
  const fileSize = fs.statSync(outputPath).size;
  const fileSizeMB = (fileSize / 1024 / 1024).toFixed(2);

  // Print stats
  console.log('\n✓ Processing complete!');
  console.log(`\nStats:`);
  console.log(`  Total zip codes: ${stats.total}`);
  console.log(`  Output file size: ${fileSizeMB} MB`);
  console.log(`\nZip codes by timezone:`);
  for (const [tz, count] of Object.entries(stats.byTimezone).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${tz}: ${count}`);
  }

  console.log(`\nOutput written to: ${outputPath}`);
}

// Run the script
try {
  processGeoNames();
} catch (err) {
  console.error('Error processing GeoNames data:', err);
  process.exit(1);
}
