import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AuthPage } from './components/auth/AuthPage';
import { WorkflowList } from './pages/WorkflowList';
import { WorkflowEditor } from './pages/WorkflowEditor';
import { LeadDiscovery } from './pages/LeadDiscovery';

interface HealthStatus {
  status: string;
  service: string;
  uptime: number;
  timestamp: string;
}

function AppContent() {
  const { user, workspace, isLoading, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<'discovery' | 'workflows' | 'editor' | 'health'>('discovery');
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);

  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      fetch('/api/health')
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
          return res.json();
        })
        .then((data: HealthStatus) => setHealth(data))
        .catch((err) => setHealthError(err.message));
    }
  }, [user]);

  const handleCreateNew = () => {
    setSelectedWorkflowId(null);
    setActiveTab('editor');
  };

  const handleSelectWorkflow = (id: string) => {
    setSelectedWorkflowId(id);
    setActiveTab('editor');
  };

  const handleBackToList = () => {
    setSelectedWorkflowId(null);
    setActiveTab('workflows');
  };

  // 1. Loading State during session check (/api/auth/me)
  if (isLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f9fafb',
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <span style={{ fontSize: '1.75rem', fontWeight: 800, color: '#1e40af' }}>LeadFlow</span>
          <span
            style={{
              fontSize: '0.75rem',
              backgroundColor: '#dbeafe',
              color: '#1e40af',
              padding: '0.15rem 0.4rem',
              borderRadius: '4px',
              fontWeight: 700
            }}
          >
            Phase 10
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#6b7280', fontSize: '0.9rem' }}>
          <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⏳</span>
          <span>Verifying authenticated session...</span>
        </div>
      </div>
    );
  }

  // 2. Unauthenticated State -> Render Authentication Screen (Login / Register)
  if (!user) {
    return <AuthPage />;
  }

  // 3. Authenticated State -> Render Full LeadFlow Application
  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', minHeight: '100vh', backgroundColor: '#f9fafb' }}>
      {/* Global Navigation Header */}
      <header
        style={{
          backgroundColor: '#ffffff',
          borderBottom: '1px solid #e5e7eb',
          padding: '0.75rem 2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#1e40af' }}>LeadFlow</span>
            <span
              style={{
                fontSize: '0.7rem',
                backgroundColor: '#dbeafe',
                color: '#1e40af',
                padding: '0.15rem 0.4rem',
                borderRadius: '4px',
                fontWeight: 600
              }}
            >
              Phase 10
            </span>
          </div>

          <nav style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => {
                setSelectedWorkflowId(null);
                setActiveTab('discovery');
              }}
              style={{
                padding: '0.4rem 0.8rem',
                border: 'none',
                borderRadius: '6px',
                backgroundColor: activeTab === 'discovery' ? '#eff6ff' : 'transparent',
                color: activeTab === 'discovery' ? '#1d4ed8' : '#4b5563',
                fontWeight: 600,
                fontSize: '0.875rem',
                cursor: 'pointer'
              }}
            >
              Lead Discovery
            </button>
            <button
              onClick={handleBackToList}
              style={{
                padding: '0.4rem 0.8rem',
                border: 'none',
                borderRadius: '6px',
                backgroundColor: activeTab === 'workflows' || activeTab === 'editor' ? '#eff6ff' : 'transparent',
                color: activeTab === 'workflows' || activeTab === 'editor' ? '#1d4ed8' : '#4b5563',
                fontWeight: 600,
                fontSize: '0.875rem',
                cursor: 'pointer'
              }}
            >
              Workflows
            </button>
            <button
              onClick={() => setActiveTab('health')}
              style={{
                padding: '0.4rem 0.8rem',
                border: 'none',
                borderRadius: '6px',
                backgroundColor: activeTab === 'health' ? '#eff6ff' : 'transparent',
                color: activeTab === 'health' ? '#1d4ed8' : '#4b5563',
                fontWeight: 600,
                fontSize: '0.875rem',
                cursor: 'pointer'
              }}
            >
              System Health
            </button>
          </nav>
        </div>

        {/* User Session & Workspace Info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }}>
            {workspace && (
              <span
                style={{
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                  padding: '0.2rem 0.5rem',
                  borderRadius: '4px',
                  fontWeight: 600,
                  border: '1px solid #e5e7eb'
                }}
              >
                🏢 {workspace.name}
              </span>
            )}
            <span style={{ color: '#4b5563', fontWeight: 500 }}>
              👤 {user.name} ({user.email})
            </span>
          </div>

          <button
            type="button"
            onClick={() => logout()}
            style={{
              padding: '0.35rem 0.75rem',
              backgroundColor: '#ffffff',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              color: '#dc2626',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main>
        {activeTab === 'discovery' && <LeadDiscovery />}

        {activeTab === 'workflows' && (
          <WorkflowList
            onSelectWorkflow={handleSelectWorkflow}
            onCreateNew={handleCreateNew}
          />
        )}

        {activeTab === 'editor' && (
          <WorkflowEditor
            workflowId={selectedWorkflowId}
            onBack={handleBackToList}
          />
        )}

        {activeTab === 'health' && (
          <div style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
            <div style={{ padding: '1.5rem', backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}>
              <h3 style={{ margin: '0 0 1rem 0', color: '#111827' }}>Backend API Status</h3>
              {health && (
                <div style={{ fontSize: '0.875rem', lineHeight: 1.6 }}>
                  <p><strong>Status:</strong> <span style={{ color: '#15803d', fontWeight: 600 }}>{health.status}</span></p>
                  <p><strong>Service:</strong> {health.service}</p>
                  <p><strong>Uptime:</strong> {health.uptime.toFixed(1)} seconds</p>
                  <p><strong>Timestamp:</strong> {health.timestamp}</p>
                </div>
              )}
              {healthError && <p style={{ color: '#dc2626', fontSize: '0.875rem' }}>Backend connection error: {healthError}</p>}
              {!health && !healthError && <p style={{ color: '#6b7280' }}>Connecting to backend API...</p>}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
