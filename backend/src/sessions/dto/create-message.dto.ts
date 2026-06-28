import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  content: string;

  @IsOptional()
  @IsIn(['sitting', 'supine'])
  patientPosition?: 'sitting' | 'supine';
}
