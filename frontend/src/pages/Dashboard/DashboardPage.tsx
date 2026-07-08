import { useAuth } from '../../context/AuthContext';
import { MANAGER_ROLES } from '../../types/common';
import { DevDashboardPage } from './DevDashboardPage';
import { PmDashboardPage } from './PmDashboardPage';

export function DashboardPage() {
  const { currentEmployee } = useAuth();
  const isManager = currentEmployee ? MANAGER_ROLES.includes(currentEmployee.role) : false;

  return isManager ? <PmDashboardPage /> : <DevDashboardPage />;
}
