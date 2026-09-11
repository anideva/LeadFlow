import React, { useState, useEffect, useCallback } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Handle,
  Position,
  Node,
  Edge,
  Connection,
  NodeProps,
  NodeChange,
  EdgeChange
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import {
  fetchWorkflowById,
  createWorkflow,
  updateWorkflow,
  testWorkflow,
  IWorkflow,
  IWorkflowNode,
  IWorkflowEdge,
  WorkflowStatus,
  WorkflowTriggerType,
  WorkflowNodeType,
  WorkflowExecutionSummary
} from '../api/workflow.api';
import { fetchEmailTemplates, EmailTemplateItem } from '../api/template.api';

// Custom Node: Trigger
function TriggerNode({ data, selected }: NodeProps) {
  return (
    <div
      style={{
        padding: '10px 14px',
        borderRadius: '8px',
        border: selected ? '2px solid #2563eb' : '1px solid #bfdbfe',
        backgroundColor: '#eff6ff',
        minWidth: '170px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}
    >
      <div style={{ fontSize: '10px', textTransform: 'uppercase', color: '#1d4ed8', fontWeight: 700 }}>
        ⚡ Trigger
      </div>
      <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e3a8a', marginTop: '3px' }}>
        {(data?.triggerType as string) || 'lead_created'}
      </div>
      <Handle type="source" position={Position.Bottom} id="out" style={{ backgroundColor: '#2563eb' }} />
    </div>
  );
}

// Custom Node: Condition
function ConditionNode({ data, selected }: NodeProps) {
  const field = (data?.field as string) || 'field';
  const op = (data?.operator as string) || 'equals';
  const val = data?.value !== undefined ? String(data.value) : '';
  const label = op === 'exists' || op === 'not_exists' ? `${field} ${op}` : `${field} ${op} "${val}"`;

  return (
    <div
      style={{
        padding: '10px 14px',
        borderRadius: '8px',
        border: selected ? '2px solid #d97706' : '1px solid #fde68a',
        backgroundColor: '#fffbeb',
        minWidth: '190px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}
    >
      <Handle type="target" position={Position.Top} id="in" style={{ backgroundColor: '#d97706' }} />
      <div style={{ fontSize: '10px', textTransform: 'uppercase', color: '#b45309', fontWeight: 700 }}>
        ⚖️ Condition
      </div>
      <div style={{ fontSize: '12px', fontWeight: 600, color: '#78350f', marginTop: '3px' }}>
        {data?.field ? label : 'Configure condition...'}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: '8px',
          fontSize: '10px',
          fontWeight: 700
        }}
      >
        <span style={{ color: '#15803d' }}>YES</span>
        <span style={{ color: '#b91c1c' }}>NO</span>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        id="yes"
        style={{ left: '25%', backgroundColor: '#15803d' }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="no"
        style={{ left: '75%', backgroundColor: '#b91c1c' }}
      />
    </div>
  );
}

// Custom Node: Action
function ActionNode({ data, selected }: NodeProps) {
  const isEmail = data?.actionType === 'send_email';

  return (
    <div
      style={{
        padding: '10px 14px',
        borderRadius: '8px',
        border: selected ? '2px solid #7c3aed' : '1px solid #ddd6fe',
        backgroundColor: '#f5f3ff',
        minWidth: '190px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}
    >
      <Handle type="target" position={Position.Top} id="in" style={{ backgroundColor: '#7c3aed' }} />
      <div style={{ fontSize: '10px', textTransform: 'uppercase', color: '#6d28d9', fontWeight: 700 }}>
        {isEmail ? '✉️ Action: Send Email' : '✏️ Action: Update Lead'}
      </div>
      <div style={{ fontSize: '12px', fontWeight: 600, color: '#4c1d95', marginTop: '3px' }}>
        {isEmail
          ? data?.templateName
            ? `Template: ${data.templateName}`
            : data?.templateId
            ? `ID: ${String(data.templateId).slice(0, 8)}...`
            : 'Select template...'
          : data?.field
          ? `Set ${data.field} = "${data.value ?? ''}"`
          : 'Configure update...'}
      </div>
      <Handle type="source" position={Position.Bottom} id="out" style={{ backgroundColor: '#7c3aed' }} />
    </div>
  );
}

const nodeTypes = {
  trigger: TriggerNode,
  condition: ConditionNode,
  action: ActionNode
};

const ALLOWED_CONDITION_FIELDS = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'company',
  'source',
  'status',
  'priority'
];

const ALLOWED_UPDATE_FIELDS = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'company',
  'source',
  'status',
  'priority'
];

const OPERATORS = [
  'equals',
  'not_equals',
  'contains',
  'not_contains',
  'exists',
  'not_exists'
];

interface WorkflowEditorProps {
  workflowId: string | null;
  onBack: () => void;
}

export const WorkflowEditor: React.FC<WorkflowEditorProps> = ({ workflowId, onBack }) => {
  const [name, setName] = useState('New Lead Workflow');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<WorkflowStatus>('draft');
  const [triggerType, setTriggerType] = useState<WorkflowTriggerType>('lead_created');

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const [templates, setTemplates] = useState<EmailTemplateItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Test modal state
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testLeadId, setTestLeadId] = useState('');
  const [testRunning, setTestRunning] = useState(false);
  const [testResult, setTestResult] = useState<WorkflowExecutionSummary | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  // Load templates for action node
  useEffect(() => {
    fetchEmailTemplates()
      .then((data) => setTemplates(data.filter((t) => !t.isArchived)))
      .catch((err) => console.warn('Could not load templates for dropdown:', err));
  }, []);

  // Load workflow if editing existing
  useEffect(() => {
    if (workflowId) {
      setLoading(true);
      setError(null);
      fetchWorkflowById(workflowId)
        .then((wf) => {
          setName(wf.name);
          setDescription(wf.description || '');
          setStatus(wf.status);
          setTriggerType(wf.triggerType);

          const rfNodes: Node[] = (wf.nodes || []).map((n) => ({
            id: n.id,
            type: n.type,
            position: n.position || { x: 100, y: 100 },
            data: { ...n.data }
          }));

          const rfEdges: Edge[] = (wf.edges || []).map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            sourceHandle: e.sourceHandle || undefined,
            label: e.sourceHandle === 'yes' ? 'YES' : e.sourceHandle === 'no' ? 'NO' : undefined
          }));

          setNodes(rfNodes);
          setEdges(rfEdges);
        })
        .catch((err: any) => setError(err.message || 'Failed to load workflow'))
        .finally(() => setLoading(false));
    } else {
      // Default new workflow with a single trigger node
      setNodes([
        {
          id: 'node-trigger-1',
          type: 'trigger',
          position: { x: 250, y: 50 },
          data: { triggerType: 'lead_created' }
        }
      ]);
      setEdges([]);
    }
  }, [workflowId]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            id: `edge-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            label: params.sourceHandle === 'yes' ? 'YES' : params.sourceHandle === 'no' ? 'NO' : undefined
          },
          eds
        )
      );
    },
    []
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  // Adding nodes
  const addTriggerNode = () => {
    if (nodes.some((n) => n.type === 'trigger')) {
      alert('Only one trigger node is allowed per workflow.');
      return;
    }
    const id = `node-trigger-${Date.now()}`;
    const newNode: Node = {
      id,
      type: 'trigger',
      position: { x: 250, y: 50 },
      data: { triggerType }
    };
    setNodes((prev) => [...prev, newNode]);
    setSelectedNodeId(id);
  };

  const addConditionNode = () => {
    const id = `node-cond-${Date.now()}`;
    const newNode: Node = {
      id,
      type: 'condition',
      position: { x: 250, y: 180 },
      data: {
        conditionType: 'lead_field',
        field: 'priority',
        operator: 'equals',
        value: 'high'
      }
    };
    setNodes((prev) => [...prev, newNode]);
    setSelectedNodeId(id);
  };

  const addActionEmailNode = () => {
    const id = `node-act-email-${Date.now()}`;
    const firstTemplate = templates.length > 0 ? templates[0] : null;
    const newNode: Node = {
      id,
      type: 'action',
      position: { x: 150, y: 320 },
      data: {
        actionType: 'send_email',
        templateId: firstTemplate?._id || '',
        templateName: firstTemplate?.name || ''
      }
    };
    setNodes((prev) => [...prev, newNode]);
    setSelectedNodeId(id);
  };

  const addActionUpdateLeadNode = () => {
    const id = `node-act-lead-${Date.now()}`;
    const newNode: Node = {
      id,
      type: 'action',
      position: { x: 350, y: 320 },
      data: {
        actionType: 'update_lead',
        field: 'status',
        value: 'contacted'
      }
    };
    setNodes((prev) => [...prev, newNode]);
    setSelectedNodeId(id);
  };

  const deleteSelectedNode = () => {
    if (!selectedNodeId) return;
    setNodes((prev) => prev.filter((n) => n.id !== selectedNodeId));
    setEdges((prev) => prev.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
    setSelectedNodeId(null);
  };

  const updateSelectedNodeData = (key: string, val: any) => {
    if (!selectedNodeId) return;
    setNodes((prev) =>
      prev.map((n) => {
        if (n.id === selectedNodeId) {
          const updatedData = { ...n.data, [key]: val };
          if (n.type === 'trigger' && key === 'triggerType') {
            setTriggerType(val);
          }
          return { ...n, data: updatedData };
        }
        return n;
      })
    );
  };

  const handleSave = async (desiredStatus?: WorkflowStatus) => {
    try {
      setSaving(true);
      setError(null);
      setSuccessMsg(null);

      const targetStatus = desiredStatus || status;

      const backendNodes: IWorkflowNode[] = nodes.map((n) => ({
        id: n.id,
        type: n.type as WorkflowNodeType,
        position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
        data: n.data
      }));

      const backendEdges: IWorkflowEdge[] = edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle || undefined
      }));

      const triggerNode = nodes.find((n) => n.type === 'trigger');
      const currentTriggerType = (triggerNode?.data?.triggerType as WorkflowTriggerType) || triggerType;

      let saved: IWorkflow;
      if (workflowId) {
        saved = await updateWorkflow(workflowId, {
          name: name.trim(),
          description: description.trim() || undefined,
          status: targetStatus,
          triggerType: currentTriggerType,
          nodes: backendNodes,
          edges: backendEdges
        });
      } else {
        saved = await createWorkflow({
          name: name.trim(),
          description: description.trim() || undefined,
          status: targetStatus,
          triggerType: currentTriggerType,
          nodes: backendNodes,
          edges: backendEdges
        });
      }

      setStatus(saved.status);
      setSuccessMsg(`Workflow saved successfully in status: "${saved.status}".`);
    } catch (err: any) {
      setError(err.message || 'Validation error while saving workflow.');
    } finally {
      setSaving(false);
    }
  };

  const handleRunTest = async () => {
    if (!workflowId) {
      setError('Please save the workflow before testing execution.');
      return;
    }
    if (!testLeadId || testLeadId.trim() === '') {
      setTestError('A valid Lead ID is required.');
      return;
    }

    try {
      setTestRunning(true);
      setTestError(null);
      setTestResult(null);

      const summary = await testWorkflow(workflowId, testLeadId.trim());
      setTestResult(summary);
    } catch (err: any) {
      setTestError(err.message || 'Execution test failed.');
    } finally {
      setTestRunning(false);
    }
  };

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  return (
    <div style={{ height: 'calc(100vh - 60px)', display: 'flex', flexDirection: 'column', backgroundColor: '#f9fafb' }}>
      {/* Top Controls Bar */}
      <div
        style={{
          padding: '0.75rem 1.5rem',
          backgroundColor: '#ffffff',
          borderBottom: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button
            onClick={onBack}
            style={{
              padding: '0.4rem 0.8rem',
              backgroundColor: '#f3f4f6',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '0.875rem'
            }}
          >
            ← Back
          </button>
          <div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Workflow Name"
              style={{
                fontSize: '1.1rem',
                fontWeight: 600,
                border: '1px solid transparent',
                borderRadius: '4px',
                padding: '0.2rem 0.4rem',
                outline: 'none'
              }}
            />
            <div style={{ fontSize: '0.75rem', color: '#6b7280', paddingLeft: '0.4rem' }}>
              Status:{' '}
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as WorkflowStatus)}
                style={{
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  padding: '0.1rem 0.4rem',
                  fontSize: '0.75rem'
                }}
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
              </select>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {workflowId && status === 'active' && (
            <button
              onClick={() => {
                setTestModalOpen(true);
                setTestResult(null);
                setTestError(null);
              }}
              style={{
                backgroundColor: '#059669',
                color: '#fff',
                border: 'none',
                padding: '0.5rem 1rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 500,
                fontSize: '0.875rem'
              }}
            >
              ▶ Test Execution
            </button>
          )}

          <button
            onClick={() => handleSave('active')}
            disabled={saving}
            style={{
              backgroundColor: '#16a34a',
              color: '#fff',
              border: 'none',
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontWeight: 500,
              fontSize: '0.875rem'
            }}
          >
            {saving ? 'Validating...' : 'Save & Activate'}
          </button>

          <button
            onClick={() => handleSave()}
            disabled={saving}
            style={{
              backgroundColor: '#2563eb',
              color: '#fff',
              border: 'none',
              padding: '0.5rem 1rem',
              borderRadius: '6px',
              cursor: saving ? 'not-allowed' : 'pointer',
              fontWeight: 500,
              fontSize: '0.875rem'
            }}
          >
            {saving ? 'Saving...' : 'Save Workflow'}
          </button>
        </div>
      </div>

      {/* Error / Success Notifications */}
      {error && (
        <div
          style={{
            backgroundColor: '#fef2f2',
            borderBottom: '1px solid #f87171',
            padding: '0.75rem 1.5rem',
            color: '#b91c1c',
            fontSize: '0.875rem',
            fontWeight: 500
          }}
        >
          <strong>Validation Error:</strong> {error}
        </div>
      )}
      {successMsg && (
        <div
          style={{
            backgroundColor: '#f0fdf4',
            borderBottom: '1px solid #86efac',
            padding: '0.5rem 1.5rem',
            color: '#15803d',
            fontSize: '0.875rem'
          }}
        >
          {successMsg}
        </div>
      )}

      {/* Main Canvas & Sidebar Container */}
      <div style={{ flex: 1, display: 'flex', position: 'relative' }}>
        {/* Node Palette (Left Floating) */}
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: 16,
            zIndex: 10,
            backgroundColor: '#ffffff',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            padding: '0.75rem',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem'
          }}
        >
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4b5563', textTransform: 'uppercase' }}>
            Add Node
          </div>
          <button
            onClick={addTriggerNode}
            disabled={nodes.some((n) => n.type === 'trigger')}
            style={{
              padding: '0.4rem 0.75rem',
              backgroundColor: nodes.some((n) => n.type === 'trigger') ? '#f3f4f6' : '#eff6ff',
              color: nodes.some((n) => n.type === 'trigger') ? '#9ca3af' : '#1d4ed8',
              border: '1px solid #bfdbfe',
              borderRadius: '4px',
              fontSize: '0.75rem',
              cursor: nodes.some((n) => n.type === 'trigger') ? 'not-allowed' : 'pointer',
              fontWeight: 600,
              textAlign: 'left'
            }}
          >
            ⚡ Trigger Node
          </button>
          <button
            onClick={addConditionNode}
            style={{
              padding: '0.4rem 0.75rem',
              backgroundColor: '#fffbeb',
              color: '#b45309',
              border: '1px solid #fde68a',
              borderRadius: '4px',
              fontSize: '0.75rem',
              cursor: 'pointer',
              fontWeight: 600,
              textAlign: 'left'
            }}
          >
            ⚖️ Condition Node
          </button>
          <button
            onClick={addActionEmailNode}
            style={{
              padding: '0.4rem 0.75rem',
              backgroundColor: '#f5f3ff',
              color: '#6d28d9',
              border: '1px solid #ddd6fe',
              borderRadius: '4px',
              fontSize: '0.75rem',
              cursor: 'pointer',
              fontWeight: 600,
              textAlign: 'left'
            }}
          >
            ✉️ Action: Send Email
          </button>
          <button
            onClick={addActionUpdateLeadNode}
            style={{
              padding: '0.4rem 0.75rem',
              backgroundColor: '#f5f3ff',
              color: '#6d28d9',
              border: '1px solid #ddd6fe',
              borderRadius: '4px',
              fontSize: '0.75rem',
              cursor: 'pointer',
              fontWeight: 600,
              textAlign: 'left'
            }}
          >
            ✏️ Action: Update Lead
          </button>
        </div>

        {/* React Flow Canvas */}
        <div style={{ flex: 1, height: '100%' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: '4rem' }}>Loading workflow canvas...</div>
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              nodeTypes={nodeTypes}
              fitView
            >
              <Background gap={16} size={1} color="#e5e7eb" />
              <Controls />
            </ReactFlow>
          )}
        </div>

        {/* Node Configuration Panel (Right Sidebar) */}
        {selectedNode && (() => {
          const nodeData = (selectedNode.data || {}) as Record<string, any>;
          return (
            <div
              style={{
                width: '320px',
                backgroundColor: '#ffffff',
                borderLeft: '1px solid #e5e7eb',
                padding: '1.25rem',
                overflowY: 'auto'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', color: '#111827' }}>
                  Configure {selectedNode.type}
                </h3>
                <button
                  onClick={deleteSelectedNode}
                  style={{
                    backgroundColor: '#fee2e2',
                    color: '#b91c1c',
                    border: '1px solid #fca5a5',
                    borderRadius: '4px',
                    padding: '0.2rem 0.5rem',
                    fontSize: '0.75rem',
                    cursor: 'pointer'
                  }}
                >
                  Delete
                </button>
              </div>

              <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '1rem' }}>
                ID: <code>{selectedNode.id}</code>
              </div>

              {/* Trigger Configuration */}
              {selectedNode.type === 'trigger' && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                    Trigger Event
                  </label>
                  <select
                    value={String(nodeData.triggerType || 'lead_created')}
                    onChange={(e) => updateSelectedNodeData('triggerType', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      borderRadius: '6px',
                      border: '1px solid #d1d5db',
                      fontSize: '0.875rem'
                    }}
                  >
                    <option value="lead_created">Lead Created</option>
                    <option value="lead_updated">Lead Updated</option>
                    <option value="manual">Manual Trigger</option>
                  </select>
                </div>
              )}

              {/* Condition Configuration */}
              {selectedNode.type === 'condition' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                      Lead Field
                    </label>
                    <select
                      value={String(nodeData.field || 'priority')}
                      onChange={(e) => updateSelectedNodeData('field', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        borderRadius: '6px',
                        border: '1px solid #d1d5db',
                        fontSize: '0.875rem'
                      }}
                    >
                      {ALLOWED_CONDITION_FIELDS.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                      Operator
                    </label>
                    <select
                      value={String(nodeData.operator || 'equals')}
                      onChange={(e) => updateSelectedNodeData('operator', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        borderRadius: '6px',
                        border: '1px solid #d1d5db',
                        fontSize: '0.875rem'
                      }}
                    >
                      {OPERATORS.map((op) => (
                        <option key={op} value={op}>
                          {op}
                        </option>
                      ))}
                    </select>
                  </div>

                  {nodeData.operator !== 'exists' && nodeData.operator !== 'not_exists' && (
                    <div>
                      <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                        Comparison Value
                      </label>
                      <input
                        type="text"
                        value={nodeData.value !== undefined && nodeData.value !== null ? String(nodeData.value) : ''}
                        onChange={(e) => updateSelectedNodeData('value', e.target.value)}
                        placeholder="e.g. high, qualified, etc."
                        style={{
                          width: '100%',
                          padding: '0.5rem',
                          borderRadius: '6px',
                          border: '1px solid #d1d5db',
                          fontSize: '0.875rem'
                        }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Action Configuration */}
              {selectedNode.type === 'action' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                      Action Type
                    </label>
                    <select
                      value={String(nodeData.actionType || 'send_email')}
                      onChange={(e) => updateSelectedNodeData('actionType', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.5rem',
                        borderRadius: '6px',
                        border: '1px solid #d1d5db',
                        fontSize: '0.875rem'
                      }}
                    >
                      <option value="send_email">Send Email</option>
                      <option value="update_lead">Update Lead</option>
                    </select>
                  </div>

                  {nodeData.actionType === 'send_email' && (
                    <div>
                      <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                        Email Template
                      </label>
                      {templates.length === 0 ? (
                        <p style={{ color: '#b45309', fontSize: '0.8rem' }}>
                          No templates found in this workspace. Please create an email template first.
                        </p>
                      ) : (
                        <select
                          value={String(nodeData.templateId || '')}
                          onChange={(e) => {
                            const chosen = templates.find((t) => t._id === e.target.value);
                            updateSelectedNodeData('templateId', e.target.value);
                            if (chosen) {
                              updateSelectedNodeData('templateName', chosen.name);
                            }
                          }}
                          style={{
                            width: '100%',
                            padding: '0.5rem',
                            borderRadius: '6px',
                            border: '1px solid #d1d5db',
                            fontSize: '0.875rem'
                          }}
                        >
                          <option value="">-- Select Template --</option>
                          {templates.map((t) => (
                            <option key={t._id} value={t._id}>
                              {t.name} ({t.subject})
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}

                  {nodeData.actionType === 'update_lead' && (
                    <>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                          Lead Field to Update
                        </label>
                        <select
                          value={String(nodeData.field || 'status')}
                          onChange={(e) => updateSelectedNodeData('field', e.target.value)}
                          style={{
                            width: '100%',
                            padding: '0.5rem',
                            borderRadius: '6px',
                            border: '1px solid #d1d5db',
                            fontSize: '0.875rem'
                          }}
                        >
                          {ALLOWED_UPDATE_FIELDS.map((f) => (
                            <option key={f} value={f}>
                              {f}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                          New Value
                        </label>
                        <input
                          type="text"
                          value={nodeData.value !== undefined && nodeData.value !== null ? String(nodeData.value) : ''}
                          onChange={(e) => updateSelectedNodeData('value', e.target.value)}
                          placeholder="e.g. contacted, lost"
                          style={{
                            width: '100%',
                            padding: '0.5rem',
                            borderRadius: '6px',
                            border: '1px solid #d1d5db',
                            fontSize: '0.875rem'
                          }}
                        />
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Test Execution Modal */}
      {testModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50
          }}
        >
          <div
            style={{
              backgroundColor: '#fff',
              borderRadius: '8px',
              padding: '1.5rem',
              maxWidth: '550px',
              width: '100%',
              maxHeight: '80vh',
              overflowY: 'auto'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#111827' }}>Test Workflow Execution</h3>
              <button
                onClick={() => setTestModalOpen(false)}
                style={{
                  border: 'none',
                  background: 'none',
                  fontSize: '1.25rem',
                  cursor: 'pointer',
                  color: '#6b7280'
                }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 1rem 0' }}>
              Execute a deterministic dry-run of this workflow against a lead in your workspace.
            </p>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 500, marginBottom: '0.25rem' }}>
                Lead ID
              </label>
              <input
                type="text"
                placeholder="Enter 24-char ObjectId of lead..."
                value={testLeadId}
                onChange={(e) => setTestLeadId(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  fontSize: '0.875rem'
                }}
              />
            </div>

            {testError && (
              <div
                style={{
                  backgroundColor: '#fef2f2',
                  border: '1px solid #f87171',
                  borderRadius: '6px',
                  padding: '0.5rem 0.75rem',
                  color: '#b91c1c',
                  fontSize: '0.875rem',
                  marginBottom: '1rem'
                }}
              >
                {testError}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginBottom: '1rem' }}>
              <button
                onClick={() => setTestModalOpen(false)}
                style={{
                  padding: '0.4rem 0.8rem',
                  backgroundColor: '#f3f4f6',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '0.875rem'
                }}
              >
                Close
              </button>
              <button
                onClick={handleRunTest}
                disabled={testRunning}
                style={{
                  padding: '0.4rem 1rem',
                  backgroundColor: '#059669',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: testRunning ? 'not-allowed' : 'pointer',
                  fontWeight: 500,
                  fontSize: '0.875rem'
                }}
              >
                {testRunning ? 'Executing...' : 'Run Test'}
              </button>
            </div>

            {testResult && (
              <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '1rem' }}>
                <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem', color: '#111827' }}>
                  Execution Summary ({testResult.status})
                </h4>
                <div style={{ fontSize: '0.8rem', color: '#4b5563', marginBottom: '0.75rem' }}>
                  Execution ID: <code>{testResult.executionId}</code> | Steps: {testResult.stepsCount}
                </div>
                <div style={{ backgroundColor: '#f9fafb', borderRadius: '6px', padding: '0.5rem', fontSize: '0.75rem' }}>
                  {testResult.executionLog.map((step, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '0.35rem 0.5rem',
                        borderBottom: idx < testResult.executionLog.length - 1 ? '1px solid #e5e7eb' : 'none'
                      }}
                    >
                      <strong>Step {idx + 1}:</strong> [{step.nodeType.toUpperCase()}] ({step.nodeId}) —{' '}
                      <span style={{ color: step.status === 'completed' || step.status === 'executed' ? '#15803d' : '#2563eb' }}>
                        {step.status}
                      </span>
                      {step.details && (
                        <pre style={{ margin: '0.2rem 0 0 0', fontSize: '0.7rem', color: '#374151' }}>
                          {JSON.stringify(step.details, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
