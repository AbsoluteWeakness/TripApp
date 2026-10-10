import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, cleanDatabase } from './utils/test-app';

describe('Auth (e2e)', () => {
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

  const credentials = { name: 'Test User', email: 'test@example.com', password: '123456' };

  it('регистрирует пользователя и не возвращает passwordHash', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(credentials)
      .expect(201);

    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ name: credentials.name, email: credentials.email });
    expect(res.body.user.passwordHash).toBeUndefined();

    const stored = await prisma.user.findUniqueOrThrow({ where: { email: credentials.email } });
    expect(stored.passwordHash).not.toBe(credentials.password);
  });

  it('не даёт зарегистрировать второй аккаунт с тем же email', async () => {
    await request(app.getHttpServer()).post('/api/v1/auth/register').send(credentials).expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(credentials)
      .expect(409);
  });

  it('отклоняет логин с неверным паролем', async () => {
    await request(app.getHttpServer()).post('/api/v1/auth/register').send(credentials).expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: credentials.email, password: 'wrong-password' })
      .expect(401);
  });

  it('логинит с верным паролем и отдаёт рабочий токен для /auth/me', async () => {
    await request(app.getHttpServer()).post('/api/v1/auth/register').send(credentials).expect(201);

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: credentials.email, password: credentials.password })
      .expect(201);

    const token = loginRes.body.token;

    const meRes = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(meRes.body.email).toBe(credentials.email);
  });

  it('отклоняет /auth/me без токена', async () => {
    await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
  });
});
