import { IsString, MinLength } from 'class-validator';

export class CreateProjectNoteDto {
  @IsString()
  @MinLength(1)
  content: string;
}
