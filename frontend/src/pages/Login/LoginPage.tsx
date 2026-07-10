import { useState } from 'react';
import { Button, Card, Form, Input, Typography, Alert, Divider } from 'antd';
import { WindowsOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../services/apiClient';

interface LoginFormValues {
  email: string;
  password: string;
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(
    searchParams.get('error') === 'microsoft_login_failed' ? 'Sign-in with Microsoft failed. Please try again.' : null,
  );
  const [loading, setLoading] = useState(false);

  const handleFinish = async (values: LoginFormValues) => {
    setError(null);
    setLoading(true);
    try {
      await login(values.email, values.password);
      navigate('/dashboard');
    } catch {
      setError('Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f0f2f5' }}>
      <Card style={{ width: 380 }}>
        <Typography.Title level={3} style={{ textAlign: 'center' }}>
          DevPerf System
        </Typography.Title>
        {error && <Alert type="error" message={error} style={{ marginBottom: 16 }} />}
        <Form layout="vertical" onFinish={handleFinish}>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
            <Input placeholder="you@company.com" />
          </Form.Item>
          <Form.Item name="password" label="Password" rules={[{ required: true }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>
              Log in
            </Button>
          </Form.Item>
        </Form>
        <Divider plain>or</Divider>
        <Button
          block
          icon={<WindowsOutlined />}
          onClick={() => {
            globalThis.location.href = `${API_BASE_URL}/auth/microsoft`;
          }}
        >
          Sign in with Microsoft
        </Button>
        <Typography.Paragraph type="secondary" style={{ fontSize: 12, textAlign: 'center', marginTop: 8, marginBottom: 0 }}>
          First time signing in with Microsoft creates your account automatically.
        </Typography.Paragraph>
      </Card>
    </div>
  );
}
