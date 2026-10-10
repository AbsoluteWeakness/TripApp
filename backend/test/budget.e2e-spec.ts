import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, cleanDatabase, waitForTripReady } from './utils/test-app';

describe('Budget (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
  });

  it('remaining = budget - сумма cost всех активностей', async () => {
    const authRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'User', email: 'budget@example.com', password: '123456' })
      .expect(201);
    const token = authRes.body.token;

    const start = new Date();
    start.setDate(start.getDate() + 5);
    const end = new Date();
    end.setDate(end.getDate() + 8);

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${token}`)
      .send({
        city: 'Lisbon',
        startDate: start.toISOString().slice(0, 10),
        endDate: end.toISOString().slice(0, 10),
        travelers: 2,
        budget: 30000,
        currency: 'RUB',
        pace: 'MEDIUM',
        categories: ['HISTORY', 'FOOD'],
      })
      .expect(201);

    await waitForTripReady(prisma, createRes.body.id);

    const activities = await prisma.activity.findMany({ where: { tripDay: { tripId: createRes.body.id } } });
    const expectedSpend = activities.reduce((sum, a) => sum + Number(a.cost), 0);

    const budgetRes = await request(app.getHttpServer())
      .get(`/api/v1/trips/${createRes.body.id}/budget`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(budgetRes.body.budget).toBe(30000);
    expect(budgetRes.body.estimatedSpend).toBe(expectedSpend);
    expect(budgetRes.body.remaining).toBe(30000 - expectedSpend);
  });

  /**
   * optimize() читает/меняет реальные Activity/Place в БД — удобнее и
   * надёжнее засеять сценарий напрямую через Prisma, чем гонять через
   * полную генерацию (где цены считаются эвристикой, а не из avgCost).
   */
  async function seedOverBudgetTrip(userId: string, opts: { cheapAvgCost: number }) {
    const start = new Date();
    start.setDate(start.getDate() + 5);

    const trip = await prisma.trip.create({
      data: {
        userId,
        city: 'SeedCity',
        startDate: start,
        endDate: start,
        travelers: 1,
        budget: 1000,
        pace: 'MEDIUM',
        status: 'READY',
      },
    });
    const day = await prisma.tripDay.create({
      data: { tripId: trip.id, dayNumber: 1, date: start },
    });

    const expensivePlaceA = await prisma.place.create({
      data: { name: 'Expensive A', city: 'SeedCity', category: 'HISTORY', latitude: 0, longitude: 0 },
    });
    const expensivePlaceB = await prisma.place.create({
      data: { name: 'Expensive B', city: 'SeedCity', category: 'HISTORY', latitude: 0, longitude: 0 },
    });
    const cheapAlternative = await prisma.place.create({
      data: {
        name: 'Cheap alt',
        city: 'SeedCity',
        category: 'HISTORY',
        latitude: 0,
        longitude: 0,
        avgCost: opts.cheapAvgCost,
      },
    });

    const baseActivity = {
      tripDayId: day.id,
      startTime: start,
      endTime: start,
      durationMinutes: 60,
      travelToNextMinutes: 0,
    };
    const activityA = await prisma.activity.create({
      data: { ...baseActivity, placeId: expensivePlaceA.id, orderIndex: 0, cost: 800 },
    });
    const activityB = await prisma.activity.create({
      data: { ...baseActivity, placeId: expensivePlaceB.id, orderIndex: 1, cost: 800 },
    });

    return { tripId: trip.id, activityA, activityB, cheapAlternative };
  }

  it('optimize() уменьшает траты до бюджета, заменяя дорогие активности', async () => {
    const authRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'User', email: 'optimize@example.com', password: '123456' })
      .expect(201);

    const { tripId } = await seedOverBudgetTrip(authRes.body.user.id, { cheapAvgCost: 100 });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/trips/${tripId}/budget/optimize`)
      .set('Authorization', `Bearer ${authRes.body.token}`)
      .expect(201);

    expect(res.body.estimatedSpend).toBeLessThanOrEqual(res.body.budget);
    expect(res.body.changed).toBeGreaterThan(0);
  });

  it('optimize() не назначает одну и ту же альтернативу двум разным активностям', async () => {
    const authRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'User', email: 'optimize-dup@example.com', password: '123456' })
      .expect(201);

    // единственная дешёвая альтернатива — обе дорогие активности после
    // optimize() не должны схлопнуться в одно и то же место
    const { tripId } = await seedOverBudgetTrip(authRes.body.user.id, { cheapAvgCost: 100 });

    await request(app.getHttpServer())
      .post(`/api/v1/trips/${tripId}/budget/optimize`)
      .set('Authorization', `Bearer ${authRes.body.token}`)
      .expect(201);

    const activities = await prisma.activity.findMany({ where: { tripDay: { tripId } } });
    const placeIds = activities.map((a) => a.placeId);
    expect(new Set(placeIds).size).toBe(placeIds.length);
  });

  it('404, если путешествия не существует', async () => {
    const authRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'User', email: 'budget-404@example.com', password: '123456' })
      .expect(201);

    await request(app.getHttpServer())
      .get('/api/v1/trips/00000000-0000-0000-0000-000000000000/budget')
      .set('Authorization', `Bearer ${authRes.body.token}`)
      .expect(404);
  });
});
