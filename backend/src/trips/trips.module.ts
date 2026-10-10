import { Module } from '@nestjs/common';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';
import { GenerationService } from './generation.service';
import { PlacesModule } from '../places/places.module';
import { WeatherService } from './weather.service';

@Module({
  imports: [PlacesModule],
  controllers: [TripsController],
  providers: [TripsService, GenerationService, WeatherService],
  exports: [GenerationService],
})
export class TripsModule {}
