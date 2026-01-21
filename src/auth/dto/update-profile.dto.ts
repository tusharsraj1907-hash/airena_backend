import { IsString, IsOptional, IsIn } from 'class-validator';
import { UserRole } from '../../common/constants/enums';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @IsIn(Object.values(UserRole))
  role?: string;
}

