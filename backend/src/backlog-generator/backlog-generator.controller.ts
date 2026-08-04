import { BadRequestException, Body, Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { BacklogGeneratorService } from './backlog-generator.service';
import { GenerateBacklogDto } from './dto/generate-backlog.dto';
import { PushGeneratedBacklogDto } from './dto/push-generated-backlog.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const DOCX_UPLOAD_OPTIONS = {
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req: unknown, file: Express.Multer.File, callback: (error: Error | null, accept: boolean) => void) => {
    if (file.mimetype !== DOCX_MIME_TYPE && !file.originalname.toLowerCase().endsWith('.docx')) {
      callback(new BadRequestException('Only .docx Word documents are supported'), false);
      return;
    }
    callback(null, true);
  },
};

@Controller('backlog-generator')
@Roles(Role.ADMIN, Role.PM, Role.TECH_LEAD)
export class BacklogGeneratorController {
  constructor(private readonly backlogGeneratorService: BacklogGeneratorService) {}

  /** Turns a plain-text project description into a full Epic/User Story/Task backlog via Gemini, saving every item as a real TaskRecord and returning a Markdown document of the result. */
  @Post('generate')
  generate(@Body() dto: GenerateBacklogDto) {
    return this.backlogGeneratorService.generate(dto);
  }

  /**
   * Extracts an uploaded .docx requirements document's Epics/User Stories
   * via Gemini (one Task per Story) and returns the structure for review —
   * nothing is saved locally. Follow up with push-generated-to-jira once
   * reviewed.
   */
  @Post('preview-from-document')
  @UseInterceptors(FileInterceptor('file', DOCX_UPLOAD_OPTIONS))
  previewFromDocument(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('A .docx file is required');
    }
    return this.backlogGeneratorService.previewFromDocument(file.buffer);
  }

  /**
   * Compares the given (reviewed) Epics/User Stories against what already
   * exists in `jiraProjectKey`, suggesting an existing Jira item to reuse
   * for each one that appears to mean the same thing. Read-only — no Jira
   * write, so open to the same PM/Tech Lead/Admin audience as generation.
   */
  @Post('suggest-matches')
  suggestMatches(@Body() dto: PushGeneratedBacklogDto) {
    return this.backlogGeneratorService.suggestExistingMatches(dto.jiraProjectKey, { epics: dto.epics });
  }

  /**
   * Creates the given (reviewed) Epic/User Story/Task structure directly in
   * Jira — a live, visible write, unlike preview-from-document above.
   * Admin-only, matching every other route that writes to real Jira
   * (JiraController is entirely Admin-gated), even though this controller's
   * other routes are open to PM/Tech Lead too.
   */
  @Post('push-generated-to-jira')
  @Roles(Role.ADMIN)
  pushGeneratedToJira(@Body() dto: PushGeneratedBacklogDto) {
    return this.backlogGeneratorService.pushGeneratedBacklogToJira(dto.jiraProjectKey, { epics: dto.epics });
  }
}
