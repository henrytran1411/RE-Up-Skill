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

export interface GeneratedTask {
  name: string;
  description?: string;
  points: number;
  estimateHours: number;
  complexity: number;
}

export interface GeneratedStory {
  name: string;
  description?: string;
  tasks: GeneratedTask[];
}

export interface GeneratedEpic {
  name: string;
  description?: string;
  userStories: GeneratedStory[];
}

/** The not-yet-persisted-anywhere structure returned by previewing a Word document — reviewed before deciding whether to push it to Jira. */
export interface GeneratedBacklog {
  epics: GeneratedEpic[];
}

export interface GeneratedBacklogPushRow {
  name: string;
  issueType: 'Epic' | 'Story' | 'Task';
  outcome: 'pushed' | 'already_exists' | 'failed' | 'skipped_parent_failed';
  jiraIssueKey: string | null;
  errorMessage: string | null;
  /** Optional fields Jira rejected for this project/screen and that were dropped so the create could still succeed. */
  droppedFields?: string[];
}

export interface GeneratedBacklogPushSummary {
  jiraProjectKey: string;
  totalItems: number;
  pushed: number;
  failed: number;
  rows: GeneratedBacklogPushRow[];
}

export interface EpicMatch {
  generatedEpicName: string;
  matchedExistingKey: string | null;
  matchedExistingName: string | null;
  reason: string;
}

export interface StoryMatch {
  generatedStoryName: string;
  matchedExistingKey: string | null;
  matchedExistingName: string | null;
  reason: string;
}

export interface MatchSuggestionResult {
  epicMatches: EpicMatch[];
  storyMatches: StoryMatch[];
}
