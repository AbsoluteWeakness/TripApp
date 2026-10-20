import { Category } from '@prisma/client';
import { DayItem } from '../../src/trips/weather-adjust';
import { distributeItemsAcrossDays } from '../../src/trips/distribute-days';

type Place = { id: string };

const item = (id: string, category: Category): DayItem<Place> => ({ category, place: { id } });
const ids = (items: DayItem<Place>[]) => items.map(({ place }) => place.id);
const allIds = (days: DayItem<Place>[][]) => days.flatMap(ids);

// пул, на котором баг воспроизводился: категории вперемешку, прогулки в первом срезе
const mixedPool = () =>
  (['HISTORY', 'NATURE', 'FOOD', 'NATURE', 'CULTURE', 'HISTORY', 'NATURE', 'SHOPPING', 'FOOD', 'NATURE', 'CULTURE', 'ENTERTAINMENT'] as Category[]).map(
    (category, i) => item('p' + i, category),
  );

describe('distributeItemsAcrossDays (unit)', () => {
  it('без плохой погоды режет пул подряд — как срезы по курсору', () => {
    const pool = mixedPool();

    const days = distributeItemsAcrossDays(pool, 4, [false, false, false]);

    expect(days.map(ids)).toEqual([
      ['p0', 'p1', 'p2', 'p3'],
      ['p4', 'p5', 'p6', 'p7'],
      ['p8', 'p9', 'p10', 'p11'],
    ]);
  });

  it('возвращает по массиву на каждый день', () => {
    expect(distributeItemsAcrossDays(mixedPool(), 4, [false, true, false, false])).toHaveLength(4);
  });

  it('РЕГРЕССИЯ: плохая погода в день 1 не создаёт дублей между днями', () => {
    const days = distributeItemsAcrossDays(mixedPool(), 4, [true, false, false]);

    const everything = allIds(days);
    expect(new Set(everything).size).toBe(everything.length);
  });

  it('плохая погода во всех днях — дублей нет', () => {
    const days = distributeItemsAcrossDays(mixedPool(), 4, [true, true, true]);

    const everything = allIds(days);
    expect(new Set(everything).size).toBe(everything.length);
  });

  it('плохая погода только в последний день — замены не берутся из прошлых дней', () => {
    const days = distributeItemsAcrossDays(mixedPool(), 4, [false, false, true]);

    const everything = allIds(days);
    expect(new Set(everything).size).toBe(everything.length);
  });

  it('в плохой день прогулки заменяются закрытыми местами', () => {
    const days = distributeItemsAcrossDays(mixedPool(), 4, [true, false, false]);

    const day1 = mixedPool().filter(({ place }) => days[0].some((d) => d.place.id === place.id));
    expect(day1.some(({ category }) => category === 'NATURE')).toBe(false);
  });

  it('прогулка, снятая из плохого дня, не пропадает и может попасть в хороший день', () => {
    const pool = [item('n1', 'NATURE'), item('m1', 'CULTURE'), item('m2', 'FOOD'), item('n2', 'NATURE')];

    const days = distributeItemsAcrossDays(pool, 2, [true, false]);

    // день 1: n1 заменена на m2 -> [m1, m2]; n1 вернулась в пул и достаётся дню 2
    expect(ids(days[0])).toEqual(['m1', 'm2']);
    expect(ids(days[1])).toEqual(['n1', 'n2']);
  });

  it('если мест не хватает — последние дни короче, без дублей и без ошибок', () => {
    const pool = [item('a', 'HISTORY'), item('b', 'FOOD'), item('c', 'CULTURE')];

    const days = distributeItemsAcrossDays(pool, 2, [false, false, false]);

    expect(days.map(ids)).toEqual([['a', 'b'], ['c'], []]);
  });

  it('пустой пул — пустые дни', () => {
    expect(distributeItemsAcrossDays([], 4, [false, true])).toEqual([[], []]);
  });

  it('свойство: на любых данных нет дублей, день не длиннее perDay, мест не больше, чем в пуле', () => {
    const categories: Category[] = ['HISTORY', 'ARCHITECTURE', 'CULTURE', 'FOOD', 'NATURE', 'ENTERTAINMENT', 'SHOPPING', 'NIGHTLIFE'];
    let seed = 7;
    const random = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;

    for (let run = 0; run < 2000; run++) {
      const pool = Array.from({ length: Math.floor(random() * 25) }, (_, i) =>
        item('p' + i, categories[Math.floor(random() * categories.length)]),
      );
      const perDay = 1 + Math.floor(random() * 8);
      const poorByDay = Array.from({ length: 1 + Math.floor(random() * 6) }, () => random() < 0.5);

      const days = distributeItemsAcrossDays(pool, perDay, poorByDay);
      const everything = allIds(days);

      expect(new Set(everything).size).toBe(everything.length);
      expect(days.every((day) => day.length <= perDay)).toBe(true);
      expect(everything.length <= pool.length).toBe(true);
    }
  });
});
