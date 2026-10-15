import { GenerationService } from '../src/trips/generation.service';
import { PlacesService } from '../src/places/places.service';

describe('GenerationService day counting', () => {
  it('counts trip days inclusively and keeps nights as the overnight count', () => {
    const service = new GenerationService({} as any, {} as any, {} as any);
    const start = new Date('2026-10-13');
    const end = new Date('2026-10-15');

    expect((service as any).countTripDays(start, end)).toBe(3);
    expect((service as any).countNights(start, end)).toBe(2);
  });
});

describe('PlacesService candidate sanitization', () => {
  it('accepts malformed names without crashing when matching categories', () => {
    const service = new PlacesService({} as any, { get: () => 'geoapify-key' } as any);
    const result = (service as any).matchesRequestedCategory(
      {
        id: 'test-id',
        name: 42 as any,
        point: { lat: 55.75, lon: 37.62 },
        categories: ['restaurant'],
        description: 'cozy corner',
        priceLevel: 2,
      },
      'FOOD',
    );

    expect(result).toBe(true);
  });

  it('rejects clearly closed venues', () => {
    const service = new PlacesService({} as any, { get: () => 'geoapify-key' } as any);
    const result = (service as any).matchesRequestedCategory(
      {
        id: 'closed-place',
        name: 'Old Cafe',
        point: { lat: 55.75, lon: 37.62 },
        categories: ['catering.restaurant'],
        description: 'former venue',
        openNow: false,
      },
      'FOOD',
    );

    expect(result).toBe(false);
  });
});
