import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GenerationService } from '../trips/generation.service';

const DEFAULT_DAY_START_MINUTES = 9 * 60; // 09:00

@Injectable()
export class TripDaysService {
  constructor(
    private prisma: PrismaService,
    private generation: GenerationService,
  ) {}

  private async getOwnedDay(dayId: string, userId: string) {
    const day = await this.prisma.tripDay.findUnique({
      where: { id: dayId },
      include: { trip: true, activities: { orderBy: { orderIndex: 'asc' }, include: { place: true } } },
    });
    if (!day) throw new NotFoundException('День не найден');
    if (day.trip.userId !== userId) throw new ForbiddenException('Это не ваше путешествие');
    return day;
  }

  /**
   * Пересчитывает start/end время и travelToNext по актуальному
   * порядку activities — вызывается и после reorder, и после
   * добавления/удаления активности.
   */
  private async recalcSchedule(dayId: string) {
    const activities = await this.prisma.activity.findMany({
      where: { tripDayId: dayId },
      orderBy: { orderIndex: 'asc' },
      include: { place: true },
    });

    const day = await this.prisma.tripDay.findUniqueOrThrow({ where: { id: dayId } });
    let cursor = new Date(day.date);
    cursor.setHours(0, DEFAULT_DAY_START_MINUTES, 0, 0);

    await this.prisma.$transaction(
      activities.map((activity, index) => {
        const start = new Date(cursor);
        const end = new Date(start.getTime() + activity.durationMinutes * 60_000);
        cursor = new Date(end.getTime() + activity.travelToNextMinutes * 60_000);
        return this.prisma.activity.update({
          where: { id: activity.id },
          data: { orderIndex: index, startTime: start, endTime: end },
        });
      }),
    );

    return this.prisma.tripDay.findUniqueOrThrow({
      where: { id: dayId },
      include: { activities: { orderBy: { orderIndex: 'asc' }, include: { place: true } } },
    });
  }

  async reorder(dayId: string, userId: string, activityIds: string[]) {
    const day = await this.getOwnedDay(dayId, userId);

    const currentIds = day.activities.map((a) => a.id).sort();
    if (currentIds.join(',') !== [...activityIds].sort().join(',')) {
      throw new ForbiddenException('Список activityIds не совпадает с активностями этого дня');
    }

    // Сначала освобождаем текущие индексы, иначе уникальный индекс конфликтует
    // с соседней активностью во время перестановки.
    await this.prisma.$transaction(
      activityIds.map((activityId, index) =>
        this.prisma.activity.update({ where: { id: activityId }, data: { orderIndex: -(index + 1) } }),
      ),
    );

    await this.prisma.$transaction(
      activityIds.map((activityId, index) =>
        this.prisma.activity.update({ where: { id: activityId }, data: { orderIndex: index } }),
      ),
    );

    return this.recalcSchedule(dayId);
  }

  async regenerateDay(dayId: string, userId: string) {
    const day = await this.getOwnedDay(dayId, userId);
    await this.generation.regenerateDay(day.trip.id, day.dayNumber);
    return this.prisma.tripDay.findUniqueOrThrow({
      where: { id: dayId },
      include: { activities: { orderBy: { orderIndex: 'asc' }, include: { place: true } } },
    });
  }

  async recalcAfterActivityChange(dayId: string) {
    return this.recalcSchedule(dayId);
  }
}
