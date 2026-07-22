export interface EmployeeLevel {
  id: string;
  name: string;
  /** Display/ranking order — lower sorts first. */
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}
