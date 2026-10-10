import { Injectable } from '@nestjs/common';
import { Category, Place } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';

/**
 * Подменяет настоящий PlacesService в e2e-тестах: вместо похода в Geoapify
 * создаёт по 2 детерминированных места на каждую категорию прямо в тестовой
 * БД. Это даёт реальным Activity/TripDay что-то осмысленное для пересчёта
 * расписания и бюджета, но не делает тесты зависимыми от внешнего API,
 * сети и квоты ключа.
 */
@Injectable()
export class FakePlacesService {
  constructor(private prisma: PrismaService) {}

  async geocodeCity(city: string) {
    if (city.trim().toLowerCase() === 'nowhere-unknown-city') {
      return null;
    }
    return { lat: 55.75, lon: 37.62, country: 'Test Country' };
  }

  async fetchAndCachePlaces(
    city: string,
    _point: { lat: number; lon: number },
    categories: Category[],
    perCategoryLimit: number,
  ): Promise<{ category: Category; places: Place[] }[]> {
    const result: { category: Category; places: Place[] }[] = [];

    for (const category of categories) {
      const places: Place[] = [];
      // 6, а не 2 — чтобы в сгенерированном путешествии реально заполнялось
      // больше одного дня, и e2e-тесты reorder/бюджета не зависели от
      // точной арифметики распределения мест по дням в generation.service.
      const count = Math.min(6, perCategoryLimit);
      for (let i = 0; i < count; i++) {
        const externalId = `fake-${category}-${i}`;
        const place = await this.prisma.place.upsert({
          where: { source_externalId: { source: 'fake-test', externalId } },
          update: {},
          create: {
            source: 'fake-test',
            externalId,
            name: `${category} place ${i} in ${city}`,
            city,
            category,
            latitude: 55.75 + i * 0.001,
            longitude: 37.62 + i * 0.001,
            rating: 2,
            // разные цены по индексу — нужно для теста budget.optimize(),
            // чтобы было из чего выбирать более дешёвую альтернативу
            avgCost: 200 + i * 300,
          },
        });
        places.push(place);
      }
      result.push({ category, places });
    }

    return result;
  }
}
