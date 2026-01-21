import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AIController } from './ai.controller';
import { AIService } from './ai.service';

@Module({
  imports: [HttpModule],
  controllers: [AIController],
  providers: [AIService],
  exports: [AIService],
})
export class AIModule {}

