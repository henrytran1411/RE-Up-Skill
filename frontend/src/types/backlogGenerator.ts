export interface BacklogGeneratorResult {
  projectName: string;
  projectCreated: boolean;
  epicsCreated: number;
  storiesCreated: number;
  tasksCreated: number;
  totalPoints: number;
  totalEstimateHours: number;
  /** Markdown backlog doc — every line's Summary is `[taskCode] name`, e.g. "[Epic-1] Access management". */
  document: string;
}
