import { Injectable } from '@nestjs/common';

/**
 * Подменяет WeatherService в e2e: всегда отдаёт пустой прогноз, то есть
 * ветка "плохая погода → меняем прогулки на музеи" в generation.service
 * никогда не срабатывает. Это осознанный выбор — тесты на выбор
 * активностей/расписание должны быть детерминированными и не зависеть
 * от того, какая погода в тестовом городе сегодня по Open-Meteo.
 * Саму погодную логику стоит тестировать отдельно, юнит-тестом на
 * чистую функцию выбора (без реальной сети).
 */
@Injectable()
export class FakeWeatherService {
  async getDailyForecast(): Promise<Map<string, never>> {
    return new Map<string, never>();
  }
}
