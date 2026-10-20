import { Category } from '@prisma/client';
import { adjustDayForPoorWeather, DayItem } from '../../src/trips/weather-adjust';

type Place = { id: string };

const item = (id: string, category: Category): DayItem<Place> => ({ category, place: { id } });
const ids = (items: DayItem<Place>[]) => items.map(({ place }) => place.id);
const categories = (items: DayItem<Place>[]) => items.map(({ category }) => category);

describe('adjustDayForPoorWeather (unit)', () => {
  it('заменяет прогулку на закрытое место из пула', () => {
    const day = [item('a', 'HISTORY'), item('n1', 'NATURE')];
    const pool = [...day, item('m1', 'CULTURE')];

    const result = adjustDayForPoorWeather(day, pool);

    expect(ids(result)).toEqual(['a', 'm1']);
  });

  it('не меняет количество активностей в дне', () => {
    const day = [item('a', 'HISTORY'), item('n1', 'NATURE'), item('n2', 'NATURE')];
    const pool = [item('m1', 'CULTURE'), item('f1', 'FOOD'), item('s1', 'SHOPPING')];

    expect(adjustDayForPoorWeather(day, pool)).toHaveLength(day.length);
  });

  it('день без прогулок остаётся как был, в том же порядке', () => {
    const day = [item('a', 'HISTORY'), item('b', 'FOOD'), item('c', 'CULTURE')];
    const pool = [...day, item('m1', 'ENTERTAINMENT')];

    expect(ids(adjustDayForPoorWeather(day, pool))).toEqual(['a', 'b', 'c']);
  });

  it('заменяет только NATURE — HISTORY и ARCHITECTURE считаются независимыми от погоды', () => {
    const day = [item('h1', 'HISTORY'), item('ar1', 'ARCHITECTURE'), item('n1', 'NATURE')];
    const pool = [item('m1', 'CULTURE')];

    const result = adjustDayForPoorWeather(day, pool);

    expect(ids(result)).toEqual(['h1', 'ar1', 'm1']);
  });

  it('в замену берёт только CULTURE/FOOD/SHOPPING/ENTERTAINMENT', () => {
    const day = [item('n1', 'NATURE')];
    const pool = [
      item('h1', 'HISTORY'),
      item('ar1', 'ARCHITECTURE'),
      item('nl1', 'NIGHTLIFE'),
      item('n2', 'NATURE'),
    ];

    const result = adjustDayForPoorWeather(day, pool);

    // подходящих замен нет — прогулка остаётся
    expect(ids(result)).toEqual(['n1']);
  });

  it.each(['CULTURE', 'FOOD', 'SHOPPING', 'ENTERTAINMENT'] as Category[])(
    'категория %s подходит как замена',
    (category) => {
      const result = adjustDayForPoorWeather([item('n1', 'NATURE')], [item('r1', category)]);

      expect(ids(result)).toEqual(['r1']);
    },
  );

  it('не ставит в замену место, которое уже есть в этом дне', () => {
    const day = [item('m1', 'CULTURE'), item('n1', 'NATURE')];
    const pool = [item('m1', 'CULTURE'), item('m2', 'CULTURE')];

    const result = adjustDayForPoorWeather(day, pool);

    expect(ids(result)).toEqual(['m1', 'm2']);
  });

  it('не использует места из excludePlaceIds (например, занятые в других днях)', () => {
    const day = [item('n1', 'NATURE')];
    const pool = [item('busy', 'CULTURE'), item('free', 'FOOD')];

    const result = adjustDayForPoorWeather(day, pool, new Set(['busy']));

    expect(ids(result)).toEqual(['free']);
  });

  it('одну замену не ставит дважды', () => {
    const day = [item('n1', 'NATURE'), item('n2', 'NATURE')];
    const pool = [item('m1', 'CULTURE')];

    const result = adjustDayForPoorWeather(day, pool);

    expect(new Set(ids(result)).size).toBe(result.length);
  });

  it('если замен меньше, чем прогулок — оставшиеся прогулки остаются', () => {
    const day = [item('a', 'HISTORY'), item('n1', 'NATURE'), item('n2', 'NATURE')];
    const pool = [item('m1', 'CULTURE')];

    const result = adjustDayForPoorWeather(day, pool);

    expect(categories(result)).toEqual(['HISTORY', 'CULTURE', 'NATURE']);
  });

  it('если замен нет вообще — состав дня тот же, прогулки сдвигаются в конец', () => {
    const day = [item('n1', 'NATURE'), item('a', 'HISTORY')];

    const result = adjustDayForPoorWeather(day, []);

    expect(ids(result)).toEqual(['a', 'n1']);
  });

  it('если в пуле только прогулки — день из одних прогулок не меняется', () => {
    const day = [item('n1', 'NATURE'), item('n2', 'NATURE')];
    const pool = [item('n3', 'NATURE')];

    expect(ids(adjustDayForPoorWeather(day, pool))).toEqual(['n1', 'n2']);
  });

  it('не мутирует ни день, ни пул', () => {
    const day = [item('n1', 'NATURE'), item('a', 'HISTORY')];
    const pool = [item('m1', 'CULTURE')];
    const dayBefore = JSON.stringify(day);
    const poolBefore = JSON.stringify(pool);

    adjustDayForPoorWeather(day, pool);

    expect(JSON.stringify(day)).toBe(dayBefore);
    expect(JSON.stringify(pool)).toBe(poolBefore);
  });
});
