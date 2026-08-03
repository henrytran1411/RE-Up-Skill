import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from '../pages/Login/LoginPage';
import { MicrosoftCallbackPage } from '../pages/Login/MicrosoftCallbackPage';
import { DashboardPage } from '../pages/Dashboard/DashboardPage';
import { MyProjectsPage } from '../pages/Dashboard/MyProjectsPage';
import { MySkillsPage } from '../pages/Dashboard/MySkillsPage';
import { EmployeeListPage } from '../pages/Employees/EmployeeListPage';
import { EmployeeCatalogsPage } from '../pages/Employees/EmployeeCatalogsPage';
import { SkillsManagementPage } from '../pages/Skills/SkillsManagementPage';
import { SkillCatalogPage } from '../pages/Skills/SkillCatalogPage';
import { SkillCategoryPage } from '../pages/Skills/SkillCategoryPage';
import { SkillLevelPage } from '../pages/Skills/SkillLevelPage';
import { AnalyticsPage } from '../pages/Analytics/AnalyticsPage';
import { ProjectsPage } from '../pages/Projects/ProjectsPage';
import { ContributionRecordsPage } from '../pages/Contribution/ContributionRecordsPage';
import { MyCertificatesPage } from '../pages/Certificates/MyCertificatesPage';
import { CertificatesPage } from '../pages/Certificates/CertificatesPage';
import { AdminPage } from '../pages/Admin/AdminPage';
import { BacklogGeneratorPage } from '../pages/BacklogGenerator/BacklogGeneratorPage';
import { MainLayout } from '../layouts/MainLayout';
import { ProtectedRoute } from './ProtectedRoute';
import { MANAGER_ROLES, Role } from '../types/common';

const SKILL_CATALOG_ROLES = [Role.HR, Role.ADMIN, Role.TECH_LEAD];
export const BACKLOG_GENERATOR_ROLES = [Role.PM, Role.TECH_LEAD, Role.ADMIN];

export function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<MicrosoftCallbackPage />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<MainLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/my-projects" element={<MyProjectsPage />} />
            <Route path="/my-skills" element={<MySkillsPage />} />
            <Route path="/my-certificates" element={<MyCertificatesPage />} />

            <Route element={<ProtectedRoute allowedRoles={MANAGER_ROLES} />}>
              <Route path="/employees" element={<EmployeeListPage />} />
              <Route path="/skills" element={<SkillsManagementPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/projects" element={<ProjectsPage />} />
            </Route>

            <Route element={<ProtectedRoute allowedRoles={BACKLOG_GENERATOR_ROLES} />}>
              <Route path="/backlog-generator" element={<BacklogGeneratorPage />} />
            </Route>

            <Route element={<ProtectedRoute allowedRoles={[Role.HR, Role.ADMIN]} />}>
              <Route path="/employee-catalogs" element={<EmployeeCatalogsPage />} />
            </Route>

            <Route element={<ProtectedRoute allowedRoles={SKILL_CATALOG_ROLES} />}>
              <Route path="/skill-catalog" element={<SkillCatalogPage />} />
              <Route path="/skill-categories" element={<SkillCategoryPage />} />
              <Route path="/skill-levels" element={<SkillLevelPage />} />
            </Route>

            <Route element={<ProtectedRoute allowedRoles={[Role.ADMIN]} />}>
              <Route path="/contribution-records" element={<ContributionRecordsPage />} />
              <Route path="/certificates" element={<CertificatesPage />} />
              <Route path="/admin" element={<AdminPage />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
