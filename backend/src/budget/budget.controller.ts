import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { BudgetService } from './budget.service';

@UseGuards(JwtAuthGuard)
@Controller('trips/:tripId/budget')
export class BudgetController {
  constructor(private budgetService: BudgetService) {}

  @Get()
  summary(@Param('tripId') tripId: string, @CurrentUser() userId: string) {
    return this.budgetService.summary(tripId, userId);
  }

  @Post('optimize')
  optimize(@Param('tripId') tripId: string, @CurrentUser() userId: string) {
    return this.budgetService.optimize(tripId, userId);
  }
}
