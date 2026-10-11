import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content: string;

  @IsOptional()
  @IsUUID()
  requestId?: string;

  @IsOptional()
  @IsIn(['sitting', 'supine'])
  patientPosition?: 'sitting' | 'supine';
}
