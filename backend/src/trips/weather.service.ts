import { Injectable, Logger } from '@nestjs/common';

interface WeatherDay {
  date: string;
  precipitationProbability: number;
  weatherCode: number;
  isPoorWeather: boolean;
}

@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);

  async getDailyForecast(
    latitude: number,
    longitude: number,
    _startDate: Date,
  ): Promise<Map<string, WeatherDay>> {
    const forecast = new Map<string, WeatherDay>();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const lastForecastDate = new Date(today);
    lastForecastDate.setDate(lastForecastDate.getDate() + 15);

    if (_startDate > lastForecastDate) return forecast;

    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.search = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      daily: 'precipitation_probability_max,weather_code',
      forecast_days: '16',
      timezone: 'auto',
    }).toString();

    try {
      const response = await fetch(url);
      if (!response.ok) {
        this.logger.warn(`Open-Meteo forecast returned HTTP ${response.status}`);
        return forecast;
      }

      const payload = await response.json();
      const dates: string[] = payload.daily?.time ?? [];
      const precipitation: number[] = payload.daily?.precipitation_probability_max ?? [];
      const codes: number[] = payload.daily?.weather_code ?? [];
      for (let index = 0; index < dates.length; index++) {
        const probability = Number(precipitation[index] ?? 0);
        const weatherCode = Number(codes[index] ?? 0);
        forecast.set(dates[index], {
          date: dates[index],
          precipitationProbability: probability,
          weatherCode,
          isPoorWeather: probability >= 50 || [51, 53, 55, 61, 63, 65, 71, 73, 75, 80, 81, 82, 95, 96, 99].includes(weatherCode),
        });
      }
    } catch (error) {
      this.logger.warn(`Open-Meteo forecast unavailable: ${(error as Error).message}`);
    }

    return forecast;
  }
}