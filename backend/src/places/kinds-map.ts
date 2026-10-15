import { Category } from '@prisma/client';

/**
 * Geoapify использует иерархические категории POI, например
 * "tourism.sights", "catering.restaurant", "entertainment.museum".
 * Внутри приложения у нас остаётся прежняя 8-категорийная модель,
 * поэтому ниже — привязка к ближайшим Geoapify-категориям для поиска.
 */
export const CATEGORY_TO_KINDS: Record<Category, string> = {
  HISTORY: 'tourism.sights,heritage',
  ARCHITECTURE: 'building,man_made',
  CULTURE: 'entertainment.museum,entertainment.culture,education',
  FOOD: 'catering.restaurant,catering.cafe,catering.fast_food',
  NATURE: 'natural,leisure.park,beach',
  ENTERTAINMENT: 'entertainment,entertainment.theme_park,sport',
  SHOPPING: 'commercial,commercial.supermarket,commercial.shopping_mall',
  NIGHTLIFE: 'catering.bar,catering.pub,entertainment',
};

/**
 * Для параметра бюджета мы сохраняем грубую эвристику по категориям,
 * так как Geoapify не даёт единой ценовой модели на все POI.
 */
export const CATEGORY_COST_HEURISTIC: Record<Category, number> = {
  HISTORY: 400,
  ARCHITECTURE: 0,
  CULTURE: 500,
  FOOD: 900,
  NATURE: 0,
  ENTERTAINMENT: 700,
  SHOPPING: 0,
  NIGHTLIFE: 1500,
};

/**
 * Geoapify чаще всего возвращает рейтинг как число, но в некоторых ответах
 * может прийти строка или отсутствовать. Приводим всё к числу.
 */
export function parseRate(rate: unknown): number {
  if (typeof rate === 'number') return rate;
  if (typeof rate === 'string') {
    const parsed = Number.parseFloat(rate);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}
