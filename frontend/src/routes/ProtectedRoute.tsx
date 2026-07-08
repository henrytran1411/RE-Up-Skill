import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Role } from '../types/common';

interface ProtectedRouteProps {
  allowedRoles?: Role[];
}

export function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const { isAuthenticated, currentEmployee } = useAuth();

  if (!isAuthenticated || !currentEmployee) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(currentEmployee.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
