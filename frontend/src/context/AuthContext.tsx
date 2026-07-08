import { createContext, ReactNode, useContext, useMemo, useState } from 'react';
import { login as loginRequest, logout as logoutRequest, getStoredEmployee } from '../services/authService';
import { Role } from '../types/common';

interface CurrentEmployee {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  level: string;
}

interface AuthContextValue {
  currentEmployee: CurrentEmployee | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentEmployee, setCurrentEmployee] = useState<CurrentEmployee | null>(
    getStoredEmployee(),
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      currentEmployee,
      isAuthenticated: currentEmployee !== null,
      login: async (email, password) => {
        const response = await loginRequest(email, password);
        setCurrentEmployee(response.employee);
      },
      logout: () => {
        logoutRequest();
        setCurrentEmployee(null);
      },
    }),
    [currentEmployee],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
