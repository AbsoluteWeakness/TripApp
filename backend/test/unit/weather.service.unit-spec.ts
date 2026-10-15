import { Logger } from '@nestjs/common';
import { WeatherService } from '../../src/trips/weather.service';

describe('WeatherService (unit)', () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: jest.Mock;
  let service: WeatherService;

  const daysFromToday = (n: number) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + n);
    return date;
  };

  const forecastResponse = (days: { date: string; probability: number; code: number }[]) => ({
    ok: true,
    status: 200,
    json: async () => ({
      daily: {
        time: days.map((d) => d.date),
        precipitation_probability_max: days.map((d) => d.probability),
        weather_code: days.map((d) => d.code),
      },
    }),
  });

  beforeEach(() => {
    fetchMock = jest.fn();
    (globalThis as any).fetch = fetchMock;
    // сервис пишет warn при сбоях — глушим, чтобы не засорять вывод тестов
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    service = new WeatherService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    (globalThis as any).fetch = originalFetch;
  });

  it('не ходит в сеть, если дата старта дальше окна прогноза (16 дней)', async () => {
    const result = await service.getDailyForecast(38.72, -9.14, daysFromToday(30));

    expect(result.size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('запрашивает прогноз с нужными координатами и на 16 дней', async () => {
    fetchMock.mockResolvedValue(forecastResponse([]));

    await service.getDailyForecast(38.72, -9.14, daysFromToday(3));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get('latitude')).toBe('38.72');
    expect(url.searchParams.get('longitude')).toBe('-9.14');
    expect(url.searchParams.get('forecast_days')).toBe('16');
    expect(url.searchParams.get('daily')).toBe('precipitation_probability_max,weather_code');
  });

  describe('граница по вероятности осадков', () => {
    it('49% при ясном небе — не плохая погода', async () => {
      fetchMock.mockResolvedValue(forecastResponse([{ date: '2026-10-20', probability: 49, code: 0 }]));

      const result = await service.getDailyForecast(0, 0, daysFromToday(3));

      expect(result.get('2026-10-20')?.isPoorWeather).toBe(false);
    });

    it('ровно 50% — уже плохая погода', async () => {
      fetchMock.mockResolvedValue(forecastResponse([{ date: '2026-10-20', probability: 50, code: 0 }]));

      const result = await service.getDailyForecast(0, 0, daysFromToday(3));

      expect(result.get('2026-10-20')?.isPoorWeather).toBe(true);
    });
  });

  describe('коды погоды', () => {
    it.each([51, 53, 55, 61, 63, 65, 71, 73, 75, 80, 81, 82, 95, 96, 99])(
      'код %i — плохая погода, даже если вероятность осадков 0%',
      async (code) => {
        fetchMock.mockResolvedValue(forecastResponse([{ date: '2026-10-20', probability: 0, code }]));

        const result = await service.getDailyForecast(0, 0, daysFromToday(3));

        expect(result.get('2026-10-20')?.isPoorWeather).toBe(true);
      },
    );

    it.each([0, 1, 2, 3])('код %i (ясно/облачно) — не плохая погода', async (code) => {
      fetchMock.mockResolvedValue(forecastResponse([{ date: '2026-10-20', probability: 10, code }]));

      const result = await service.getDailyForecast(0, 0, daysFromToday(3));

      expect(result.get('2026-10-20')?.isPoorWeather).toBe(false);
    });
  });

  it('раскладывает несколько дней по датам', async () => {
    fetchMock.mockResolvedValue(
      forecastResponse([
        { date: '2026-10-20', probability: 80, code: 61 },
        { date: '2026-10-21', probability: 5, code: 0 },
      ]),
    );

    const result = await service.getDailyForecast(0, 0, daysFromToday(3));

    expect(result.size).toBe(2);
    expect(result.get('2026-10-20')).toMatchObject({ precipitationProbability: 80, weatherCode: 61, isPoorWeather: true });
    expect(result.get('2026-10-21')).toMatchObject({ precipitationProbability: 5, weatherCode: 0, isPoorWeather: false });
  });

  describe('устойчивость к сбоям — прогноз никогда не должен ронять генерацию', () => {
    it('HTTP-ошибка API → пустой прогноз', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });

      const result = await service.getDailyForecast(0, 0, daysFromToday(3));

      expect(result.size).toBe(0);
    });

    it('сеть недоступна (fetch бросает) → пустой прогноз', async () => {
      fetchMock.mockRejectedValue(new Error('network down'));

      const result = await service.getDailyForecast(0, 0, daysFromToday(3));

      expect(result.size).toBe(0);
    });

    it('в ответе нет поля daily → пустой прогноз', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });

      const result = await service.getDailyForecast(0, 0, daysFromToday(3));

      expect(result.size).toBe(0);
    });

    it('массивы осадков/кодов короче списка дат → недостающее считается нулём', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          daily: { time: ['2026-10-20', '2026-10-21'], precipitation_probability_max: [70], weather_code: [] },
        }),
      });

      const result = await service.getDailyForecast(0, 0, daysFromToday(3));

      expect(result.get('2026-10-20')?.isPoorWeather).toBe(true);
      expect(result.get('2026-10-21')).toMatchObject({ precipitationProbability: 0, weatherCode: 0, isPoorWeather: false });
    });
  });
});
