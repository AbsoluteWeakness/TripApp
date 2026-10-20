import { Injectable, Logger } from '@nestjs/common';
import { Category, Pace } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PlacesService } from '../places/places.service';
import { WeatherService } from './weather.service';
import { CATEGORY_COST_HEURISTIC } from '../places/kinds-map';
import { distributeItemsAcrossDays } from './distribute-days';

const DAY_START_MINUTES = 9 * 60; // 09:00
const WALKING_SPEED_KMH = 4.5;
const CITY_ROUTE_DETOUR_FACTOR = 1.25;
const CENTRAL_START_RADIUS_KM = 4;

const ACTIVITIES_PER_DAY: Record<Pace, number> = {
  RELAXED: 4,
  MEDIUM: 6,
  INTENSE: 8,
};

const CATEGORY_WEIGHT: Record<Category, number> = {
  HISTORY: 1,
  ARCHITECTURE: 1,
  CULTURE: 1,
  FOOD: 1,
  NATURE: 1,
  ENTERTAINMENT: 1,
  SHOPPING: 1,
  NIGHTLIFE: 1,
};

// Длительность посещения по категории — тоже эвристика (см. kinds-map.ts
// для того же по деньгам): музей — дольше, смотровая площадка — короче.
const CATEGORY_DURATION_MINUTES: Record<Category, number> = {
  HISTORY: 60,
  ARCHITECTURE: 40,
  CULTURE: 90,
  FOOD: 60,
  NATURE: 50,
  ENTERTAINMENT: 90,
  SHOPPING: 70,
  NIGHTLIFE: 100,
};

@Injectable()
export class GenerationService {
  private readonly logger = new Logger(GenerationService.name);

  constructor(
    private prisma: PrismaService,
    private places: PlacesService,
    private weather: WeatherService,
  ) {}

  private countNights(startDate: Date, endDate: Date): number {
    const ms = endDate.getTime() - startDate.getTime();
    const diffDays = Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
    return Math.max(1, diffDays);
  }

  private countTripDays(startDate: Date, endDate: Date): number {
    const ms = endDate.getTime() - startDate.getTime();
    const diffDays = Math.max(0, Math.floor(ms / (1000 * 60 * 60 * 24)));
    return Math.max(1, diffDays + 1);
  }

  private async setStep(tripId: string, currentStep: string) {
    await this.prisma.trip.update({ where: { id: tripId }, data: { currentStep } });
  }

