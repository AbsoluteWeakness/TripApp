import { Body, Controller, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { TripDaysService } from './trip-days.service';
import { ReorderActivitiesDto } from './dto/reorder-activities.dto';

@UseGuards(JwtAuthGuard)
@Controller('trips/:tripId/days/:dayId')
export class TripDaysController {
  constructor(private tripDaysService: TripDaysService) {}

  @Patch('reorder')
  reorder(
    @Param('dayId') dayId: string,
    @Body() dto: ReorderActivitiesDto,
    @CurrentUser() userId: string,
  ) {
    return this.tripDaysService.reorder(dayId, userId, dto.activityIds);
  }

  @Post('regenerate')
  regenerate(@Param('dayId') dayId: string, @CurrentUser() userId: string) {
    return this.tripDaysService.regenerateDay(dayId, userId);
  }
}
