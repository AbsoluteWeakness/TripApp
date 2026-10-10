import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { AssistantService } from './assistant.service';
import { AssistantRequestDto } from './dto/assistant-request.dto';

@UseGuards(JwtAuthGuard)
@Controller('trips/:tripId/assistant')
export class AssistantController {
  constructor(private assistantService: AssistantService) {}

  @Post()
  handle(
    @Param('tripId') tripId: string,
    @Body() dto: AssistantRequestDto,
    @CurrentUser() userId: string,
  ) {
    return this.assistantService.handleRequest(tripId, userId, dto.message, dto.dayId);
  }
}
