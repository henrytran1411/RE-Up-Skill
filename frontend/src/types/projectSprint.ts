export interface ProjectSprint {
  id: string;
  projectName: string;
  sprintNumber: number;
  name: string | null;
  startDate: string;
  endDate: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}
