import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { PlacesService } from '../../src/places/places.service';
import { FakePlacesService } from './fake-places.service';
import { WeatherService } from '../../src/trips/weather.service';
import { FakeWeatherService } from './fake-weather.service';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Генерация путешествия идёт в фоне (fire-and-forget). Если тест закончился,
 * а генерация ещё работает, она налезает на следующий тест: пишет в строки,
 * которые уже удалила очистка БД. Поэтому перед очисткой и закрытием
 * приложения ждём, пока не останется путешествий в статусе GENERATING.
 */
export async function waitForGenerationIdle(
  prisma: PrismaService,
  timeoutMs = 15000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const running = await prisma.trip.count({ where: { status: 'GENERATING' } });
    if (running === 0) return;
    await sleep(100);
  }
}

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PlacesService)
    .useClass(FakePlacesService)
    .overrideProvider(WeatherService)
    .useClass(FakeWeatherService)
    .compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();

  // перед закрытием приложения дожидаемся фоновых генераций,
  // чтобы они не писали в БД после отключения Prisma
  const prisma = app.get(PrismaService);
  const originalClose = app.close.bind(app);
  app.close = async () => {
    await waitForGenerationIdle(prisma);
    return originalClose();
  };

  return app;
}

/**
 * Чистит все таблицы между тестами в порядке, уважающем внешние ключи.
 */
export async function cleanDatabase(prisma: PrismaService): Promise<void> {
  await waitForGenerationIdle(prisma);
  await prisma.$transaction([
    prisma.activity.deleteMany(),
    prisma.tripDay.deleteMany(),
    prisma.tripCategory.deleteMany(),
    prisma.trip.deleteMany(),
    prisma.place.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}

/** Ждёт терминального статуса генерации: READY или FAILED. */
export async function waitForTripReady(
  prisma: PrismaService,
  tripId: string,
  timeoutMs = 10000,
): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId } });
    if (trip.status === 'READY' || trip.status === 'FAILED') return trip.status;
    await sleep(100);
  }
  throw new Error(`Путешествие ${tripId} не дошло до READY/FAILED за ${timeoutMs}мс`);
}
