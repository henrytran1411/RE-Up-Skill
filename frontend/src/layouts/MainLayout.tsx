import { Layout, Menu, Avatar, Dropdown, Space, Typography } from 'antd';
import { DashboardOutlined, TeamOutlined, LogoutOutlined, UserOutlined, ToolOutlined, BookOutlined, AppstoreOutlined, BarChartOutlined, ProjectOutlined, RiseOutlined, FolderOutlined, BulbOutlined, TrophyOutlined, SafetyCertificateOutlined, SettingOutlined, IdcardOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { MANAGER_ROLES, Role } from '../types/common';

const { Header, Sider, Content } = Layout;

const SKILL_CATALOG_ROLES: Role[] = [Role.HR, Role.ADMIN, Role.TECH_LEAD];
const BACKLOG_GENERATOR_ROLES: Role[] = [Role.PM, Role.TECH_LEAD, Role.ADMIN];

export function MainLayout() {
  const { currentEmployee, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isManager = currentEmployee ? MANAGER_ROLES.includes(currentEmployee.role as Role) : false;
  const canManageSkillCatalog = currentEmployee ? SKILL_CATALOG_ROLES.includes(currentEmployee.role as Role) : false;
  const isAdmin = currentEmployee?.role === Role.ADMIN;
  const canManageEmployeeCatalogs = currentEmployee?.role === Role.HR || isAdmin;
  const canGenerateBacklog = currentEmployee ? BACKLOG_GENERATOR_ROLES.includes(currentEmployee.role as Role) : false;

  const menuItems = [
    { key: '/dashboard', icon: <DashboardOutlined />, label: 'Dashboard' },
    { key: '/my-projects', icon: <FolderOutlined />, label: 'My Projects' },
    { key: '/my-skills', icon: <BulbOutlined />, label: 'My Skills' },
    { key: '/my-certificates', icon: <SafetyCertificateOutlined />, label: 'My Certificates' },
    ...(isManager
      ? [
          { key: '/employees', icon: <TeamOutlined />, label: 'Employees' },
          { key: '/skills', icon: <ToolOutlined />, label: 'Skills' },
          { key: '/projects', icon: <ProjectOutlined />, label: 'Projects' },
          { key: '/analytics', icon: <BarChartOutlined />, label: 'Analytics' },
        ]
      : []),
    ...(canGenerateBacklog
      ? [{ key: '/backlog-generator', icon: <ThunderboltOutlined />, label: 'Backlog Generator' }]
      : []),
    ...(canManageSkillCatalog
      ? [
          { key: '/skill-catalog', icon: <BookOutlined />, label: 'Skill Catalog' },
          { key: '/skill-categories', icon: <AppstoreOutlined />, label: 'Skill Categories' },
          { key: '/skill-levels', icon: <RiseOutlined />, label: 'Skill Levels' },
        ]
      : []),
    ...(canManageEmployeeCatalogs
      ? [{ key: '/employee-catalogs', icon: <IdcardOutlined />, label: 'Employee Catalogs' }]
      : []),
    ...(isAdmin
      ? [
          { key: '/contribution-records', icon: <TrophyOutlined />, label: 'Contribution Records' },
          { key: '/certificates', icon: <SafetyCertificateOutlined />, label: 'Certificates' },
          { key: '/admin', icon: <SettingOutlined />, label: 'Admin' },
        ]
      : []),
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider breakpoint="lg" collapsedWidth="0">
        <div style={{ color: '#fff', textAlign: 'center', padding: 16, fontWeight: 600 }}>
          DevPerf System
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', paddingRight: 24 }}>
          <Dropdown
            menu={{
              items: [{ key: 'logout', icon: <LogoutOutlined />, label: 'Logout' }],
              onClick: ({ key }) => {
                if (key === 'logout') {
                  logout();
                  navigate('/login');
                }
              },
            }}
          >
            <Space style={{ cursor: 'pointer' }}>
              <Avatar icon={<UserOutlined />} />
              <Typography.Text>{currentEmployee?.fullName}</Typography.Text>
            </Space>
          </Dropdown>
        </Header>
        <Content style={{ margin: 24 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
