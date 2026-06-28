import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CreateMessageDto } from './dto/create-message.dto';
import { CreateSessionDto } from './dto/create-session.dto';
import { SessionsService } from './sessions.service';

@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post()
  create(@Body() createSessionDto: CreateSessionDto) {
    return this.sessionsService.create(createSessionDto);
  }

  @Get(':sessionId')
  findOne(@Param('sessionId') sessionId: string) {
    return this.sessionsService.findOne(sessionId);
  }

  @Post(':sessionId/messages')
  createMessage(
    @Param('sessionId') sessionId: string,
    @Body() createMessageDto: CreateMessageDto,
  ) {
    return this.sessionsService.createMessage(sessionId, createMessageDto);
  }

  @Post(':sessionId/evaluate')
  evaluate(@Param('sessionId') sessionId: string) {
    return this.sessionsService.evaluate(sessionId);
  }
}
