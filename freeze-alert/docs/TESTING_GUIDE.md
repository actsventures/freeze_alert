# Testing Guide for NWS and Zipcode Integration

This guide explains how to test the National Weather Service (NWS) API integration and zipcode-to-coordinates conversion.

## Test Types

### 1. Unit Tests (Mocked - Fast)

These tests mock the NWS API calls and test the logic without making real network requests.

**Run unit tests:**
```bash
npm test -- weather.test.ts
```

**What they test:**
- Error handling for API failures
- Temperature parsing logic
- Period selection logic (Tonight vs Overnight vs first non-daytime)
- Temperature rounding

### 2. Integration Tests (Real API - Slower)

These tests make **real API calls** to the NWS API to verify the integration works end-to-end.

**Run integration tests:**
```bash
npm test -- weather.integration.test.ts
```

**What they test:**
- Zipcode to coordinates conversion with real data
- Actual NWS API connectivity
- End-to-end flow: zipcode → coordinates → NWS forecast
- Multiple zipcodes across different timezones

**Note:** Integration tests require internet connectivity and may take 10-30 seconds to complete.

### 3. Zipcode Lookup Tests

Tests for the zipcode-to-coordinates conversion using the static JSON data.

**Run zipcode tests:**
```bash
npm test -- timezones.test.ts
```

**What they test:**
- Zipcode validation
- Coordinate lookup from JSON data
- Timezone lookup
- Error handling for invalid zipcodes

## Running All Tests

**Run all tests (unit + integration):**
```bash
npm test
```

**Run all tests in watch mode:**
```bash
npm run test:watch
```

**Run only unit tests (skip integration):**
```bash
npm test -- --exclude weather.integration.test.ts
```

**Run with coverage:**
```bash
npm run test:coverage
```

## Manual Testing

### Test Zipcode to Coordinates

You can manually test zipcode conversion by creating a simple script:

```typescript
import { getCoordinatesForZip } from './src/lib/timezones';

const zip = '78701';
const coords = getCoordinatesForZip(zip);
console.log(`${zip}: ${coords.lat}, ${coords.lon}`);
```

### Test NWS API Directly

You can test the NWS API directly using curl or a browser:

1. **Get coordinates for a zipcode:**
   ```bash
   # Use the coordinates from getCoordinatesForZip('78701')
   # Example: 30.27, -97.74
   ```

2. **Call NWS Points API:**
   ```bash
   curl -H "User-Agent: FreezeAlert/1.0 (alerts@example.com)" \
        -H "Accept: application/geo+json" \
        "https://api.weather.gov/points/30.27,-97.74"
   ```

3. **Get forecast from the URL returned:**
   ```bash
   curl -H "User-Agent: FreezeAlert/1.0 (alerts@example.com)" \
        -H "Accept: application/geo+json" \
        "https://api.weather.gov/gridpoints/EWX/123,456/forecast"
   ```

### Test Full Flow Programmatically

Create a test script in `test-nws.js`:

```javascript
// test-nws.js
import { fetchNWSForecast } from './src/services/weather.js';

async function test() {
  const zipcodes = ['78701', '10001', '90001'];

  for (const zip of zipcodes) {
    try {
      console.log(`Testing ${zip}...`);
      const forecast = await fetchNWSForecast(zip);
      console.log(`✓ ${zip}: ${forecast.overnightLow}°F`);
    } catch (err) {
      console.error(`✗ ${zip}: ${err.message}`);
    }
  }
}

test();
```

Run with:
```bash
node test-nws.js
```

## Testing in Cloudflare Workers Environment

Since this runs on Cloudflare Workers, you can also test using Wrangler:

```bash
# Start local dev server
npm run dev

# In another terminal, trigger the scheduled event manually
# Or use wrangler tail to see logs
wrangler tail
```

## Common Issues

### Integration Tests Failing

- **Network issues:** Ensure you have internet connectivity
- **NWS API rate limiting:** The NWS API may rate limit if you make too many requests. Wait a few minutes and try again.
- **Timeout errors:** Increase the timeout in the test file if needed

### Zipcode Not Found

- Check that the zipcode exists in `data/zip-timezones.json`
- Valid US zipcodes are 5 digits (00501-99950)
- Some zipcodes may not be in the database

### NWS API Errors

- The NWS API requires a proper `User-Agent` header
- Some coordinates may not have forecast data available
- The API may return 503 errors during maintenance

## Test Coverage Goals

- ✅ Unit tests for all error paths
- ✅ Integration tests for happy path
- ✅ Tests for multiple zipcodes/timezones
- ✅ Tests for edge cases (invalid zipcodes, missing data)

## Adding New Tests

When adding new tests:

1. **Unit tests** go in `weather.test.ts` (mock the fetch calls)
2. **Integration tests** go in `weather.integration.test.ts` (real API calls)
3. **Zipcode tests** go in `timezones.test.ts`

Use descriptive test names and group related tests with `describe` blocks.

