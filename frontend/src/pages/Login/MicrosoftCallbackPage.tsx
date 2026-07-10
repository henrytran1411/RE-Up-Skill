import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Alert, Card, Spin, Typography } from 'antd';
import { useAuth } from '../../context/AuthContext';
import { logout } from '../../services/authService';

/** Lands here after a Microsoft sign-in — the backend already issued our JWT and passed it via `?token=`. */
export function MicrosoftCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { loginWithToken } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const ranOnce = useRef(false);

  useEffect(() => {
    if (ranOnce.current) return;
    ranOnce.current = true;

    const token = searchParams.get('token');
    if (!token) {
      setError('No sign-in token was returned by Microsoft.');
      return;
    }
    loginWithToken(token)
      .then(() => navigate('/dashboard', { replace: true }))
      .catch(() => {
        logout();
        setError('Failed to complete sign-in with your Microsoft account.');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#f0f2f5' }}>
      <Card style={{ width: 380, textAlign: 'center' }}>
        {error ? (
          <>
            <Alert type="error" message={error} style={{ marginBottom: 16 }} />
            <Link to="/login">Back to login</Link>
          </>
        ) : (
          <>
            <Spin size="large" />
            <Typography.Paragraph style={{ marginTop: 16 }}>Signing you in…</Typography.Paragraph>
          </>
        )}
      </Card>
    </div>
  );
}
