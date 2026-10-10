import { Body, Controller, Delete, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { ActivitiesService } from './activities.service';
import { AddActivityDto } from './dto/add-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';

@UseGuards(JwtAuthGuard)
@Controller()
export class ActivitiesController {
  constructor(private activitiesService: ActivitiesService) {}

  @Post('trips/:tripId/days/:dayId/activities')
  add(
    @Param('dayId') dayId: string,
    @Body() dto: AddActivityDto,
    @CurrentUser() userId: string,
  ) {
    return this.activitiesService.add(dayId, userId, dto.placeId, dto.position);
  }

  @Patch('trips/:tripId/activities/:activityId')
  update(
    @Param('activityId') activityId: string,
    @Body() dto: UpdateActivityDto,
    @CurrentUser() userId: string,
  ) {
    return this.activitiesService.update(activityId, userId, dto.placeId);
  }

  @Delete('trips/:tripId/activities/:activityId')
  remove(@Param('activityId') activityId: string, @CurrentUser() userId: string) {
    return this.activitiesService.remove(activityId, userId);
  }
}
