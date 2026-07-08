import { IsNumber, IsString, Min, MaxLength } from 'class-validator';

export class CreateSkillLevelDto {
  @IsString()
  @MaxLength(50)
  name: string;

  /** Weight point applied when scoring an employee's skill held at this level, e.g. 6 for Senior. */
  @IsNumber()
  @Min(0)
  weight: number;
}
