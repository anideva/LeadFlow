import React, { useState, useEffect } from 'react';
import { verifyEmailToken } from '../../api/auth.api';

interface VerifyEmailProps {
  token: string;
  onProceedToLogin: () => void;
}

export const VerifyEmail: React.FC<VerifyEmailProps> = ({ token, onProceedToLogin }) => {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState<string>('Verifying your email address...');

  useEffect(() => {
    let isMounted = true;

    async function executeVerification() {
      if (!token || token.trim() === '') {
        if (isMounted) {
          setStatus('error');
          setMessage('No verification token provided in URL.');
        }
        return;
      }

      try {
        const res = await verifyEmailToken(token);
        if (isMounted) {
          setStatus('success');
          setMessage(res.message || 'Email verified successfully! You can now sign in.');
        }
      } catch (err: any) {
        if (isMounted) {
          setStatus('error');
          setMessage(err.message || 'Verification link is invalid or has expired.');
        }
      }
    }

    executeVerification();

    return () => {
      isMounted = false;
    };
  }, [token]);

  return (
    <div style={{ width: '100%', maxWidth: '440px', margin: '0 auto' }}>
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
          border: '1px solid #e5e7eb',
          padding: '2.5rem 2rem',
          textAlign: 'center'
        }}
      >
        {status === 'loading' && (
          <div>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>
              ⏳
            </div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#111827', margin: '0 0 0.5rem 0' }}>
              Verifying Email
            </h2>
            <p style={{ fontSize: '0.9rem', color: '#6b7280', margin: 0 }}>
              Please wait while we verify your LeadFlow account...
            </p>
          </div>
        )}

        {status === 'success' && (
          <div>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>
              ✅
            </div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#15803d', margin: '0 0 0.5rem 0' }}>
              Email Verified Successfully!
            </h2>
            <p style={{ fontSize: '0.9rem', color: '#374151', lineHeight: 1.5, marginBottom: '1.75rem' }}>
              {message}
            </p>
            <button
              type="button"
              onClick={onProceedToLogin}
              style={{
                width: '100%',
                padding: '0.75rem',
                backgroundColor: '#1e40af',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Proceed to Sign In
            </button>
          </div>
        )}

        {status === 'error' && (
          <div>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>
              ❌
            </div>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#b91c1c', margin: '0 0 0.5rem 0' }}>
              Verification Failed
            </h2>
            <p style={{ fontSize: '0.9rem', color: '#4b5563', lineHeight: 1.5, marginBottom: '1.75rem' }}>
              {message}
            </p>
            <button
              type="button"
              onClick={onProceedToLogin}
              style={{
                width: '100%',
                padding: '0.75rem',
                backgroundColor: '#1e40af',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Return to Sign In
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
