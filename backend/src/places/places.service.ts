import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Category, Place } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CATEGORY_COST_HEURISTIC, CATEGORY_TO_KINDS, parseRate } from './kinds-map';

const BASE_URL = 'https://api.geoapify.com/v2';
const REQUEST_GAP_MS = 250;
const KNOWN_NIGHTLIFE_NAMES = ['телега'];

interface GeoPoint {
  lat: number;
  lon: number;
  country?: string;
}

interface RawSearchResult {
  id: string;
  name: string;
  point: { lat: number; lon: number };
  rate?: number | string;
  preview?: { source?: string };
  description?: string | null;
  address?: Record<string, string>;
  categories?: string[];
  priceLevel?: number | string;
}

interface RawPlaceDetails {
  id: string;
  name: string;
  point: { lat: number; lon: number };
  rate?: number | string;
  preview?: { source?: string };
  description?: string | null;
  address?: Record<string, string>;
  categories?: string[];
  priceLevel?: number | string;
}

@Injectable()
export class PlacesService {
  private readonly logger = new Logger(PlacesService.name);
  private readonly apiKey: string | undefined;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    this.apiKey = this.config.get<string>('GEOAPIFY_API_KEY');
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private estimateAverageCost(category: Category, priceLevel: number | string | undefined): number | null {
    const parsedLevel = typeof priceLevel === 'number' ? priceLevel : Number.parseFloat(String(priceLevel ?? ''));
    if (!Number.isFinite(parsedLevel) || parsedLevel <= 0) return null;
    const baseCost = CATEGORY_COST_HEURISTIC[category] ?? 0;
    return Math.round(baseCost * Math.min(4, parsedLevel) / 2);
  }

  private assertApiKey() {
    if (!this.apiKey) {
      throw new Error(
        'GEOAPIFY_API_KEY не задан в .env — зарегистрируйте ключ на myprojects.geoapify.com',
      );
    }
  }

  async geocodeCity(city: string): Promise<GeoPoint | null> {
    this.assertApiKey();
    const url = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(city)}&limit=1&apiKey=${this.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      this.logger.warn(`geocode(${city}) -> HTTP ${res.status}`);
      return null;
    }

    const data = await res.json();
    const feature = Array.isArray(data.features) ? data.features[0] : null;
    const properties = feature?.properties ?? {};
    const coordinates = Array.isArray(feature?.geometry?.coordinates) ? feature.geometry.coordinates : null;

    if (!coordinates || typeof coordinates[0] !== 'number' || typeof coordinates[1] !== 'number') {
      return null;
    }

