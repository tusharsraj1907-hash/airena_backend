import { IsString, IsOptional, IsArray, IsObject } from 'class-validator';

export class MentorMessageDto {
  @IsString()
  role: string;

  @IsString()
  content: string;

  @IsOptional()
  @IsString()
  timestamp?: string;
}

export class MentorRequestDto {
  @IsString()
  message: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  hackathonId?: string;

  @IsOptional()
  @IsArray()
  conversationHistory?: MentorMessageDto[];

  @IsOptional()
  @IsObject()
  context?: Record<string, any>;
}

