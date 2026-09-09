import { useEffect, useState } from 'react';

interface HealthStatus {
  status: string;
  service: string;
  uptime: number;
  timestamp: string;
}

export function App() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
      })
      .then((data: HealthStatus) => setHealth(data))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
      <h1>LeadFlow</h1>
      <p>Omnichannel Lead Generation & Workflow Automation Platform</p>
      
      <div style={{ marginTop: '2rem', padding: '1rem', border: '1px solid #ccc', borderRadius: '8px' }}>
        <h3>Backend API Status</h3>
        {health && (
          <div>
            <p><strong>Status:</strong> {health.status}</p>
            <p><strong>Service:</strong> {health.service}</p>
            <p><strong>Timestamp:</strong> {health.timestamp}</p>
          </div>
        )}
        {error && <p style={{ color: 'red' }}>Backend connection error: {error}</p>}
        {!health && !error && <p>Connecting to backend API...</p>}
      </div>
    </div>
  );
}

export default App;
