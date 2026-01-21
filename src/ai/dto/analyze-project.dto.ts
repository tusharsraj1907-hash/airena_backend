import { IsString, IsOptional, IsObject } from 'class-validator';

export class AnalyzeProjectDto {
  @IsString()
  hackathonId: string;

  @IsString()
  title: string;

  @IsString()
  description: string;

  @IsOptional()
  @IsObject()
  requirements?: Record<string, any>;
}

