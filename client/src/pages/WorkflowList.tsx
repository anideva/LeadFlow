import React, { useEffect, useState } from 'react';
import {
  fetchWorkflows,
  archiveWorkflow,
  updateWorkflow,
  IWorkflow,
  WorkflowStatus
} from '../api/workflow.api';

interface WorkflowListProps {
  onSelectWorkflow: (workflowId: string) => void;
  onCreateNew: () => void;
}

export const WorkflowList: React.FC<WorkflowListProps> = ({
  onSelectWorkflow,
  onCreateNew
}) => {
  const [workflows, setWorkflows] = useState<IWorkflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  const loadWorkflows = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchWorkflows({
        search: searchTerm || undefined,
        status: statusFilter || undefined,
        limit: 50
      });
      setWorkflows(res.data);
    } catch (err: any) {
      setError(err.message || 'Failed to load workflows.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkflows();
  }, [statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadWorkflows();
  };

  const handleStatusChange = async (workflow: IWorkflow, newStatus: WorkflowStatus) => {
    try {
      setError(null);
      await updateWorkflow(workflow._id, { status: newStatus });
      await loadWorkflows();
    } catch (err: any) {
      setError(err.message || `Failed to change status to ${newStatus}`);
    }
  };

  const handleArchive = async (workflowId: string, name: string) => {
    if (!window.confirm(`Are you sure you want to archive workflow "${name}"?`)) {
      return;
    }
    try {
      setError(null);
      await archiveWorkflow(workflowId);
      await loadWorkflows();
    } catch (err: any) {
      setError(err.message || 'Failed to archive workflow');
    }
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#111827' }}>Workflow Automations</h2>
          <p style={{ margin: '0.25rem 0 0 0', color: '#6b7280', fontSize: '0.875rem' }}>
            Deterministic event-driven workflows for your workspace.
          </p>
        </div>
        <button
          onClick={onCreateNew}
          style={{
            backgroundColor: '#2563eb',
            color: '#fff',
            border: 'none',
            padding: '0.6rem 1.2rem',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 500,
            fontSize: '0.875rem'
          }}
        >
          + Create Workflow
        </button>
      </div>

      {error && (
        <div
          style={{
            backgroundColor: '#fef2f2',
            border: '1px solid #f87171',
            borderRadius: '6px',
            padding: '0.75rem 1rem',
            color: '#b91c1c',
            marginBottom: '1rem',
            fontSize: '0.875rem'
          }}
        >
          <strong>Error: </strong> {error}
        </div>
      )}

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '0.5rem', flex: 1 }}>
          <input
            type="text"
            placeholder="Search by workflow name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              flex: 1,
              padding: '0.5rem 0.75rem',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '0.875rem'
            }}
          />
          <button
            type="submit"
            style={{
              padding: '0.5rem 1rem',
              border: '1px solid #d1d5db',
              backgroundColor: '#f9fafb',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.875rem'
            }}
          >
            Search
          </button>
        </form>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            padding: '0.5rem 0.75rem',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            fontSize: '0.875rem',
            backgroundColor: '#fff'
          }}
        >
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
        </select>
      </div>

      {/* Workflows Table */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#6b7280' }}>Loading workflows...</div>
      ) : workflows.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '3rem',
            backgroundColor: '#f9fafb',
            border: '1px dashed #d1d5db',
            borderRadius: '8px',
            color: '#6b7280'
          }}
        >
          <p style={{ margin: '0 0 1rem 0' }}>No workflows found in this workspace.</p>
          <button
            onClick={onCreateNew}
            style={{
              backgroundColor: '#2563eb',
              color: '#fff',
              border: 'none',
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Create Your First Workflow
          </button>
        </div>
      ) : (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <tr>
                <th style={{ padding: '0.75rem 1rem', color: '#4b5563', fontWeight: 600 }}>Workflow Name</th>
                <th style={{ padding: '0.75rem 1rem', color: '#4b5563', fontWeight: 600 }}>Trigger</th>
                <th style={{ padding: '0.75rem 1rem', color: '#4b5563', fontWeight: 600 }}>Nodes</th>
                <th style={{ padding: '0.75rem 1rem', color: '#4b5563', fontWeight: 600 }}>Status</th>
                <th style={{ padding: '0.75rem 1rem', color: '#4b5563', fontWeight: 600 }}>Created</th>
                <th style={{ padding: '0.75rem 1rem', color: '#4b5563', fontWeight: 600, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {workflows.map((wf) => (
                <tr key={wf._id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <div style={{ fontWeight: 600, color: '#111827' }}>{wf.name}</div>
                    {wf.description && (
                      <div style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: '0.15rem' }}>
                        {wf.description}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', color: '#374151' }}>
                    <span
                      style={{
                        padding: '0.2rem 0.5rem',
                        backgroundColor: '#eff6ff',
                        color: '#1d4ed8',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 500
                      }}
                    >
                      {wf.triggerType}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', color: '#6b7280' }}>
                    {wf.nodes?.length || 0} nodes
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span
                      style={{
                        padding: '0.25rem 0.5rem',
                        borderRadius: '9999px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        backgroundColor:
                          wf.status === 'active'
                            ? '#dcfce7'
                            : wf.status === 'paused'
                            ? '#fef3c7'
                            : '#f3f4f6',
                        color:
                          wf.status === 'active'
                            ? '#15803d'
                            : wf.status === 'paused'
                            ? '#b45309'
                            : '#4b5563'
                      }}
                    >
                      {wf.status.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', color: '#6b7280', fontSize: '0.75rem' }}>
                    {new Date(wf.createdAt).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>
                    <button
                      onClick={() => onSelectWorkflow(wf._id)}
                      style={{
                        marginRight: '0.5rem',
                        padding: '0.35rem 0.75rem',
                        backgroundColor: '#2563eb',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.75rem'
                      }}
                    >
                      Edit
                    </button>

                    {wf.status === 'active' ? (
                      <button
                        onClick={() => handleStatusChange(wf, 'paused')}
                        style={{
                          marginRight: '0.5rem',
                          padding: '0.35rem 0.6rem',
                          backgroundColor: '#fef3c7',
                          color: '#b45309',
                          border: '1px solid #fde68a',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.75rem'
                        }}
                      >
                        Pause
                      </button>
                    ) : (
                      <button
                        onClick={() => handleStatusChange(wf, 'active')}
                        style={{
                          marginRight: '0.5rem',
                          padding: '0.35rem 0.6rem',
                          backgroundColor: '#dcfce7',
                          color: '#15803d',
                          border: '1px solid #bbf7d0',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.75rem'
                        }}
                      >
                        Activate
                      </button>
                    )}

                    <button
                      onClick={() => handleArchive(wf._id, wf.name)}
                      style={{
                        padding: '0.35rem 0.6rem',
                        backgroundColor: '#fff',
                        color: '#dc2626',
                        border: '1px solid #fecaca',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.75rem'
                      }}
                    >
                      Archive
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