  private distanceKm(
    first: { latitude: number; longitude: number },
    second: { latitude: number; longitude: number },
  ): number {
    const earthRadiusKm = 6371;
    const latitudeDelta = ((second.latitude - first.latitude) * Math.PI) / 180;
    const longitudeDelta = ((second.longitude - first.longitude) * Math.PI) / 180;
    const firstLatitude = (first.latitude * Math.PI) / 180;
    const secondLatitude = (second.latitude * Math.PI) / 180;
    const arc = Math.sin(latitudeDelta / 2) ** 2
      + Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;

    return earthRadiusKm * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc));
  }

  private walkingMinutes(
    first: { latitude: number; longitude: number },
    second: { latitude: number; longitude: number },
  ): number {
    const walkingDistanceKm = this.distanceKm(first, second) * CITY_ROUTE_DETOUR_FACTOR;
    return Math.max(5, Math.round((walkingDistanceKm / WALKING_SPEED_KMH) * 60));
  }

  private placeFingerprint(place: { name?: unknown; latitude?: number; longitude?: number }): string {
    const rawName = typeof place?.name === 'string' ? place.name : String(place?.name ?? '');
    return `${rawName.trim().toLowerCase()}|${Number(place?.latitude ?? 0).toFixed(5)}|${Number(place?.longitude ?? 0).toFixed(5)}`;
  }

  private orderByWalkingDistance<T extends { place: { latitude: number; longitude: number } }>(
    items: T[],
    origin: { latitude: number; longitude: number },
  ): T[] {
    if (items.length <= 1) return [...items];

    const centralItems = items.filter(
      (item) => this.distanceKm(origin, item.place) <= CENTRAL_START_RADIUS_KM,
    );
    const startCandidates = centralItems.length ? centralItems : items;
    const first = startCandidates[Math.floor(Math.random() * startCandidates.length)];
    const remaining = items.filter((item) => item !== first);
    const ordered: T[] = [];
    ordered.push(first);
    let current = first.place;

    while (remaining.length > 0) {
      let nearestIndex = 0;
      let nearestDistance = Number.POSITIVE_INFINITY;

      remaining.forEach((item, index) => {
        const distance = this.distanceKm(current, item.place);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      });

      const [nearest] = remaining.splice(nearestIndex, 1);
      ordered.push(nearest);
      current = nearest.place;
    }

    return ordered;
  }

  async generateForTrip(tripId: string): Promise<void> {
    const trip = await this.prisma.trip.findUniqueOrThrow({
      where: { id: tripId },
      include: { preferences: true },
    });

    await this.prisma.trip.update({
      where: { id: tripId },
      data: { status: 'GENERATING', currentStep: 'Получаем информацию о городе' },
    });

    try {
      const point = await this.places.geocodeCity(trip.city);
      if (!point) {
        throw new Error(`Не удалось найти город «${trip.city}»`);
      }
      await this.prisma.trip.update({
        where: { id: tripId },
        data: {
          latitude: point.lat,
          longitude: point.lon,
          country: trip.country ?? point.country ?? null,
        },
      });

      await this.setStep(tripId, 'Подбираем места');
      const categories = trip.preferences.map((p) => p.category);
      const tripDays = this.countTripDays(trip.startDate, trip.endDate);
      const nights = this.countNights(trip.startDate, trip.endDate);
      const perDay = ACTIVITIES_PER_DAY[trip.pace];
      const forecast = await this.weather.getDailyForecast(point.lat, point.lon, trip.startDate);
      const totalNeeded = tripDays * perDay;
      // берём с запасом по каждой категории — часть отсеется бюджетом/дублями
      const perCategoryLimit = Math.max(3, Math.ceil((totalNeeded * 1.3) / Math.max(1, categories.length)));

      const byCategory = await this.places.fetchAndCachePlaces(
        trip.city,
        point,
        categories.length ? categories : ['CULTURE'],
        perCategoryLimit,
      );

      const selectedGroups = byCategory.filter((group) => group.places.length > 0);
      const categoryLimit = Math.max(1, Math.ceil(totalNeeded / Math.max(1, selectedGroups.length)));
      const categoryCounts = new Map<Category, number>();
      const pool: { category: Category; place: (typeof byCategory)[number]['places'][number] }[] = [];

      for (let round = 0; pool.length < totalNeeded && round < categoryLimit; round++) {
        for (const group of selectedGroups) {
          if (pool.length >= totalNeeded) break;
          const place = group.places[round];
          if (!place) continue;
          pool.push({ category: group.category, place });
          categoryCounts.set(group.category, (categoryCounts.get(group.category) ?? 0) + 1);
        }
      }

      if (pool.length < totalNeeded) {
        for (const group of byCategory) {
          for (const place of group.places) {
            if (pool.length >= totalNeeded) break;
            if (!pool.some((item) => item.place.id === place.id)) {
              pool.push({ category: group.category, place });
            }
          }
        }
      }

      const uniquePool = pool.filter((item, index, items) => {
        const key = this.placeFingerprint(item.place);
        return items.findIndex((candidate) => this.placeFingerprint(candidate.place) === key) === index;
      });

      await this.setStep(tripId, 'Оптимизируем маршрут');
      // TODO: здесь по-хорошему должна быть настоящая оптимизация порядка
      // посещения по расстоянию (например, ближайший сосед / 2-opt).
      // Пока порядок внутри дня — как пришло из pool (по рейтингу/категории).

      await this.prisma.tripDay.deleteMany({ where: { tripId } });

      // Раскладка по дням без дублей: учитывает плохую погоду и помнит уже
      // занятые места (см. distribute-days.ts)
      const poorWeatherByDay = Array.from({ length: tripDays }, (_, index) => {
      const date = new Date(trip.startDate);
      date.setDate(date.getDate() + index);
      return forecast.get(date.toISOString().slice(0, 10))?.isPoorWeather ?? false;
      });
      const selectionByDay = distributeItemsAcrossDays(uniquePool, perDay, poorWeatherByDay);

      for (let dayNumber = 1; dayNumber <= tripDays; dayNumber++) {
        const date = new Date(trip.startDate);
        date.setDate(date.getDate() + (dayNumber - 1));

        const day = await this.prisma.tripDay.create({ data: { tripId, dayNumber, date } });

        const dayItems = this.orderByWalkingDistance(
          selectionByDay[dayNumber - 1],
          { latitude: point.lat, longitude: point.lon },
        );

        let minutesCursor = DAY_START_MINUTES;
        for (let idx = 0; idx < dayItems.length; idx++) {
          const { category, place } = dayItems[idx];
          const duration = CATEGORY_DURATION_MINUTES[category] ?? 60;
          const travel = idx < dayItems.length - 1
            ? this.walkingMinutes(dayItems[idx].place, dayItems[idx + 1].place)
            : 0;
          const averageCheck = Math.round(
            Number(trip.budget) / Math.max(1, nights * 3 * Math.max(1, Number(trip.travelers))),
          );
          const heuristicCost = CATEGORY_COST_HEURISTIC[category] ?? 0;
          const cost = category === 'FOOD'
            ? Math.min(averageCheck, 1500)
            : Math.min(averageCheck, Math.max(0, heuristicCost));

          const start = new Date(date);
          start.setHours(0, minutesCursor, 0, 0);
          const end = new Date(start.getTime() + duration * 60_000);

          await this.prisma.activity.create({
            data: {
              tripDayId: day.id,
              placeId: place.id,
              orderIndex: idx,
              startTime: start,
              endTime: end,
              durationMinutes: duration,
              travelToNextMinutes: travel,
              cost,
            },
          });

          minutesCursor += duration + travel;
        }
      }

      if (forecast.size > 0) {
        await this.setStep(tripId, 'Погода учтена в маршруте');
      }

      await this.setStep(tripId, 'Рассчитываем бюджет');
      const activities = await this.prisma.activity.findMany({
        where: { tripDay: { tripId } },
      });
      const estimatedSpend = activities.reduce((sum, a) => sum + Number(a.cost), 0);

      await this.setStep(tripId, 'Формируем описание');
      // TODO: сюда встанет вызов AI-модуля (см. assistant/) — персонализация
      // описаний по месту вместо голых данных из OpenTripMap.

      await this.prisma.trip.update({
        where: { id: tripId },
        data: { status: 'READY', currentStep: null, estimatedSpend },
      });
    } catch (err) {
      this.logger.error(`Генерация путешествия ${tripId} упала: ${(err as Error).message}`);
      // updateMany не бросает, если путешествие уже удалили во время генерации
      await this.prisma.trip.updateMany({
        where: { id: tripId },
        data: { status: 'FAILED', currentStep: null },
      });
    }
  }

  async regenerateDay(tripId: string, dayNumber: number): Promise<void> {
    const trip = await this.prisma.trip.findUniqueOrThrow({
      where: { id: tripId },
      include: {
        preferences: true,
        days: { include: { activities: true } },
      },
    });
    const day = trip.days.find((item) => item.dayNumber === dayNumber);
    if (!day) throw new Error(`День ${dayNumber} не найден`);

    const point = trip.latitude !== null && trip.longitude !== null
      ? { lat: trip.latitude, lon: trip.longitude }
      : await this.places.geocodeCity(trip.city);
    if (!point) throw new Error(`Не удалось определить координаты города «${trip.city}»`);

    const categories = trip.preferences.map((preference) => preference.category);
    const selectedCategories: Category[] = categories.length ? categories : ['CULTURE'];
    const perDay = ACTIVITIES_PER_DAY[trip.pace];
    const byCategory = await this.places.fetchAndCachePlaces(
      trip.city,
      point,
      selectedCategories,
      Math.max(3, perDay * 2),
    );
    const usedByOtherDays = new Set(
      trip.days
        .filter((item) => item.id !== day.id)
        .flatMap((item) => item.activities.map((activity) => activity.placeId)),
    );
    const candidates = byCategory.flatMap((group) =>
      group.places
        .filter((place) => !usedByOtherDays.has(place.id))
        .map((place) => ({ category: group.category, place })),
    );
    const uniqueCandidates = candidates.filter(
      (item, index, items) => items.findIndex((candidate) => candidate.place.id === item.place.id) === index,
    );
    const dayItems = this.orderByWalkingDistance(
      uniqueCandidates.slice(0, perDay),
      { latitude: point.lat, longitude: point.lon },
    );

    await this.prisma.activity.deleteMany({ where: { tripDayId: day.id } });

    let minutesCursor = DAY_START_MINUTES;
    for (let index = 0; index < dayItems.length; index++) {
      const { category, place } = dayItems[index];
      const duration = CATEGORY_DURATION_MINUTES[category] ?? 60;
      const travel = index < dayItems.length - 1
        ? this.walkingMinutes(dayItems[index].place, dayItems[index + 1].place)
        : 0;
      const averageCheck = Math.round(
        Number(trip.budget) / Math.max(1, this.countNights(trip.startDate, trip.endDate) * 3 * Math.max(1, trip.travelers)),
      );
      const heuristicCost = CATEGORY_COST_HEURISTIC[category] ?? 0;
      const cost = category === 'FOOD'
        ? Math.min(averageCheck, 1500)
        : Math.min(averageCheck, Math.max(0, heuristicCost));
      const start = new Date(day.date);
      start.setHours(0, minutesCursor, 0, 0);
      const end = new Date(start.getTime() + duration * 60_000);

      await this.prisma.activity.create({
        data: {
          tripDayId: day.id,
          placeId: place.id,
          orderIndex: index,
          startTime: start,
          endTime: end,
          durationMinutes: duration,
          travelToNextMinutes: travel,
          cost,
        },
      });
      minutesCursor += duration + travel;
    }

    const activities = await this.prisma.activity.findMany({ where: { tripDay: { tripId } } });
    const estimatedSpend = activities.reduce((sum, activity) => sum + Number(activity.cost), 0);
    await this.prisma.trip.update({ where: { id: tripId }, data: { estimatedSpend } });
  }
}
