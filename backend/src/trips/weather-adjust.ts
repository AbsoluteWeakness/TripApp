import { Category } from '@prisma/client';

/**
 * Категории, которые не зависят от погоды: именно ими заменяем прогулки
 * в плохую погоду. HISTORY/ARCHITECTURE/NIGHTLIFE сюда сознательно не
 * входят — это продуктовое решение, при желании меняется одной строкой.
 */
export const INDOOR_CATEGORIES: Category[] = ['CULTURE', 'FOOD', 'SHOPPING', 'ENTERTAINMENT'];

/** Категории, которые в плохую погоду заменяем. */
export const WEATHER_SENSITIVE_CATEGORIES: Category[] = ['NATURE'];

export interface DayItem<TPlace extends { id: string }> {
  category: Category;
  place: TPlace;
}

/**
 * Чистая функция: заменяет уличные активности дня (NATURE) на закрытые
 * из пула. Поведение 1-в-1 как раньше было внутри generation.service.
 *
 * - день и пул не мутируются, возвращается новый массив;
 * - уличные активности уходят в конец списка, и замены встают на их места;
 * - в замену идут только INDOOR_CATEGORIES и только те места, которых нет
 *   в этом дне и в excludePlaceIds (например, места, уже занятые в других
 *   днях поездки);
 * - если замен меньше, чем прогулок, оставшиеся прогулки остаются;
 * - количество активностей в дне не меняется.
 */
export function adjustDayForPoorWeather<TPlace extends { id: string }>(
  dayItems: DayItem<TPlace>[],
  pool: DayItem<TPlace>[],
  excludePlaceIds: ReadonlySet<string> = new Set(),
): DayItem<TPlace>[] {
  const selectedIds = new Set(dayItems.map(({ place }) => place.id));

  const replacements = pool.filter(
    ({ category, place }) =>
      INDOOR_CATEGORIES.includes(category) &&
      !selectedIds.has(place.id) &&
      !excludePlaceIds.has(place.id),
  );

  const result = dayItems
    .map((item) => ({ item, priority: WEATHER_SENSITIVE_CATEGORIES.includes(item.category) ? 1 : 0 }))
    .sort((first, second) => first.priority - second.priority)
    .map(({ item }) => item);

  for (const replacement of replacements) {
    const outdoorIndex = result.findIndex(({ category }) => WEATHER_SENSITIVE_CATEGORIES.includes(category));
    if (outdoorIndex < 0) break;
    result[outdoorIndex] = replacement;
  }

  return result;
}
