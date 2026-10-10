import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, cleanDatabase, waitForTripReady } from './utils/test-app';

describe('TripDays reorder (e2e)', () => {
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

  async function createReadyTripWithActivities(token: string) {
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

    const tripRes = await request(app.getHttpServer())
      .get(`/api/v1/trips/${createRes.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const dayWithActivities = tripRes.body.days.find((d: any) => d.activities.length >= 2);
    if (!dayWithActivities) {
      throw new Error('Тестовому путешествию не хватило активностей для reorder-теста — проверьте FakePlacesService');
    }

    return { tripId: createRes.body.id, day: dayWithActivities };
  }

  it('меняет порядок активностей и пересчитывает их время начала', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'User', email: 'reorder@example.com', password: '123456' })
      .expect(201);
    const token = res.body.token;

    const { tripId, day } = await createReadyTripWithActivities(token);

    const originalOrder = day.activities.map((a: any) => a.id);
    const reversedOrder = [...originalOrder].reverse();
    const originalFirstPlaceId = day.activities[0].placeId;
    const originalLastPlaceId = day.activities[day.activities.length - 1].placeId;

    const reorderRes = await request(app.getHttpServer())
      .patch(`/api/v1/trips/${tripId}/days/${day.id}/reorder`)
      .set('Authorization', `Bearer ${token}`)
      .send({ activityIds: reversedOrder })
      .expect(200);

    const updatedActivities = reorderRes.body.activities;

    // то, что раньше было последним, теперь должно идти первым
    expect(updatedActivities[0].placeId).toBe(originalLastPlaceId);
    expect(updatedActivities[updatedActivities.length - 1].placeId).toBe(originalFirstPlaceId);

    // orderIndex должен быть по возрастанию без пропусков/дублей
    expect(updatedActivities.map((a: any) => a.orderIndex)).toEqual(
      updatedActivities.map((_: any, i: number) => i),
    );

    // время начала первой активности дня — всегда 09:00 по дате дня,
    // независимо от того, какая активность теперь первая
    const firstStart = new Date(updatedActivities[0].startTime);
    expect(firstStart.getHours()).toBe(9);
    expect(firstStart.getMinutes()).toBe(0);

    // времена активностей идут строго по возрастанию (пересчёт реально применился)
    for (let i = 1; i < updatedActivities.length; i++) {
      const prevEnd = new Date(updatedActivities[i - 1].endTime).getTime();
      const currentStart = new Date(updatedActivities[i].startTime).getTime();
      expect(currentStart).toBeGreaterThanOrEqual(prevEnd);
    }
  });

  it('отклоняет reorder с id активности, которого нет в этом дне', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'User', email: 'reorder-invalid@example.com', password: '123456' })
      .expect(201);
    const token = res.body.token;

    const { tripId, day } = await createReadyTripWithActivities(token);
    const bogusIds = [...day.activities.map((a: any) => a.id).slice(1), 'not-a-real-activity-id'];

    await request(app.getHttpServer())
      .patch(`/api/v1/trips/${tripId}/days/${day.id}/reorder`)
      .set('Authorization', `Bearer ${token}`)
      .send({ activityIds: bogusIds })
      .expect(403);
  });

  it('regenerate дня не повторяет места, уже занятые в других днях', async () => {
    const authRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'User', email: 'regen-day@example.com', password: '123456' })
      .expect(201);
    const token = authRes.body.token;

    // 2 ночи, RELAXED — чтобы в пуле фейковых мест (6 на категорию) точно
    // хватило на оба дня и после regenerate осталась возможность не
    // пересекаться со вторым днём.
    const start = new Date();
    start.setDate(start.getDate() + 5);
    const end = new Date();
    end.setDate(end.getDate() + 7);

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
        pace: 'RELAXED',
        categories: ['HISTORY', 'FOOD'],
      })
      .expect(201);

    await waitForTripReady(prisma, createRes.body.id);

    const beforeTrip = await request(app.getHttpServer())
      .get(`/api/v1/trips/${createRes.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const [day1, day2] = beforeTrip.body.days;
    const day2PlaceIds = new Set(day2.activities.map((a: any) => a.placeId));

    const regenRes = await request(app.getHttpServer())
      .post(`/api/v1/trips/${createRes.body.id}/days/${day1.id}/regenerate`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    const newDay1PlaceIds = regenRes.body.activities.map((a: any) => a.placeId);
    const overlap = newDay1PlaceIds.filter((id: string) => day2PlaceIds.has(id));
    expect(overlap).toHaveLength(0);
  });

  it('не даёт пересобрать день чужого путешествия', async () => {
    const ownerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'Owner', email: 'owner-days@example.com', password: '123456' })
      .expect(201);
    const strangerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'Stranger', email: 'stranger-days@example.com', password: '123456' })
      .expect(201);

    const { tripId, day } = await createReadyTripWithActivities(ownerRes.body.token);

    await request(app.getHttpServer())
      .patch(`/api/v1/trips/${tripId}/days/${day.id}/reorder`)
      .set('Authorization', `Bearer ${strangerRes.body.token}`)
      .send({ activityIds: day.activities.map((a: any) => a.id) })
      .expect(403);
  });
});
