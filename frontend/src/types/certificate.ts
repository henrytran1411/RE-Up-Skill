export interface EmployeeCertificate {
  id: string;
  employeeId: string;
  employee?: { id: string; fullName: string };
  name: string;
  description: string | null;
  imageUrl: string;
  expiredDate: string;
  /** Null until an Admin verifies the certificate. */
  points: number | null;
  isVerified: boolean;
  verifiedById: string | null;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CertificateYearSummary {
  employeeId: string;
  year: number;
  totalPoints: number;
  certificates: EmployeeCertificate[];
}
