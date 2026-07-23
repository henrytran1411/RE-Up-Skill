import { PartialType } from '@nestjs/swagger';
import { CreateProjectNoteDto } from './create-project-note.dto';

export class UpdateProjectNoteDto extends PartialType(CreateProjectNoteDto) {}
