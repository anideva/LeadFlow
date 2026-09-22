import React, { useState, useEffect, useCallback } from 'react';
import {
  EmailTemplate,
  fetchEmailTemplates,
  createEmailTemplate,
  updateEmailTemplate,
  archiveEmailTemplate,
  SUPPORTED_TEMPLATE_VARIABLES
} from '../api/template.api';

// Safe sample lead record for template preview
const SAMPLE_LEAD: Record<string, string> = {
  firstName: 'Sarah',
  lastName: 'Connor',
  email: 'sarah.connor@cyberdyne.test',
  phone: '+1-555-0199',
  company: 'Cyberdyne Systems',
  source: 'discovery',
  status: 'qualified',
  priority: 'high'
};

/**
 * Safely renders a template text with sample lead data without eval() or arbitrary code execution.
 */
function renderSafeTemplate(templateText: string, leadData: Record<string, string>): string {
  if (!templateText) return '';
  return templateText.replace(/\{\{([^}]+)\}\}/g, (match, rawKey) => {
    const key = rawKey.trim();
    if (key in leadData) {
      return leadData[key];
    }
    return match;
  });
}

export const EmailTemplates: React.FC = () => {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modal States: 'create' | 'edit' | null
  const [formModalOpen, setFormModalOpen] = useState<boolean>(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    subject: '',
    htmlBody: ''
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [activeInputFocus, setActiveInputFocus] = useState<'subject' | 'htmlBody'>('htmlBody');

  // Preview Modal State
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplate | null>(null);

  // Delete Confirmation Modal State
  const [templateToDelete, setTemplateToDelete] = useState<EmailTemplate | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);

  // Load templates
  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchEmailTemplates(searchQuery);
      setTemplates(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load email templates.');
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  // Open Create Form
  const handleOpenCreate = () => {
    setEditingTemplate(null);
    setFormData({
      name: '',
      subject: '',
      htmlBody: ''
    });
    setFormError(null);
    setActiveInputFocus('htmlBody');
    setFormModalOpen(true);
  };

  // Open Edit Form
  const handleOpenEdit = (t: EmailTemplate) => {
    setEditingTemplate(t);
    setFormData({
      name: t.name,
      subject: t.subject,
      htmlBody: t.htmlBody
    });
    setFormError(null);
    setActiveInputFocus('htmlBody');
    setFormModalOpen(true);
  };

  // Insert variable into active input
  const handleInsertVariable = (varName: string) => {
    const token = `{{${varName}}}`;
    if (activeInputFocus === 'subject') {
      setFormData((prev) => ({ ...prev, subject: prev.subject + token }));
    } else {
      setFormData((prev) => ({ ...prev, htmlBody: prev.htmlBody + token }));
    }
  };

  // Save Template (Create or Update)
  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setFormError('Template name is required.');
      return;
    }
    if (!formData.subject.trim()) {
      setFormError('Subject line is required.');
      return;
    }
    if (!formData.htmlBody.trim()) {
      setFormError('Email body is required.');
      return;
    }

    try {
      setSubmitting(true);
      setFormError(null);

      if (editingTemplate) {
        await updateEmailTemplate(editingTemplate._id, {
          name: formData.name.trim(),
          subject: formData.subject.trim(),
          htmlBody: formData.htmlBody.trim()
        });
        setSuccessMsg(`Updated template "${formData.name.trim()}".`);
      } else {
        await createEmailTemplate({
          name: formData.name.trim(),
          subject: formData.subject.trim(),
          htmlBody: formData.htmlBody.trim()
        });
        setSuccessMsg(`Created template "${formData.name.trim()}".`);
      }

      setFormModalOpen(false);
      await loadTemplates();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setFormError(err.message || 'Failed to save template.');
    } finally {
      setSubmitting(false);
    }
  };

  // Confirm Delete
  const handleConfirmDelete = async () => {
    if (!templateToDelete) return;
    try {
      setDeleting(true);
      await archiveEmailTemplate(templateToDelete._id);
      setSuccessMsg(`Deleted template "${templateToDelete.name}".`);
      setTemplateToDelete(null);
      await loadTemplates();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to delete template.');
      setTemplateToDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem 1.5rem', color: '#111827' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, color: '#111827' }}>
              Email Templates
            </h1>
            <span
              style={{
                fontSize: '0.75rem',
                fontWeight: 600,
                backgroundColor: '#eff6ff',
                color: '#1d4ed8',
                padding: '0.2rem 0.6rem',
                borderRadius: '9999px',
                border: '1px solid #bfdbfe'
              }}
            >
              Phase 12B
            </span>
          </div>
          <p style={{ margin: 0, color: '#4b5563', fontSize: '0.95rem' }}>
            Manage reusable email templates with lead personalization variables for campaigns and outreach.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenCreate}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            backgroundColor: '#2563eb',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            padding: '0.65rem 1.25rem',
            fontSize: '0.9rem',
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
            transition: 'background-color 0.15s'
          }}
        >
          <span>➕</span>
          <span>Create Template</span>
        </button>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div
          role="status"
          style={{
            marginBottom: '1.5rem',
            padding: '0.75rem 1rem',
            backgroundColor: '#ecfdf5',
            color: '#065f46',
            borderRadius: '8px',
            border: '1px solid #a7f3d0',
            fontSize: '0.875rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <span>✓ {successMsg}</span>
          <button
            onClick={() => setSuccessMsg(null)}
            style={{ background: 'none', border: 'none', color: '#065f46', cursor: 'pointer', fontSize: '1rem' }}
          >
            ✕
          </button>
        </div>
      )}

      {error && (
        <div
          role="alert"
          style={{
            marginBottom: '1.5rem',
            padding: '0.75rem 1rem',
            backgroundColor: '#fef2f2',
            color: '#991b1b',
            borderRadius: '8px',
            border: '1px solid #fecaca',
            fontSize: '0.875rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <span>⚠️ {error}</span>
          <button
            onClick={() => setError(null)}
            style={{ background: 'none', border: 'none', color: '#991b1b', cursor: 'pointer', fontSize: '1rem' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Search and Filter Toolbar */}
      <div
        style={{
          backgroundColor: '#ffffff',
          padding: '1rem 1.25rem',
          borderRadius: '10px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          marginBottom: '1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          flexWrap: 'wrap'
        }}
      >
        <div style={{ position: 'relative', flex: '1 1 300px', maxWidth: '400px' }}>
          <span
            style={{
              position: 'absolute',
              left: '0.75rem',
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#9ca3af',
              fontSize: '0.9rem',
              pointerEvents: 'none'
            }}
          >
            🔎
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search templates by name or subject..."
            style={{
              width: '100%',
              padding: '0.55rem 0.75rem 0.55rem 2.25rem',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              fontSize: '0.875rem',
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
        </div>

        <button
          type="button"
          onClick={loadTemplates}
          disabled={loading}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.35rem',
            padding: '0.55rem 0.85rem',
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            backgroundColor: '#ffffff',
            color: '#374151',
            fontSize: '0.875rem',
            fontWeight: 500,
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          <span>🔄</span>
          <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
        </button>
      </div>

      {/* Main Table / Empty State */}
      {loading && templates.length === 0 ? (
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '10px',
            border: '1px solid #e5e7eb',
            padding: '4rem 2rem',
            textAlign: 'center',
            color: '#6b7280'
          }}
        >
          <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>⏳</div>
          <p style={{ fontSize: '1rem', fontWeight: 600, color: '#374151' }}>Loading templates...</p>
          <p style={{ fontSize: '0.875rem', margin: 0 }}>Retrieving templates from your workspace.</p>
        </div>
      ) : templates.length === 0 ? (
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '10px',
            border: '1px solid #e5e7eb',
            padding: '4rem 2rem',
            textAlign: 'center',
            color: '#4b5563'
          }}
        >
          <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>✉️</div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827', margin: '0 0 0.5rem 0' }}>
            No Email Templates Found
          </h3>
          <p style={{ fontSize: '0.9rem', color: '#6b7280', maxWidth: '480px', margin: '0 auto 1.5rem auto' }}>
            {searchQuery
              ? 'No templates match your search criteria. Try a different keyword.'
              : 'Create reusable personalized templates with placeholders like {{firstName}} and {{company}} for campaign outreach.'}
          </p>
          {!searchQuery && (
            <button
              type="button"
              onClick={handleOpenCreate}
              style={{
                backgroundColor: '#2563eb',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '0.65rem 1.25rem',
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}
            >
              ➕ Create Your First Template
            </button>
          )}
        </div>
      ) : (
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '10px',
            border: '1px solid #e5e7eb',
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
          }}
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb', color: '#4b5563' }}>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Template Name</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Subject Line</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Variables</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Created</th>
                  <th style={{ padding: '0.75rem 1rem', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((template) => (
                  <tr
                    key={template._id}
                    style={{
                      borderBottom: '1px solid #f3f4f6',
                      transition: 'background-color 0.1s'
                    }}
                  >
                    <td style={{ padding: '0.85rem 1rem', fontWeight: 600, color: '#111827' }}>
                      {template.name}
                    </td>
                    <td style={{ padding: '0.85rem 1rem', color: '#374151' }}>
                      {template.subject}
                    </td>
                    <td style={{ padding: '0.85rem 1rem' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                        {template.variables && template.variables.length > 0 ? (
                          template.variables.map((v) => (
                            <span
                              key={v}
                              style={{
                                fontSize: '0.7rem',
                                backgroundColor: '#f1f5f9',
                                color: '#475569',
                                border: '1px solid #e2e8f0',
                                padding: '0.1rem 0.35rem',
                                borderRadius: '4px',
                                fontFamily: 'monospace'
                              }}
                            >
                              {`{{${v}}}`}
                            </span>
                          ))
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>None</span>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: '0.85rem 1rem', color: '#6b7280', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                      {template.createdAt ? new Date(template.createdAt).toLocaleDateString() : '—'}
                    </td>
                    <td style={{ padding: '0.85rem 1rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'inline-flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
                        <button
                          type="button"
                          onClick={() => setPreviewTemplate(template)}
                          title="Preview with sample lead data"
                          style={{
                            padding: '0.35rem 0.65rem',
                            borderRadius: '6px',
                            border: '1px solid #d1d5db',
                            backgroundColor: '#ffffff',
                            color: '#374151',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          👁️ Preview
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(template)}
                          title="Edit template"
                          style={{
                            padding: '0.35rem 0.65rem',
                            borderRadius: '6px',
                            border: '1px solid #d1d5db',
                            backgroundColor: '#ffffff',
                            color: '#2563eb',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          ✏️ Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setTemplateToDelete(template)}
                          title="Delete template"
                          style={{
                            padding: '0.35rem 0.65rem',
                            borderRadius: '6px',
                            border: '1px solid #fecaca',
                            backgroundColor: '#ffffff',
                            color: '#dc2626',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: 'pointer'
                          }}
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CREATE / EDIT TEMPLATE MODAL */}
      {formModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="template-form-title"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(17, 24, 39, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 60,
            padding: '1.5rem',
            backdropFilter: 'blur(2px)'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !submitting) setFormModalOpen(false);
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              maxWidth: '650px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '1.75rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 id="template-form-title" style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#111827' }}>
                {editingTemplate ? 'Edit Email Template' : 'Create New Email Template'}
              </h2>
              <button
                type="button"
                onClick={() => setFormModalOpen(false)}
                style={{ background: 'none', border: 'none', fontSize: '1.25rem', color: '#6b7280', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {formError && (
              <div
                style={{
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#991b1b',
                  borderRadius: '6px',
                  padding: '0.65rem 0.85rem',
                  fontSize: '0.825rem',
                  marginBottom: '1rem'
                }}
              >
                ⚠️ {formError}
              </div>
            )}

            <form onSubmit={handleSaveTemplate}>
              {/* Template Name */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '0.35rem' }}>
                  Template Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Intro Outreach - Restaurants"
                  maxLength={150}
                  required
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.75rem',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    fontSize: '0.875rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Subject Line */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '0.35rem' }}>
                  Subject Line *
                </label>
                <input
                  type="text"
                  value={formData.subject}
                  onFocus={() => setActiveInputFocus('subject')}
                  onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                  placeholder="e.g., Quick question for {{firstName}} at {{company}}"
                  maxLength={300}
                  required
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.75rem',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    fontSize: '0.875rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Supported Variables Helper (3F) */}
              <div
                style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '0.75rem',
                  marginBottom: '1rem'
                }}
              >
                <div style={{ fontSize: '0.775rem', fontWeight: 600, color: '#475569', marginBottom: '0.4rem' }}>
                  Supported Variables (Click to insert into {activeInputFocus === 'subject' ? 'Subject' : 'Body'}):
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                  {SUPPORTED_TEMPLATE_VARIABLES.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => handleInsertVariable(v)}
                      style={{
                        padding: '0.2rem 0.5rem',
                        fontSize: '0.75rem',
                        fontFamily: 'monospace',
                        backgroundColor: '#ffffff',
                        border: '1px solid #cbd5e1',
                        borderRadius: '4px',
                        color: '#1e40af',
                        cursor: 'pointer'
                      }}
                      title={`Click to append {{${v}}}`}
                    >
                      {`{{${v}}}`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Email Body */}
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '0.35rem' }}>
                  Email Body (HTML / Text) *
                </label>
                <textarea
                  rows={8}
                  value={formData.htmlBody}
                  onFocus={() => setActiveInputFocus('htmlBody')}
                  onChange={(e) => setFormData({ ...formData, htmlBody: e.target.value })}
                  placeholder="<p>Hi {{firstName}},</p><p>I noticed your great work at {{company}}...</p>"
                  required
                  style={{
                    width: '100%',
                    padding: '0.6rem 0.75rem',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    fontSize: '0.875rem',
                    fontFamily: 'system-ui, sans-serif',
                    boxSizing: 'border-box',
                    lineHeight: 1.5
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setFormModalOpen(false)}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    backgroundColor: '#ffffff',
                    color: '#374151',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: submitting ? 'not-allowed' : 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    padding: '0.5rem 1.25rem',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: '#2563eb',
                    color: '#ffffff',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: submitting ? 'not-allowed' : 'pointer'
                  }}
                >
                  {submitting ? 'Saving...' : editingTemplate ? 'Update Template' : 'Create Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TEMPLATE PREVIEW MODAL (3E) */}
      {previewTemplate && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="preview-modal-title"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(17, 24, 39, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 60,
            padding: '1.5rem',
            backdropFilter: 'blur(2px)'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setPreviewTemplate(null);
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              maxWidth: '600px',
              width: '100%',
              padding: '1.75rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.25rem' }}>👁️</span>
                <h3 id="preview-modal-title" style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#111827' }}>
                  Template Preview: {previewTemplate.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewTemplate(null)}
                style={{ background: 'none', border: 'none', fontSize: '1.25rem', color: '#6b7280', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '1rem' }}>
              Sample Lead: <strong>{SAMPLE_LEAD.firstName} {SAMPLE_LEAD.lastName}</strong> ({SAMPLE_LEAD.email}) at <strong>{SAMPLE_LEAD.company}</strong>
            </div>

            {/* Email Header Simulation */}
            <div style={{ backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.825rem' }}>
              <div style={{ marginBottom: '0.35rem' }}>
                <strong style={{ color: '#475569' }}>To:</strong> {SAMPLE_LEAD.firstName} {SAMPLE_LEAD.lastName} &lt;{SAMPLE_LEAD.email}&gt;
              </div>
              <div>
                <strong style={{ color: '#475569' }}>Subject:</strong>{' '}
                <span style={{ fontWeight: 600, color: '#111827' }}>
                  {renderSafeTemplate(previewTemplate.subject, SAMPLE_LEAD)}
                </span>
              </div>
            </div>

            {/* Rendered Body */}
            <div
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                padding: '1.25rem',
                minHeight: '140px',
                maxHeight: '300px',
                overflowY: 'auto',
                fontSize: '0.875rem',
                lineHeight: 1.6,
                color: '#1f2937',
                marginBottom: '1.5rem'
              }}
              dangerouslySetInnerHTML={{
                __html: renderSafeTemplate(previewTemplate.htmlBody, SAMPLE_LEAD)
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setPreviewTemplate(null)}
                style={{
                  padding: '0.5rem 1.1rem',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  backgroundColor: '#ffffff',
                  color: '#374151',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL (3D) */}
      {templateToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-template-title"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(17, 24, 39, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 60,
            padding: '1.5rem',
            backdropFilter: 'blur(2px)'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !deleting) setTemplateToDelete(null);
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              maxWidth: '460px',
              width: '100%',
              padding: '1.75rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  backgroundColor: '#fee2e2',
                  color: '#dc2626',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.25rem',
                  flexShrink: 0
                }}
              >
                ⚠️
              </div>
              <div>
                <h3 id="delete-template-title" style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#111827' }}>
                  Delete Email Template?
                </h3>
                <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.825rem', color: '#6b7280' }}>
                  This action will archive the template
                </p>
              </div>
            </div>

            <p style={{ fontSize: '0.875rem', color: '#4b5563', lineHeight: 1.5, marginBottom: '1.5rem' }}>
              Are you sure you want to delete template <strong>&ldquo;{templateToDelete.name}&rdquo;</strong>? It will no longer be available for outreach or campaigns in this workspace.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                disabled={deleting}
                onClick={() => setTemplateToDelete(null)}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  backgroundColor: '#ffffff',
                  color: '#374151',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: deleting ? 'not-allowed' : 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleConfirmDelete}
                style={{
                  padding: '0.5rem 1.1rem',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: '#dc2626',
                  color: '#ffffff',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: deleting ? 'not-allowed' : 'pointer'
                }}
              >
                {deleting ? 'Deleting...' : 'Yes, Delete Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmailTemplates;
