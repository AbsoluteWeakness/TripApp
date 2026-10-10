import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, cleanDatabase, waitForTripReady } from './utils/test-app';

/**
 * .env.test сознательно не содержит OPENAI_API_KEY — поэтому в e2e
 * тестируем именно контракт "ключ не настроен → 503", не реальный
 * вызов LLM. Полноценный прогон с LLM — ручная проверка/отдельный
 * прогон с реальным ключом, не часть обычного test:e2e.
 */
describe('Assistant (e2e)', () => {
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

  async function createReadyTrip(token: string) {
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
        categories: ['HISTORY'],
      })
      .expect(201);

    await waitForTripReady(prisma, createRes.body.id);
    return createRes.body.id as string;
  }

  it('503, если OPENAI_API_KEY не настроен', async () => {
    const authRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'User', email: 'assistant@example.com', password: '123456' })
      .expect(201);

    const tripId = await createReadyTrip(authRes.body.token);

    await request(app.getHttpServer())
      .post(`/api/v1/trips/${tripId}/assistant`)
      .set('Authorization', `Bearer ${authRes.body.token}`)
      .send({ message: 'Убери музеи из маршрута' })
      .expect(503);
  });

  it('404 на запрос к чужому/несуществующему путешествию — раньше проверки ключа', async () => {
    const authRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'User', email: 'assistant-404@example.com', password: '123456' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/trips/00000000-0000-0000-0000-000000000000/assistant')
      .set('Authorization', `Bearer ${authRes.body.token}`)
      .send({ message: 'Привет' })
      .expect(404);
  });

  it('400, если message пустой', async () => {
    const authRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ name: 'User', email: 'assistant-empty@example.com', password: '123456' })
      .expect(201);

    const tripId = await createReadyTrip(authRes.body.token);

    await request(app.getHttpServer())
      .post(`/api/v1/trips/${tripId}/assistant`)
      .set('Authorization', `Bearer ${authRes.body.token}`)
      .send({ message: '' })
      .expect(400);
  });
});
