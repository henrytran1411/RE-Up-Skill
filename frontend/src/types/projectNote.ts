export interface ProjectNote {
  id: string;
  projectName: string;
  content: string;
  authorId: string;
  author: { id: string; fullName: string };
  createdAt: string;
  updatedAt: string;
}