    return {
      lat: coordinates[1],
      lon: coordinates[0],
      country: properties.country ?? undefined,
    };
  }

  private async searchByCategory(
    point: GeoPoint,
    category: Category,
    limit: number,
  ): Promise<RawSearchResult[]> {
    this.assertApiKey();
    const kinds = CATEGORY_TO_KINDS[category];
    const params = new URLSearchParams({
      categories: kinds,
      filter: `circle:${point.lon},${point.lat},8000`,
      limit: String(limit),
      apiKey: this.apiKey!,
    });
    const url = `${BASE_URL}/places?${params.toString()}`;

    const res = await fetch(url);
    if (!res.ok) {
      const errorBody = await res.text();
      this.logger.warn(`places(${category}) -> HTTP ${res.status}: ${errorBody.slice(0, 300)}`);
      return [];
    }

    const data = await res.json();
    const features = Array.isArray(data.features) ? data.features : [];

    return features.map((feature) => {
      const properties = feature.properties ?? {};
      const coordinates = Array.isArray(feature.geometry?.coordinates)
        ? feature.geometry.coordinates
        : [point.lon, point.lat];

      const lon = typeof coordinates[0] === 'number' ? coordinates[0] : point.lon;
      const lat = typeof coordinates[1] === 'number' ? coordinates[1] : point.lat;

      return {
        id: properties.place_id ?? `${properties.name ?? 'geoapify'}-${lon}-${lat}`,
        name: properties.name ?? 'Unnamed place',
        point: { lat, lon },
        rate: properties.rating,
        preview: properties.datasource?.raw?.image
          ? { source: properties.datasource.raw.image }
          : undefined,
        description: properties.datasource?.raw?.description ?? properties.formatted ?? null,
        address: properties.formatted ? { formatted: properties.formatted } : undefined,
        categories: Array.isArray(properties.categories) ? properties.categories : [],
        priceLevel: properties.price_level ?? properties.datasource?.raw?.price_level,
      };
    });
  }

  /**
   * Ищет места по каждой выбранной категории, забирает подробности
   * только для нужного количества (perCategoryLimit), чтобы не делать
   * сотни дорогих подробных запросов на большой город.
   */
  async fetchAndCachePlaces(
    city: string,
    point: GeoPoint,
    categories: Category[],
    perCategoryLimit: number,
  ): Promise<{ category: Category; places: Place[] }[]> {
    const result: { category: Category; places: Place[] }[] = [];
    const usedExternalIds = new Set<string>();
    const usedNamesAndCoordinates = new Set<string>();

    for (const category of categories) {
      const candidates = await this.searchByCategory(point, category, perCategoryLimit * 3);
      await this.sleep(REQUEST_GAP_MS);

      const ranked = candidates
        .filter((candidate) => this.matchesRequestedCategory(candidate, category))
        .map((c) => ({ ...c, _rate: parseRate(c.rate) }))
        .sort((a, b) => b._rate - a._rate)
        .slice(0, perCategoryLimit * 3);

      for (let index = ranked.length - 1; index > 0; index--) {
        const randomIndex = Math.floor(Math.random() * (index + 1));
        [ranked[index], ranked[randomIndex]] = [ranked[randomIndex], ranked[index]];
      }

      const sorted = ranked
        .filter((candidate) => {
          const coordinateKey = `${candidate.name.trim().toLowerCase()}|${candidate.point.lat.toFixed(5)}|${candidate.point.lon.toFixed(5)}`;
          if (usedExternalIds.has(candidate.id) || usedNamesAndCoordinates.has(coordinateKey)) return false;
          usedExternalIds.add(candidate.id);
          usedNamesAndCoordinates.add(coordinateKey);
          return true;
        })
        .slice(0, perCategoryLimit);

      const places: Place[] = [];
      for (const candidate of sorted) {
        const saved = await this.upsertPlace(city, category, candidate as RawPlaceDetails);
        places.push(saved);
      }

      result.push({ category, places });
    }

    return result;
  }

  private matchesRequestedCategory(candidate: RawSearchResult, requested: Category): boolean {
    const categories = (candidate.categories ?? []).map((value) => value.toLowerCase());
    const name = candidate.name.toLowerCase();
    const searchableText = [
      candidate.name,
      candidate.description ?? '',
      candidate.address?.formatted ?? '',
      ...categories,
    ].join(' ').toLowerCase();
    const unnamed = !name || name === 'unnamed place';
    const pathObject = categories.some((value) =>
      value.includes('path') || value.includes('footway') || value.includes('track') || value.includes('route'),
    );
    const nightlifeHint = /(bar|pub|club|nightclub|lounge|disco|караоке|бар|клуб|ночн|дискотек|телега)/i.test(searchableText)
      || KNOWN_NIGHTLIFE_NAMES.some((knownName) => name.includes(knownName));
    const nightlifeCategory = categories.some((value) =>
      value.includes('bar') || value.includes('pub') || value.includes('nightclub') || value.includes('nightlife') || value.includes('dance'),
    );

    if (unnamed || (requested === 'NATURE' && pathObject)) return false;
    if (requested === 'FOOD') return !nightlifeHint && !nightlifeCategory;
    if (requested === 'NIGHTLIFE') return nightlifeHint || nightlifeCategory;
    return true;
  }

  private async upsertPlace(city: string, category: Category, details: RawPlaceDetails): Promise<Place> {
    return this.prisma.place.upsert({
      where: { source_externalId: { source: 'geoapify', externalId: details.id } },
      update: {
        name: details.name,
        category,
        latitude: details.point.lat,
        longitude: details.point.lon,
        rating: parseRate(details.rate),
        avgCost: this.estimateAverageCost(category, details.priceLevel),
        imageUrl: details.preview?.source ?? null,
        description: details.description ?? details.address?.formatted ?? null,
      },
      create: {
        source: 'geoapify',
        externalId: details.id,
        name: details.name,
        city,
        category,
        latitude: details.point.lat,
        longitude: details.point.lon,
        rating: parseRate(details.rate),
        avgCost: this.estimateAverageCost(category, details.priceLevel),
        imageUrl: details.preview?.source ?? null,
        description: details.description ?? details.address?.formatted ?? null,
      },
    });
  }
}