import { Injectable } from '@nestjs/common';

interface FakeWeatherDay {
  date: string;
  precipitationProbability: number;
  weatherCode: number;
  isPoorWeather: boolean;
}

/**
 * Подменяет WeatherService в e2e: прогноз задаётся тестом, без внешней сети.
 */
@Injectable()
export class FakeWeatherService {
  private readonly forecast = new Map<string, FakeWeatherDay>();

  setDayWeather(date: string, isPoorWeather: boolean): void {
    this.forecast.set(date, {
      date,
      precipitationProbability: isPoorWeather ? 100 : 0,
      weatherCode: isPoorWeather ? 61 : 0,
      isPoorWeather,
    });
  }

  reset(): void {
    this.forecast.clear();
  }

  async getDailyForecast(): Promise<Map<string, FakeWeatherDay>> {
    return new Map(this.forecast);
  }
}
