import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AIService } from './ai.service';
import { MentorRequestDto } from './dto/mentor-request.dto';
import { AnalyzeProjectDto } from './dto/analyze-project.dto';

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AIController {
  constructor(private readonly aiService: AIService) {}

  @Post('mentor')
  async mentorChat(
    @Body() mentorRequest: MentorRequestDto,
    @CurrentUser() user: any,
  ) {
    // Add user context to the request
    const context = {
      ...mentorRequest.context,
      userId: user.id,
      userRole: user.role,
      userName: `${user.firstName} ${user.lastName}`,
    };

    return this.aiService.mentorChat({
      message: mentorRequest.message,
      userId: user.id,
      hackathonId: mentorRequest.hackathonId,
      conversationHistory: mentorRequest.conversationHistory || [],
      context,
    });
  }

  @Post('analyze-project')
  async analyzeProject(
    @Body() analyzeRequest: AnalyzeProjectDto,
    @CurrentUser() user: any,
  ) {
    return this.aiService.analyzeProject({
      hackathonId: analyzeRequest.hackathonId,
      title: analyzeRequest.title,
      description: analyzeRequest.description,
      requirements: analyzeRequest.requirements || {},
    });
  }
}

