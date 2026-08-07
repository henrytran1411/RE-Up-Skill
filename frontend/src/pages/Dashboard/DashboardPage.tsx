import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { MANAGER_ROLES, Role } from '../../types/common';
import { DevDashboardPage } from './DevDashboardPage';
import { PmDashboardPage } from './PmDashboardPage';

export function DashboardPage() {
  const { currentEmployee } = useAuth();
  const isManager = currentEmployee ? MANAGER_ROLES.includes(currentEmployee.role as Role) : false;

  // HR's only surface in the app is the Skills page — it has no dashboard of its own.
  if (currentEmployee?.role === Role.HR) {
    return <Navigate to="/skills" replace />;
  }

  return isManager ? <PmDashboardPage /> : <DevDashboardPage />;
}
