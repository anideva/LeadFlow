import React, { useState } from 'react';
import { Login } from './Login';
import { Register } from './Register';

export const AuthPage: React.FC = () => {
  const [mode, setMode] = useState<'login' | 'register'>('login');

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#f9fafb',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '2rem 1rem',
        boxSizing: 'border-box',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}
    >
      {/* Brand Header */}
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '2rem', fontWeight: 800, color: '#1e40af', letterSpacing: '-0.025em' }}>
            LeadFlow
          </span>
          <span
            style={{
              fontSize: '0.75rem',
              backgroundColor: '#dbeafe',
              color: '#1e40af',
              padding: '0.2rem 0.5rem',
              borderRadius: '4px',
              fontWeight: 700
            }}
          >
            Phase 10
          </span>
        </div>
        <p style={{ fontSize: '0.95rem', color: '#4b5563', margin: 0 }}>
          Omnichannel Lead Engine & Automated Prospecting Platform
        </p>
      </div>

      {/* Auth Card View */}
      {mode === 'login' ? (
        <Login onSwitchToRegister={() => setMode('register')} />
      ) : (
        <Register onSwitchToLogin={() => setMode('login')} />
      )}

      {/* Security & Provenance Note */}
      <div style={{ textAlign: 'center', marginTop: '2rem', color: '#9ca3af', fontSize: '0.8rem' }}>
        🔒 Secured by HTTP-Only Cookie Authentication &bull; LeadFlow Multi-Tenant Architecture
      </div>
    </div>
  );
};
