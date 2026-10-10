import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TripDaysService } from '../trip-days/trip-days.service';

interface AssistantChange {
  activityId: string;
  placeId: string;
  reason: string;
}

@Injectable()
export class AssistantService {
  private readonly apiKey?: string;
  private readonly model: string;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private tripDays: TripDaysService,
  ) {
    this.apiKey = this.config.get<string>('OPENAI_API_KEY');
    this.model = this.config.get<string>('OPENAI_MODEL') ?? 'gpt-4o-mini';
  }

  async handleRequest(tripId: string, userId: string, message: string, dayId?: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        preferences: true,
        days: {
          orderBy: { dayNumber: 'asc' },
          include: { activities: { orderBy: { orderIndex: 'asc' }, include: { place: true } } },
        },
      },
    });
    if (!trip) throw new NotFoundException('Путешествие не найдено');
    if (trip.userId !== userId) throw new ForbiddenException('Это не ваше путешествие');
    if (!this.apiKey) {
      throw new ServiceUnavailableException('AI-ассистент не настроен: добавьте OPENAI_API_KEY в backend/.env');
    }

    const days = dayId ? trip.days.filter((day) => day.id === dayId) : trip.days;
    if (dayId && days.length === 0) throw new NotFoundException('День не найден в этом путешествии');

    const activities = days.flatMap((day) => day.activities);
    const candidatePlaces = await this.prisma.place.findMany({
      where: {
        city: trip.city,
        category: { in: [...new Set(activities.map((activity) => activity.place.category))] },
        id: { notIn: activities.map((activity) => activity.placeId) },
      },
      orderBy: [{ rating: 'desc' }, { name: 'asc' }],
      take: 100,
    });

    const promptContext = {
      trip: {
        city: trip.city,
        budget: Number(trip.budget),
        currency: trip.currency,
        preferences: trip.preferences.map((preference) => preference.category),
      },
      days: days.map((day) => ({
        id: day.id,
        dayNumber: day.dayNumber,
        activities: day.activities.map((activity) => ({
          id: activity.id,
          placeId: activity.placeId,
          category: activity.place.category,
          name: activity.place.name,
          cost: Number(activity.cost),
        })),
      })),
      availablePlaces: candidatePlaces.map((place) => ({
        id: place.id,
        category: place.category,
        name: place.name,
        rating: place.rating,
        estimatedCost: place.avgCost === null ? null : Number(place.avgCost),
        description: place.description,
      })),
    };

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'Ты помощник по редактированию маршрутов. Используй только переданные активности и availablePlaces. Никогда не выдумывай места или ID. Предложи только безопасные замены в формате JSON: {"reply":"краткое объяснение", "changes":[{"activityId":"...", "placeId":"...", "reason":"..."}]}. Если выполнить запрос нельзя, changes должен быть пустым массивом.',
          },
          { role: 'user', content: JSON.stringify({ request: message, context: promptContext }) },
        ],
      }),
    });

    if (!response.ok) {
      throw new ServiceUnavailableException(`AI-провайдер вернул HTTP ${response.status}`);
    }
    const payload = await response.json();
    const content = payload.choices?.[0]?.message?.content;
    let proposal: { reply?: string; changes?: AssistantChange[] };
    try {
      proposal = JSON.parse(content);
    } catch {
      throw new ServiceUnavailableException('AI-провайдер вернул некорректный ответ');
    }

    const activityById = new Map(activities.map((activity) => [activity.id, activity]));
    const placeById = new Map(candidatePlaces.map((place) => [place.id, place]));
    const acceptedChanges = (Array.isArray(proposal.changes) ? proposal.changes : []).filter((change) => {
      const activity = activityById.get(change.activityId);
      const place = placeById.get(change.placeId);
      return activity && place && activity.place.category === place.category;
    });

    const changedDayIds = new Set<string>();
    for (const change of acceptedChanges) {
      const activity = activityById.get(change.activityId)!;
      const place = placeById.get(change.placeId)!;
      await this.prisma.activity.update({
        where: { id: activity.id },
        data: { placeId: place.id, cost: place.avgCost ?? 0 },
      });
      changedDayIds.add(activity.tripDayId);
    }

    for (const changedDayId of changedDayIds) {
      await this.tripDays.recalcAfterActivityChange(changedDayId);
    }

    return {
      reply: proposal.reply ?? 'Обработал запрос по доступным данным маршрута.',
      applied: acceptedChanges.length > 0,
      changes: acceptedChanges.map((change) => ({
        ...change,
        placeName: placeById.get(change.placeId)?.name,
      })),
      days: days.filter((day) => changedDayIds.has(day.id)).map((day) => day.id),
    };
  }
}
