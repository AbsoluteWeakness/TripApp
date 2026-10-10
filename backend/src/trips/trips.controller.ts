import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { TripsService } from './trips.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { UpdateTripDto } from './dto/update-trip.dto';

@UseGuards(JwtAuthGuard)
@Controller('trips')
export class TripsController {
  constructor(private tripsService: TripsService) {}

  @Get()
  findAll(@CurrentUser() userId: string) {
    return this.tripsService.findAllForUser(userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() userId: string) {
    return this.tripsService.findOneForUser(id, userId);
  }

  @Post()
  create(@Body() dto: CreateTripDto, @CurrentUser() userId: string) {
    return this.tripsService.create(userId, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateTripDto, @CurrentUser() userId: string) {
    return this.tripsService.update(id, userId, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() userId: string) {
    return this.tripsService.remove(id, userId);
  }

  @Post(':id/regenerate')
  regenerate(@Param('id') id: string, @CurrentUser() userId: string) {
    return this.tripsService.regenerate(id, userId);
  }

  @Get(':id/status')
  status(@Param('id') id: string, @CurrentUser() userId: string) {
    return this.tripsService.status(id, userId);
  }

  @Get(':id/places')
  alternatives(
    @Param('id') id: string,
    @Query('category') category: string,
    @CurrentUser() userId: string,
  ) {
    return this.tripsService.alternatives(id, userId, category);
  }
}
