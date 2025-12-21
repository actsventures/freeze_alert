import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchNWSForecast, WeatherError } from '../services/weather';

// Mock the global fetch function
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('NWS Weather Service (No Credentials Needed!)', () => {
  beforeEach(() => {
    // Reset mocks before each test
    mockFetch.mockReset();
  });

  it('should fetch overnight low temperature successfully', async () => {
    // Mock the NWS points API response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        properties: {
          forecast: 'https://api.weather.gov/gridpoints/EWX/123,456/forecast',
        },
      }),
    });

    // Mock the NWS forecast API response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        properties: {
          periods: [
            { name: 'Today', temperature: 65, isDaytime: true },
            { name: 'Tonight', temperature: 25, isDaytime: false },
            { name: 'Tomorrow', temperature: 70, isDaytime: true },
          ],
        },
      }),
    });

    const result = await fetchNWSForecast('78701');

    expect(result.overnightLow).toBe(25);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('should handle "Overnight" period name', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        properties: {
          forecast: 'https://api.weather.gov/gridpoints/EWX/123,456/forecast',
        },
      }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        properties: {
          periods: [
            { name: 'This Afternoon', temperature: 65, isDaytime: true },
            { name: 'Overnight', temperature: 22, isDaytime: false },
          ],
        },
      }),
    });

    const result = await fetchNWSForecast('78701');

    expect(result.overnightLow).toBe(22);
  });

  it('should fall back to first non-daytime period if no "Tonight"', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        properties: {
          forecast: 'https://api.weather.gov/gridpoints/EWX/123,456/forecast',
        },
      }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        properties: {
          periods: [
            { name: 'Today', temperature: 65, isDaytime: true },
            { name: 'Monday Night', temperature: 28, isDaytime: false },
          ],
        },
      }),
    });

    const result = await fetchNWSForecast('78701');

    expect(result.overnightLow).toBe(28);
  });

  it('should throw WeatherError when NWS points API fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    await expect(fetchNWSForecast('78701')).rejects.toThrow(WeatherError);

    // Reset and test again
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });
    await expect(fetchNWSForecast('78701')).rejects.toThrow(/NWS points API error/);
  });

  it('should throw WeatherError when NWS forecast API fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        properties: {
          forecast: 'https://api.weather.gov/gridpoints/EWX/123,456/forecast',
        },
      }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
    });

    await expect(fetchNWSForecast('78701')).rejects.toThrow(WeatherError);

    // Reset and test again
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        properties: {
          forecast: 'https://api.weather.gov/gridpoints/EWX/123,456/forecast',
        },
      }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
    });

    await expect(fetchNWSForecast('78701')).rejects.toThrow(/NWS forecast API error/);
  });

  it('should throw WeatherError when temperature is missing', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        properties: {
          forecast: 'https://api.weather.gov/gridpoints/EWX/123,456/forecast',
        },
      }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        properties: {
          periods: [
            { name: 'Tonight', temperature: null, isDaytime: false },
          ],
        },
      }),
    });

    await expect(fetchNWSForecast('78701')).rejects.toThrow(WeatherError);

    // Reset and test again
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        properties: {
          forecast: 'https://api.weather.gov/gridpoints/EWX/123,456/forecast',
        },
      }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        properties: {
          periods: [
            { name: 'Tonight', temperature: null, isDaytime: false },
          ],
        },
      }),
    });

    await expect(fetchNWSForecast('78701')).rejects.toThrow(/Temperature data missing/);
  });

  it('should throw WeatherError when no overnight period found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        properties: {
          forecast: 'https://api.weather.gov/gridpoints/EWX/123,456/forecast',
        },
      }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        properties: {
          periods: [
            { name: 'Today', temperature: 65, isDaytime: true },
            { name: 'Tomorrow', temperature: 70, isDaytime: true },
          ],
        },
      }),
    });

    await expect(fetchNWSForecast('78701')).rejects.toThrow(WeatherError);

    // Reset and test again
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        properties: {
          forecast: 'https://api.weather.gov/gridpoints/EWX/123,456/forecast',
        },
      }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        properties: {
          periods: [
            { name: 'Today', temperature: 65, isDaytime: true },
            { name: 'Tomorrow', temperature: 70, isDaytime: true },
          ],
        },
      }),
    });

    await expect(fetchNWSForecast('78701')).rejects.toThrow(/Could not find overnight forecast/);
  });

  it('should round temperature to nearest integer', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        properties: {
          forecast: 'https://api.weather.gov/gridpoints/EWX/123,456/forecast',
        },
      }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        properties: {
          periods: [
            { name: 'Tonight', temperature: 27.8, isDaytime: false },
          ],
        },
      }),
    });

    const result = await fetchNWSForecast('78701');

    expect(result.overnightLow).toBe(28);
  });
});
