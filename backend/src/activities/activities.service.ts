import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TripDaysService } from '../trip-days/trip-days.service';

const DEFAULT_DURATION_MINUTES = 60;
const DEFAULT_TRAVEL_MINUTES = 15;

@Injectable()
export class ActivitiesService {
  constructor(
    private prisma: PrismaService,
    private tripDaysService: TripDaysService,
  ) {}

  private async getOwnedActivity(activityId: string, userId: string) {
    const activity = await this.prisma.activity.findUnique({
      where: { id: activityId },
      include: { tripDay: { include: { trip: true } } },
    });
    if (!activity) throw new NotFoundException('Активность не найдена');
    if (activity.tripDay.trip.userId !== userId) {
      throw new ForbiddenException('Это не ваше путешествие');
    }
    return activity;
  }

  private async getOwnedDay(dayId: string, userId: string) {
    const day = await this.prisma.tripDay.findUnique({
      where: { id: dayId },
      include: { trip: true },
    });
    if (!day) throw new NotFoundException('День не найден');
    if (day.trip.userId !== userId) throw new ForbiddenException('Это не ваше путешествие');
    return day;
  }

  async add(dayId: string, userId: string, placeId: string, position?: number) {
    await this.getOwnedDay(dayId, userId);
    const place = await this.prisma.place.findUnique({ where: { id: placeId } });
    if (!place) throw new NotFoundException('Объект не найден');

    const existing = await this.prisma.activity.count({ where: { tripDayId: dayId } });
    const orderIndex = position ?? existing;

    await this.prisma.activity.create({
      data: {
        tripDayId: dayId,
        placeId,
        orderIndex,
        // Плейсхолдеры — recalcAfterActivityChange ниже пересчитает реальные значения.
        startTime: new Date(),
        endTime: new Date(),
        durationMinutes: DEFAULT_DURATION_MINUTES,
        travelToNextMinutes: DEFAULT_TRAVEL_MINUTES,
        cost: place.avgCost ?? 0,
      },
    });

    return this.tripDaysService.recalcAfterActivityChange(dayId);
  }

  async update(activityId: string, userId: string, placeId: string) {
    const activity = await this.getOwnedActivity(activityId, userId);
    const place = await this.prisma.place.findUnique({ where: { id: placeId } });
    if (!place) throw new NotFoundException('Объект не найден');

    await this.prisma.activity.update({
      where: { id: activityId },
      data: { placeId, cost: place.avgCost ?? 0 },
    });

    return this.tripDaysService.recalcAfterActivityChange(activity.tripDayId);
  }

  async remove(activityId: string, userId: string) {
    const activity = await this.getOwnedActivity(activityId, userId);
    await this.prisma.activity.delete({ where: { id: activityId } });
    return this.tripDaysService.recalcAfterActivityChange(activity.tripDayId);
  }
}
