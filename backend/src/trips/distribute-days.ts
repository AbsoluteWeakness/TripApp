import { adjustDayForPoorWeather, DayItem } from './weather-adjust';

/**
 * Раскладывает пул мест по дням поездки. Чистая функция.
 *
 * Раньше дни резались из пула по курсору, а замена прогулок в плохую
 * погоду брала кандидатов из ВСЕГО пула — и одно место могло оказаться
 * в двух днях (как замена в одном и как обычный срез в другом).
 * Теперь каждый день берёт места только из ещё не занятых, а занятые
 * запоминаются. Если плохой погоды нет, результат тот же, что у срезов
 * по курсору: день 1 — первые perDay мест, день 2 — следующие и т.д.
 *
 * @param pool              уникальные места (без дублей по id)
 * @param perDay            сколько активностей в день
 * @param poorWeatherByDay  по элементу на каждый день: плохая ли в нём погода
 * @returns                 по массиву мест на каждый день
 */
export function distributeItemsAcrossDays<TPlace extends { id: string }>(
  pool: DayItem<TPlace>[],
  perDay: number,
  poorWeatherByDay: boolean[],
): DayItem<TPlace>[][] {
  const usedPlaceIds = new Set<string>();

  return poorWeatherByDay.map((isPoorWeather) => {
    const remaining = pool.filter(({ place }) => !usedPlaceIds.has(place.id));
    const baseSelection = remaining.slice(0, perDay);
    const selection = isPoorWeather ? adjustDayForPoorWeather(baseSelection, remaining) : baseSelection;

    selection.forEach(({ place }) => usedPlaceIds.add(place.id));
    return selection;
  });
}

export function selectBalancedDayItems<TCategory extends string, TPlace extends { id: string }>(
  groups: { category: TCategory; places: TPlace[] }[],
  limit: number,
  excludedPlaceIds: ReadonlySet<string> = new Set(),
): { category: TCategory; place: TPlace }[] {
  const selected: { category: TCategory; place: TPlace }[] = [];
  const selectedPlaceIds = new Set(excludedPlaceIds);
  const eligibleGroups = groups.map((group) => ({
    category: group.category,
    places: group.places.filter((place) => !selectedPlaceIds.has(place.id)),
  }));

  for (let round = 0; selected.length < limit; round++) {
    let addedInRound = false;

    for (const group of eligibleGroups) {
      const place = group.places[round];
      if (!place || selectedPlaceIds.has(place.id)) continue;

      selected.push({ category: group.category, place });
      selectedPlaceIds.add(place.id);
      addedInRound = true;
      if (selected.length >= limit) break;
    }

    if (!addedInRound) break;
  }

  return selected;
}
