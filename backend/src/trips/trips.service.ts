import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Category } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PlacesService } from '../places/places.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import { GenerationService } from './generation.service';

@Injectable()
export class TripsService {
  constructor(
    private prisma: PrismaService,
    private generation: GenerationService,
    private places: PlacesService,
  ) {}

  private async assertOwnership(tripId: string, userId: string) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('Путешествие не найдено');
    if (trip.userId !== userId) throw new ForbiddenException('Это не ваше путешествие');
    return trip;
  }

  private validateTripDates(startDate: string, endDate: string) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);

    if (start < today) {
      throw new BadRequestException('Дата начала не может быть в прошлом');
    }
    if (end <= start) {
      throw new BadRequestException('Дата окончания должна быть позже даты начала');
    }
  }

  async findAllForUser(userId: string) {
    return this.prisma.trip.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: { preferences: true },
    });
  }

  async findOneForUser(tripId: string, userId: string) {
    await this.assertOwnership(tripId, userId);
    return this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        preferences: true,
        days: {
          orderBy: { dayNumber: 'asc' },
          include: { activities: { orderBy: { orderIndex: 'asc' }, include: { place: true } } },
        },
      },
    });
  }

  async create(userId: string, dto: CreateTripDto) {
    this.validateTripDates(dto.startDate, dto.endDate);
    const trip = await this.prisma.trip.create({
      data: {
        userId,
        city: dto.city,
        country: dto.country,
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        travelers: dto.travelers,
        budget: dto.budget,
        currency: dto.currency ?? 'RUB',
        pace: dto.pace,
        status: 'GENERATING',
        preferences: { create: dto.categories.map((category) => ({ category })) },
      },
    });

    // Не блокируем ответ — генерация асинхронная (см. ТЗ).
    // На проде это должно уйти в очередь (BullMQ/Redis), не в fire-and-forget промис.
    this.generation.generateForTrip(trip.id).catch(() => {
      return this.prisma.trip.updateMany({ where: { id: trip.id }, data: { status: 'GENERATING' } });
    });

    return { id: trip.id, status: 'GENERATING' };
  }

  async update(tripId: string, userId: string, dto: UpdateTripDto) {
    const trip = await this.assertOwnership(tripId, userId);
    this.validateTripDates(
      dto.startDate ?? trip.startDate.toISOString().slice(0, 10),
      dto.endDate ?? trip.endDate.toISOString().slice(0, 10),
    );
    return this.prisma.$transaction(async (transaction) => {
      const updatedTrip = await transaction.trip.update({
        where: { id: tripId },
        data: {
          city: dto.city,
          country: dto.country,
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          endDate: dto.endDate ? new Date(dto.endDate) : undefined,
          travelers: dto.travelers,
          budget: dto.budget,
          currency: dto.currency,
          pace: dto.pace,
        },
      });

      if (dto.categories) {
        await transaction.tripCategory.deleteMany({ where: { tripId } });
        await transaction.tripCategory.createMany({
          data: dto.categories.map((category) => ({ tripId, category })),
        });
      }

      return updatedTrip;
    });
  }

  async remove(tripId: string, userId: string) {
    await this.assertOwnership(tripId, userId);
    await this.prisma.trip.delete({ where: { id: tripId } });
    return { deleted: true };
  }

  async regenerate(tripId: string, userId: string) {
    await this.assertOwnership(tripId, userId);
    await this.prisma.tripDay.deleteMany({ where: { tripId } });
    this.generation.generateForTrip(tripId).catch(() => undefined);
    return { status: 'GENERATING' };
  }

  async status(tripId: string, userId: string) {
    const trip = await this.assertOwnership(tripId, userId);
    return { status: trip.status, step: trip.currentStep };
  }

  async alternatives(tripId: string, userId: string, category: string) {
    const trip = await this.assertOwnership(tripId, userId);
    if (!Object.values(Category).includes(category as Category)) {
      throw new BadRequestException('Неизвестная категория места');
    }

    let point = trip.latitude && trip.longitude
      ? { lat: trip.latitude, lon: trip.longitude }
      : await this.places.geocodeCity(trip.city);
    if (!point) throw new BadRequestException('Не удалось определить координаты города');

    const groups = await this.places.fetchAndCachePlaces(
      trip.city,
      point,
      [category as Category],
      8,
    );
    return groups[0]?.places ?? [];
  }
}
