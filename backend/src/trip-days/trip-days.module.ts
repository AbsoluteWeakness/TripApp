import { Module } from '@nestjs/common';
import { TripDaysController } from './trip-days.controller';
import { TripDaysService } from './trip-days.service';
import { TripsModule } from '../trips/trips.module';

@Module({
  imports: [TripsModule],
  controllers: [TripDaysController],
  providers: [TripDaysService],
  exports: [TripDaysService],
})
export class TripDaysModule {}
