import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { TripsModule } from './trips/trips.module';
import { TripDaysModule } from './trip-days/trip-days.module';
import { ActivitiesModule } from './activities/activities.module';
import { BudgetModule } from './budget/budget.module';
import { AssistantModule } from './assistant/assistant.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    TripsModule,
    TripDaysModule,
    ActivitiesModule,
    BudgetModule,
    AssistantModule,
  ],
})
export class AppModule {}
