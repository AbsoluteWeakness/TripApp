import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, cleanDatabase, waitForTripReady } from './utils/test-app';

describe('Trips (e2e)', () => {
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

  async function registerAndLogin(email: string) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'User', email, password: '123456' })
      .expect(201);
    return { token: res.body.token as string, userId: res.body.user.id as string };
  }

  function validTripPayload(overrides: Record<string, unknown> = {}) {
    const start = new Date();
    start.setDate(start.getDate() + 5);
    const end = new Date();
    end.setDate(end.getDate() + 8);

    return {
      city: 'Lisbon',
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
      travelers: 2,
      budget: 30000,
      currency: 'RUB',
      pace: 'MEDIUM',
      categories: ['HISTORY', 'FOOD'],
      ...overrides,
    };
  }

  it('создаёт путешествие и доводит генерацию до READY с реальными активностями', async () => {
    const { token } = await registerAndLogin('owner@example.com');

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${token}`)
      .send(validTripPayload())
      .expect(201);

    expect(createRes.body.status).toBe('GENERATING');

    const finalStatus = await waitForTripReady(prisma, createRes.body.id);
    expect(finalStatus).toBe('READY');

    const trip = await prisma.trip.findUniqueOrThrow({
      where: { id: createRes.body.id },
      include: { days: { include: { activities: true } } },
    });
    expect(trip.days.length).toBeGreaterThan(0);
    const totalActivities = trip.days.reduce((sum, d) => sum + d.activities.length, 0);
    expect(totalActivities).toBeGreaterThan(0);
  });

  it('помечает путешествие FAILED, если город не нашёлся', async () => {
    const { token } = await registerAndLogin('fail@example.com');

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${token}`)
      .send(validTripPayload({ city: 'nowhere-unknown-city' }))
      .expect(201);

    const finalStatus = await waitForTripReady(prisma, createRes.body.id);
    expect(finalStatus).toBe('FAILED');
  });

  it('отклоняет дату начала в прошлом', async () => {
    const { token } = await registerAndLogin('dates@example.com');

    await request(app.getHttpServer())
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${token}`)
      .send(validTripPayload({ startDate: '2020-01-01' }))
      .expect(400);
  });

  it('не отдаёт и не позволяет удалить чужое путешествие', async () => {
    const owner = await registerAndLogin('owner2@example.com');
    const stranger = await registerAndLogin('stranger@example.com');

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${owner.token}`)
      .send(validTripPayload())
      .expect(201);

    await request(app.getHttpServer())
      .get(`/api/v1/trips/${createRes.body.id}`)
      .set('Authorization', `Bearer ${stranger.token}`)
      .expect(403);

    await request(app.getHttpServer())
      .delete(`/api/v1/trips/${createRes.body.id}`)
      .set('Authorization', `Bearer ${stranger.token}`)
      .expect(403);

    // владелец по-прежнему может
    await request(app.getHttpServer())
      .get(`/api/v1/trips/${createRes.body.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
  });

  it('список /trips отдаёт только путешествия текущего пользователя', async () => {
    const userA = await registerAndLogin('a@example.com');
    const userB = await registerAndLogin('b@example.com');

    await request(app.getHttpServer())
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${userA.token}`)
      .send(validTripPayload({ city: 'Porto' }))
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${userB.token}`)
      .send(validTripPayload({ city: 'Tbilisi' }))
      .expect(201);

    const listA = await request(app.getHttpServer())
      .get('/api/v1/trips')
      .set('Authorization', `Bearer ${userA.token}`)
      .expect(200);

    expect(listA.body).toHaveLength(1);
    expect(listA.body[0].city).toBe('Porto');
  });

  it('удаляет путешествие вместе с днями и активностями (каскад)', async () => {
    const { token } = await registerAndLogin('delete@example.com');

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${token}`)
      .send(validTripPayload())
      .expect(201);

    await waitForTripReady(prisma, createRes.body.id);

    await request(app.getHttpServer())
      .delete(`/api/v1/trips/${createRes.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const remainingDays = await prisma.tripDay.count({ where: { tripId: createRes.body.id } });
    expect(remainingDays).toBe(0);
  });

  it('GET /trips/:id/places отдаёт альтернативы по категории', async () => {
    const { token } = await registerAndLogin('alternatives@example.com');

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${token}`)
      .send(validTripPayload())
      .expect(201);

    await waitForTripReady(prisma, createRes.body.id);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/trips/${createRes.body.id}/places`)
      .query({ category: 'HISTORY' })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0].category).toBe('HISTORY');
  });

  it('GET /trips/:id/places отклоняет неизвестную категорию', async () => {
    const { token } = await registerAndLogin('alternatives-bad@example.com');

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${token}`)
      .send(validTripPayload())
      .expect(201);

    await waitForTripReady(prisma, createRes.body.id);

    await request(app.getHttpServer())
      .get(`/api/v1/trips/${createRes.body.id}/places`)
      .query({ category: 'NOT_A_REAL_CATEGORY' })
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('PATCH /trips/:id заменяет категории интересов, если переданы', async () => {
    const { token } = await registerAndLogin('update-categories@example.com');

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${token}`)
      .send(validTripPayload({ categories: ['HISTORY'] }))
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/v1/trips/${createRes.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ categories: ['NATURE', 'SHOPPING'] })
      .expect(200);

    const stored = await prisma.tripCategory.findMany({ where: { tripId: createRes.body.id } });
    expect(stored.map((c) => c.category).sort()).toEqual(['NATURE', 'SHOPPING']);
  });

  it('PATCH /trips/:id без categories не трогает существующие предпочтения', async () => {
    const { token } = await registerAndLogin('update-no-categories@example.com');

    const createRes = await request(app.getHttpServer())
      .post('/api/v1/trips')
      .set('Authorization', `Bearer ${token}`)
      .send(validTripPayload({ categories: ['HISTORY', 'FOOD'] }))
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/api/v1/trips/${createRes.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ budget: 50000 })
      .expect(200);

    const stored = await prisma.tripCategory.findMany({ where: { tripId: createRes.body.id } });
    expect(stored.map((c) => c.category).sort()).toEqual(['FOOD', 'HISTORY']);
  });
});
