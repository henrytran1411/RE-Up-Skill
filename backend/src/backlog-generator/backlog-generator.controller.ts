import { Body, Controller, Post } from '@nestjs/common';
import { BacklogGeneratorService } from './backlog-generator.service';
import { GenerateBacklogDto } from './dto/generate-backlog.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';

@Controller('backlog-generator')
@Roles(Role.ADMIN, Role.PM, Role.TECH_LEAD)
export class BacklogGeneratorController {
  constructor(private readonly backlogGeneratorService: BacklogGeneratorService) {}

  /** Turns a plain-text project description into a full Epic/User Story/Task backlog via Claude, saving every item as a real TaskRecord and returning a Markdown document of the result. */
  @Post('generate')
  generate(@Body() dto: GenerateBacklogDto) {
    return this.backlogGeneratorService.generate(dto);
  }
}
