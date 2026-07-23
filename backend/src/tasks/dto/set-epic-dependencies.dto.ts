import { IsArray, IsString } from 'class-validator';

/** The Jira issue keys of other Epics (in the same project) that must finish before this Epic can — drives the critical-path calculation. */
export class SetEpicDependenciesDto {
  @IsArray()
  @IsString({ each: true })
  blockedByEpicKeys: string[];
}
