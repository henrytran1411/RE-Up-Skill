import { ConfigProvider } from 'antd';
import { AuthProvider } from './context/AuthContext';
import { AppRouter } from './routes/AppRouter';

export function App() {
  return (
    <ConfigProvider theme={{ token: { colorPrimary: '#1677ff' } }}>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </ConfigProvider>
  );
}
