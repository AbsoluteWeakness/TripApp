import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BudgetService {
  constructor(private prisma: PrismaService) {}

  private async getOwnedTrip(tripId: string, userId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        days: {
          include: { activities: { include: { place: true } } },
          orderBy: { dayNumber: 'asc' },
        },
      },
    });
    if (!trip) throw new NotFoundException('Путешествие не найдено');
    if (trip.userId !== userId) throw new ForbiddenException('Это не ваше путешествие');
    return trip;
  }

  async summary(tripId: string, userId: string) {
    const trip = await this.getOwnedTrip(tripId, userId);

    const byDay = trip.days.map((day) => ({
      dayNumber: day.dayNumber,
      spend: day.activities.reduce((sum, a) => sum + Number(a.cost), 0),
    }));

    const estimatedSpend = byDay.reduce((sum, d) => sum + d.spend, 0);
    const budget = Number(trip.budget);

    return {
      budget,
      estimatedSpend,
      remaining: budget - estimatedSpend,
      byDay,
    };
  }

  async optimize(tripId: string, userId: string) {
    const trip = await this.getOwnedTrip(tripId, userId);
    const budget = Number(trip.budget);
    const activities = trip.days.flatMap((day) => day.activities);
    let estimatedSpend = activities.reduce((sum, activity) => sum + Number(activity.cost), 0);
    let changed = 0;

    if (estimatedSpend > budget) {
      const usedPlaceIds = new Set(activities.map((activity) => activity.placeId));
      const categories = [...new Set(activities.map((activity) => activity.place.category))];
      const alternatives = await this.prisma.place.findMany({
        where: {
          city: trip.city,
          category: { in: categories },
          avgCost: { not: null },
          id: { notIn: [...usedPlaceIds] },
        },
        orderBy: { avgCost: 'asc' },
      });

      for (const activity of [...activities].sort((first, second) => Number(second.cost) - Number(first.cost))) {
        if (estimatedSpend <= budget) break;
        const alternative = alternatives.find(
          (place) =>
            place.category === activity.place.category &&
            Number(place.avgCost) < Number(activity.cost) &&
            !usedPlaceIds.has(place.id),
        );
        if (!alternative) continue;

        await this.prisma.activity.update({
          where: { id: activity.id },
          data: { placeId: alternative.id, cost: alternative.avgCost ?? 0 },
        });
        usedPlaceIds.add(alternative.id);
        estimatedSpend -= Number(activity.cost) - Number(alternative.avgCost);
        changed += 1;
      }
    }

    await this.prisma.trip.update({
      where: { id: tripId },
      data: { estimatedSpend },
    });

    const updatedTrip = await this.prisma.trip.findUniqueOrThrow({
      where: { id: tripId },
      include: {
        preferences: true,
        days: {
          orderBy: { dayNumber: 'asc' },
          include: { activities: { orderBy: { orderIndex: 'asc' }, include: { place: true } } },
        },
      },
    });

    return {
      ...(await this.summary(tripId, userId)),
      changed,
      trip: updatedTrip,
    };
  }
}
