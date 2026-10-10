import { Module } from '@nestjs/common';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';
import { TripDaysModule } from '../trip-days/trip-days.module';

@Module({
  imports: [TripDaysModule],
  controllers: [AssistantController],
  providers: [AssistantService],
})
export class AssistantModule { }
