import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  getLeads,
  updateLead,
  archiveLead,
  bulkLeadOperation,
  downloadLeadsCsv,
  Lead,
  LeadStatus,
  LeadPriority,
  LeadPagination,
  UpdateLeadPayload
} from '../api/lead.api';

interface LeadCRMProps {
  onNavigateToDiscovery?: () => void;
}

const STATUS_OPTIONS: { label: string; value: LeadStatus | '' }[] = [
  { label: 'All Statuses', value: '' },
  { label: 'New', value: 'new' },
  { label: 'Contacted', value: 'contacted' },
  { label: 'Qualified', value: 'qualified' },
  { label: 'Converted', value: 'converted' },
  { label: 'Lost', value: 'lost' }
];

const PRIORITY_OPTIONS: { label: string; value: LeadPriority | '' }[] = [
  { label: 'All Priorities', value: '' },
  { label: 'High', value: 'high' },
  { label: 'Medium', value: 'medium' },
  { label: 'Low', value: 'low' }
];

export const LeadCRM: React.FC<LeadCRMProps> = ({ onNavigateToDiscovery }) => {
  // Leads & Pagination State
  const [leads, setLeads] = useState<Lead[]>([]);
  const [pagination, setPagination] = useState<LeadPagination>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filter & Search State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<LeadStatus | ''>('');
  const [priorityFilter, setPriorityFilter] = useState<LeadPriority | ''>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Multi-Select & Bulk Operations State
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [bulkProcessing, setBulkProcessing] = useState<boolean>(false);
  const [bulkArchiveModalOpen, setBulkArchiveModalOpen] = useState<boolean>(false);
  const [exportingCsv, setExportingCsv] = useState<boolean>(false);
  const selectAllCheckboxRef = useRef<HTMLInputElement>(null);

  // Selected Lead for Detail / Edit Modal
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalTab, setModalTab] = useState<'details' | 'edit'>('details');
  const [editFormData, setEditFormData] = useState<UpdateLeadPayload>({});
  const [savingEdit, setSavingEdit] = useState<boolean>(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Archive Confirmation Modal State
  const [leadToArchive, setLeadToArchive] = useState<Lead | null>(null);
  const [archiving, setArchiving] = useState<boolean>(false);

  // Debounce search input by 350ms
  const searchTimerRef = useRef<any>(null);
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(val);
      setCurrentPage(1);
    }, 350);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setDebouncedSearch('');
    setCurrentPage(1);
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setDebouncedSearch('');
    setStatusFilter('');
    setPriorityFilter('');
    setCurrentPage(1);
  };

  // Fetch leads from backend API
  const fetchLeads = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await getLeads({
        page: currentPage,
        limit: pageSize,
        search: debouncedSearch,
        status: statusFilter,
        priority: priorityFilter
      });

      setLeads(res.data);
      setPagination(res.pagination);
    } catch (err: any) {
      setError(err.message || 'Failed to load leads from CRM.');
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize, debouncedSearch, statusFilter, priorityFilter]);

  useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  // Reconcile and clear selection when page, search query, or filters change
  useEffect(() => {
    setSelectedLeadIds([]);
  }, [currentPage, pageSize, debouncedSearch, statusFilter, priorityFilter]);

  // Sync indeterminate state of the select-all checkbox
  const isAllVisibleSelected = leads.length > 0 && leads.every((l) => selectedLeadIds.includes(l._id));
  const isSomeVisibleSelected = leads.some((l) => selectedLeadIds.includes(l._id));

  useEffect(() => {
    if (selectAllCheckboxRef.current) {
      selectAllCheckboxRef.current.indeterminate = isSomeVisibleSelected && !isAllVisibleSelected;
    }
  }, [isSomeVisibleSelected, isAllVisibleSelected]);

  // Handle toggling select-all on visible leads
  const handleToggleSelectAll = () => {
    if (isAllVisibleSelected) {
      // Deselect all visible leads
      setSelectedLeadIds((prev) => prev.filter((id) => !leads.some((l) => l._id === id)));
    } else {
      // Select all visible leads
      const visibleIds = leads.map((l) => l._id);
      setSelectedLeadIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  // Handle toggling a single lead row selection
  const handleToggleSelectRow = (leadId: string) => {
    setSelectedLeadIds((prev) =>
      prev.includes(leadId) ? prev.filter((id) => id !== leadId) : [...prev, leadId]
    );
  };

  // Handle bulk status change
  const handleBulkStatusChange = async (newStatus: LeadStatus) => {
    if (selectedLeadIds.length === 0) return;

    try {
      setBulkProcessing(true);
      setError(null);

      const res = await bulkLeadOperation({
        leadIds: selectedLeadIds,
        action: 'update_status',
        status: newStatus
      });

      setSuccessMsg(`Successfully updated status to "${newStatus}" for ${res.data.modifiedCount} lead(s).`);
      setSelectedLeadIds([]);
      await fetchLeads();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to update status in bulk.');
    } finally {
      setBulkProcessing(false);
    }
  };

  // Handle bulk priority change
  const handleBulkPriorityChange = async (newPriority: LeadPriority) => {
    if (selectedLeadIds.length === 0) return;

    try {
      setBulkProcessing(true);
      setError(null);

      const res = await bulkLeadOperation({
        leadIds: selectedLeadIds,
        action: 'update_priority',
        priority: newPriority
      });

      setSuccessMsg(`Successfully updated priority to "${newPriority}" for ${res.data.modifiedCount} lead(s).`);
      setSelectedLeadIds([]);
      await fetchLeads();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to update priority in bulk.');
    } finally {
      setBulkProcessing(false);
    }
  };

  // Handle bulk archive confirmation
  const handleBulkArchiveConfirm = async () => {
    if (selectedLeadIds.length === 0) return;

    try {
      setBulkProcessing(true);
      setError(null);

      const res = await bulkLeadOperation({
        leadIds: selectedLeadIds,
        action: 'archive'
      });

      setSuccessMsg(`Successfully archived ${res.data.modifiedCount} lead(s).`);
      setBulkArchiveModalOpen(false);
      setSelectedLeadIds([]);
      await fetchLeads();
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to archive leads in bulk.');
    } finally {
      setBulkProcessing(false);
    }
  };

  // Handle Export Current Filtered Results
  const handleExportCurrentResults = async () => {
    try {
      setExportingCsv(true);
      setError(null);

      const { filename } = await downloadLeadsCsv({
        search: debouncedSearch,
        status: statusFilter,
        priority: priorityFilter
      });

      setSuccessMsg(`Exported CRM results to "${filename}".`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to export CRM results as CSV.');
    } finally {
      setExportingCsv(false);
    }
  };

  // Handle Export Selected Leads
  const handleExportSelectedCsv = async () => {
    if (selectedLeadIds.length === 0) return;

    try {
      setExportingCsv(true);
      setError(null);

      const { filename } = await downloadLeadsCsv({
        leadIds: selectedLeadIds
      });

      setSuccessMsg(`Exported ${selectedLeadIds.length} selected lead(s) to "${filename}".`);
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to export selected leads as CSV.');
    } finally {
      setExportingCsv(false);
    }
  };


  // Handle opening View/Edit modal
  const handleOpenLeadModal = (lead: Lead, tab: 'details' | 'edit' = 'details') => {
    setSelectedLead(lead);
    setEditFormData({
      firstName: lead.firstName || '',
      lastName: lead.lastName || '',
      email: lead.email || '',
      phone: lead.phone || '',
      company: lead.company || '',
      source: lead.source || '',
      status: lead.status || 'new',
      priority: lead.priority || 'medium',
      notes: lead.notes || ''
    });
    setModalTab(tab);
    setEditError(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedLead(null);
    setEditError(null);
  };

  // Handle Save Edit
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLead) return;

    if (!editFormData.firstName || !editFormData.firstName.trim()) {
      setEditError('First name is required.');
      return;
    }

    try {
      setSavingEdit(true);
      setEditError(null);

      const payload: UpdateLeadPayload = {
        firstName: editFormData.firstName.trim(),
        lastName: editFormData.lastName?.trim() || undefined,
        email: editFormData.email?.trim() || undefined,
        phone: editFormData.phone?.trim() || undefined,
        company: editFormData.company?.trim() || undefined,
        source: editFormData.source?.trim() || undefined,
        status: editFormData.status,
        priority: editFormData.priority,
        notes: editFormData.notes !== undefined ? editFormData.notes.trim() : undefined
      };

      const updated = await updateLead(selectedLead._id, payload);

      // Update lead in local state
      setLeads((prev) => prev.map((l) => (l._id === updated._id ? updated : l)));
      setSelectedLead(updated);
      setSuccessMsg(`Lead "${updated.firstName} ${updated.lastName || ''}" updated successfully.`);
      setModalTab('details');

      // Auto-clear success message after 4s
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setEditError(err.message || 'Failed to update lead.');
    } finally {
      setSavingEdit(false);
    }
  };

  // Handle Archive Lead
  const handleArchiveConfirm = async () => {
    if (!leadToArchive) return;

    try {
      setArchiving(true);
      setError(null);

      await archiveLead(leadToArchive._id);

      // Remove from leads list immediately
      setLeads((prev) => prev.filter((l) => l._id !== leadToArchive._id));
      setSuccessMsg(`Lead "${leadToArchive.firstName} ${leadToArchive.lastName || ''}" was archived.`);

      if (selectedLead?._id === leadToArchive._id) {
        handleCloseModal();
      }

      setLeadToArchive(null);

      // Refresh list to update pagination counts
      fetchLeads();

      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err: any) {
      setError(err.message || 'Failed to archive lead.');
    } finally {
      setArchiving(false);
    }
  };

  // Status Badge Colors
  const getStatusBadgeStyle = (status: LeadStatus) => {
    switch (status) {
      case 'new':
        return { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' };
      case 'contacted':
        return { bg: '#fef3c7', color: '#b45309', border: '#fde68a' };
      case 'qualified':
        return { bg: '#f3e8ff', color: '#7e22ce', border: '#e9d5ff' };
      case 'converted':
        return { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0' };
      case 'lost':
        return { bg: '#f3f4f6', color: '#4b5563', border: '#e5e7eb' };
      default:
        return { bg: '#f3f4f6', color: '#4b5563', border: '#e5e7eb' };
    }
  };

  // Priority Badge Colors
  const getPriorityBadgeStyle = (priority: LeadPriority) => {
    switch (priority) {
      case 'high':
        return { bg: '#fee2e2', color: '#b91c1c', border: '#fecaca' };
      case 'medium':
        return { bg: '#ffedd5', color: '#c2410c', border: '#fed7aa' };
      case 'low':
        return { bg: '#f1f5f9', color: '#475569', border: '#e2e8f0' };
      default:
        return { bg: '#f1f5f9', color: '#475569', border: '#e2e8f0' };
    }
  };

  // Parse notes to extract provenance metadata
  const parseProvenanceNotes = (notes?: string) => {
    if (!notes) return { isDiscovered: false, isEnriched: false, items: [] as { label: string; value: string }[], rawNotes: '' };

    const lines = notes.split('\n').map((l) => l.trim()).filter(Boolean);
    const isDiscovered = lines.some((l) => l.toLowerCase().includes('discovered via'));
    const isEnriched = lines.some((l) => l.toLowerCase().includes('enriched via'));

    const items: { label: string; value: string }[] = [];
    const otherNotes: string[] = [];

    for (const line of lines) {
      if (line.startsWith('[') && line.endsWith(']')) {
        continue; // Header tag
      }
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0 && colonIdx < 30) {
        const label = line.slice(0, colonIdx).trim();
        const value = line.slice(colonIdx + 1).trim();
        items.push({ label, value });
      } else {
        otherNotes.push(line);
      }
    }

    return {
      isDiscovered,
      isEnriched,
      items,
      rawNotes: otherNotes.join('\n') || notes
    };
  };

  // Keydown listener for Esc key to close modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (leadToArchive) {
          setLeadToArchive(null);
        } else if (isModalOpen) {
          handleCloseModal();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isModalOpen, leadToArchive]);

  // Compute stats from current view
  const isFiltered = Boolean(debouncedSearch || statusFilter || priorityFilter);

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '2rem 1.5rem', fontFamily: 'inherit' }}>
      {/* Header Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#111827', margin: 0 }}>
              Leads CRM
            </h1>
            <span
              style={{
                backgroundColor: '#eff6ff',
                color: '#1d4ed8',
                padding: '0.2rem 0.6rem',
                borderRadius: '9999px',
                fontSize: '0.8rem',
                fontWeight: 700,
                border: '1px solid #bfdbfe'
              }}
            >
              {pagination.total} {pagination.total === 1 ? 'Lead' : 'Leads'}
            </span>
          </div>
          <p style={{ color: '#4b5563', fontSize: '0.9rem', marginTop: '0.25rem', marginBottom: 0 }}>
            Manage, qualify, and track prospective clients converted from Lead Discovery or added manually.
          </p>
        </div>

        {onNavigateToDiscovery && (
          <button
            onClick={onNavigateToDiscovery}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              backgroundColor: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              padding: '0.6rem 1rem',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
              transition: 'background-color 0.15s'
            }}
          >
            <span>🔍</span>
            <span>Discover New Prospects</span>
          </button>
        )}
      </div>

      {/* Notifications */}
      {successMsg && (
        <div
          role="status"
          style={{
            marginBottom: '1rem',
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
            marginBottom: '1rem',
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

      {/* Filter and Search Bar */}
      <div
        style={{
          backgroundColor: '#ffffff',
          padding: '1rem 1.25rem',
          borderRadius: '10px',
          border: '1px solid #e5e7eb',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          marginBottom: '1.5rem',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.75rem',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', flex: 1, minWidth: '300px' }}>
          {/* Search Input */}
          <div style={{ position: 'relative', flex: '1 1 240px', minWidth: '200px' }}>
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
              placeholder="Search by name, company, email, or phone..."
              value={searchQuery}
              onChange={handleSearchChange}
              style={{
                width: '100%',
                padding: '0.55rem 2rem 0.55rem 2.2rem',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                fontSize: '0.875rem',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={handleClearSearch}
                aria-label="Clear search"
                style={{
                  position: 'absolute',
                  right: '0.6rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#9ca3af',
                  cursor: 'pointer',
                  fontSize: '0.9rem'
                }}
              >
                ✕
              </button>
            )}
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as LeadStatus | '');
              setCurrentPage(1);
            }}
            aria-label="Filter by lead status"
            style={{
              padding: '0.55rem 0.75rem',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              fontSize: '0.875rem',
              backgroundColor: '#ffffff',
              color: '#374151',
              cursor: 'pointer'
            }}
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* Priority Filter */}
          <select
            value={priorityFilter}
            onChange={(e) => {
              setPriorityFilter(e.target.value as LeadPriority | '');
              setCurrentPage(1);
            }}
            aria-label="Filter by lead priority"
            style={{
              padding: '0.55rem 0.75rem',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              fontSize: '0.875rem',
              backgroundColor: '#ffffff',
              color: '#374151',
              cursor: 'pointer'
            }}
          >
            {PRIORITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* Clear Filters Button */}
          {isFiltered && (
            <button
              type="button"
              onClick={handleResetFilters}
              style={{
                padding: '0.55rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid #d1d5db',
                backgroundColor: '#f3f4f6',
                color: '#4b5563',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Reset Filters
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {/* Export Current Filtered Results CSV */}
          <button
            type="button"
            onClick={handleExportCurrentResults}
            disabled={exportingCsv || pagination.total === 0}
            aria-label="Export current filtered leads to CSV"
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
              cursor: exportingCsv || pagination.total === 0 ? 'not-allowed' : 'pointer'
            }}
          >
            <span>📥</span>
            <span>{exportingCsv ? 'Exporting...' : 'Export Results (CSV)'}</span>
          </button>

          {/* Refresh button */}
          <button
            type="button"
            onClick={fetchLeads}
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
      </div>


      {/* Main Content: Table or Empty State */}
      {loading && leads.length === 0 ? (
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
          <p style={{ fontSize: '1rem', fontWeight: 600, color: '#374151' }}>Loading your CRM leads...</p>
          <p style={{ fontSize: '0.875rem', margin: 0 }}>Communicating with workspace database.</p>
        </div>
      ) : leads.length === 0 ? (
        /* Empty States */
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
          {isFiltered ? (
            <div>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🔍</div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827', margin: '0 0 0.5rem 0' }}>
                No leads match your search criteria
              </h3>
              <p style={{ fontSize: '0.9rem', color: '#6b7280', maxWidth: '460px', margin: '0 auto 1.25rem auto' }}>
                No results were found for the current query or status/priority filters.
              </p>
              <button
                type="button"
                onClick={handleResetFilters}
                style={{
                  backgroundColor: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '0.55rem 1.1rem',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Clear Filters & Show All Leads
              </button>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📋</div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827', margin: '0 0 0.5rem 0' }}>
                No leads in your CRM yet
              </h3>
              <p style={{ fontSize: '0.9rem', color: '#6b7280', maxWidth: '500px', margin: '0 auto 1.5rem auto' }}>
                Your workspace does not have any saved leads yet. You can discover real prospects using generic natural-language queries (e.g. "dentists in Guwahati" or "restaurants in Paris") and convert them with one click.
              </p>
              {onNavigateToDiscovery && (
                <button
                  type="button"
                  onClick={onNavigateToDiscovery}
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
                  🔍 Go to Lead Discovery
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Bulk Action Toolbar */}
          {selectedLeadIds.length > 0 && (
            <div
              role="region"
              aria-label="Bulk actions toolbar"
              style={{
                backgroundColor: '#1e293b',
                color: '#ffffff',
                padding: '0.75rem 1.25rem',
                borderRadius: '8px',
                marginBottom: '1rem',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span
                  style={{
                    backgroundColor: '#2563eb',
                    color: '#ffffff',
                    padding: '0.25rem 0.65rem',
                    borderRadius: '9999px',
                    fontSize: '0.8rem',
                    fontWeight: 700
                  }}
                >
                  {selectedLeadIds.length} {selectedLeadIds.length === 1 ? 'lead' : 'leads'} selected
                </span>
                <span style={{ fontSize: '0.875rem', color: '#cbd5e1', fontWeight: 500 }}>
                  Bulk Actions:
                </span>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
                {/* Change Status Dropdown */}
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) handleBulkStatusChange(e.target.value as LeadStatus);
                  }}
                  disabled={bulkProcessing}
                  aria-label="Change status of selected leads"
                  style={{
                    padding: '0.4rem 0.65rem',
                    borderRadius: '6px',
                    border: '1px solid #475569',
                    backgroundColor: '#334155',
                    color: '#ffffff',
                    fontSize: '0.825rem',
                    cursor: bulkProcessing ? 'not-allowed' : 'pointer'
                  }}
                >
                  <option value="" disabled>Change Status...</option>
                  <option value="new">Status: New</option>
                  <option value="contacted">Status: Contacted</option>
                  <option value="qualified">Status: Qualified</option>
                  <option value="converted">Status: Converted</option>
                  <option value="lost">Status: Lost</option>
                </select>

                {/* Change Priority Dropdown */}
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) handleBulkPriorityChange(e.target.value as LeadPriority);
                  }}
                  disabled={bulkProcessing}
                  aria-label="Change priority of selected leads"
                  style={{
                    padding: '0.4rem 0.65rem',
                    borderRadius: '6px',
                    border: '1px solid #475569',
                    backgroundColor: '#334155',
                    color: '#ffffff',
                    fontSize: '0.825rem',
                    cursor: bulkProcessing ? 'not-allowed' : 'pointer'
                  }}
                >
                  <option value="" disabled>Change Priority...</option>
                  <option value="low">Priority: Low</option>
                  <option value="medium">Priority: Medium</option>
                  <option value="high">Priority: High</option>
                </select>

                {/* Export Selected CSV */}
                <button
                  type="button"
                  onClick={handleExportSelectedCsv}
                  disabled={bulkProcessing || exportingCsv}
                  aria-label="Export selected leads to CSV"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.4rem 0.75rem',
                    borderRadius: '6px',
                    border: '1px solid #475569',
                    backgroundColor: '#334155',
                    color: '#ffffff',
                    fontSize: '0.825rem',
                    fontWeight: 500,
                    cursor: bulkProcessing || exportingCsv ? 'not-allowed' : 'pointer'
                  }}
                >
                  <span>📥</span>
                  <span>Export CSV ({selectedLeadIds.length})</span>
                </button>

                {/* Bulk Archive Button */}
                <button
                  type="button"
                  onClick={() => setBulkArchiveModalOpen(true)}
                  disabled={bulkProcessing}
                  aria-label="Archive selected leads"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.4rem 0.75rem',
                    borderRadius: '6px',
                    border: '1px solid #dc2626',
                    backgroundColor: '#ef4444',
                    color: '#ffffff',
                    fontSize: '0.825rem',
                    fontWeight: 600,
                    cursor: bulkProcessing ? 'not-allowed' : 'pointer'
                  }}
                >
                  <span>🗑️</span>
                  <span>Archive ({selectedLeadIds.length})</span>
                </button>

                {/* Clear Selection Button */}
                <button
                  type="button"
                  onClick={() => setSelectedLeadIds([])}
                  disabled={bulkProcessing}
                  aria-label="Clear selection"
                  style={{
                    padding: '0.4rem 0.65rem',
                    borderRadius: '6px',
                    border: '1px solid #64748b',
                    backgroundColor: 'transparent',
                    color: '#cbd5e1',
                    fontSize: '0.825rem',
                    cursor: bulkProcessing ? 'not-allowed' : 'pointer'
                  }}
                >
                  Clear Selection
                </button>
              </div>
            </div>
          )}

          {/* Leads Table Container */}
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
                    <th style={{ padding: '0.75rem 1rem', width: '40px' }}>
                      <input
                        type="checkbox"
                        ref={selectAllCheckboxRef}
                        checked={isAllVisibleSelected}
                        onChange={handleToggleSelectAll}
                        aria-label="Select all visible leads"
                        style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                      />
                    </th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Lead Name</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Company</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Contact Info</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Source</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Status</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Priority</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>Added</th>
                    <th style={{ padding: '0.75rem 1rem', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => {
                    const statusStyle = getStatusBadgeStyle(lead.status);
                    const priorityStyle = getPriorityBadgeStyle(lead.priority);
                    const fullName = `${lead.firstName} ${lead.lastName || ''}`.trim();
                    const createdDate = new Date(lead.createdAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    });

                    return (
                      <tr
                        key={lead._id}
                        style={{
                          borderBottom: '1px solid #f3f4f6',
                          backgroundColor: selectedLeadIds.includes(lead._id) ? '#f0f7ff' : '#ffffff',
                          transition: 'background-color 0.1s'
                        }}
                        onMouseEnter={(e) => {
                          if (!selectedLeadIds.includes(lead._id)) e.currentTarget.style.backgroundColor = '#fafafa';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = selectedLeadIds.includes(lead._id) ? '#f0f7ff' : '#ffffff';
                        }}
                      >
                        {/* Selection Checkbox */}
                        <td style={{ padding: '0.85rem 1rem', width: '40px' }}>
                          <input
                            type="checkbox"
                            checked={selectedLeadIds.includes(lead._id)}
                            onChange={() => handleToggleSelectRow(lead._id)}
                            aria-label={`Select lead ${fullName}`}
                            style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                          />
                        </td>
                        {/* Name Column */}
                        <td style={{ padding: '0.85rem 1rem' }}>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                          <div
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '50%',
                              backgroundColor: '#e0e7ff',
                              color: '#3730a3',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 700,
                              fontSize: '0.75rem'
                            }}
                          >
                            {lead.firstName ? lead.firstName.charAt(0).toUpperCase() : '?'}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, color: '#111827' }}>{fullName}</div>
                            {lead.notes && lead.notes.includes('Discovery') && (
                              <div style={{ fontSize: '0.75rem', color: '#6366f1', fontWeight: 500 }}>
                                ⚡ Discovered Lead
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Company Column */}
                      <td style={{ padding: '0.85rem 1rem', color: '#374151' }}>
                        {lead.company ? (
                          <span style={{ fontWeight: 500 }}>{lead.company}</span>
                        ) : (
                          <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>—</span>
                        )}
                      </td>

                      {/* Contact Info Column */}
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontSize: '0.8rem' }}>
                          {lead.email ? (
                            <a
                              href={`mailto:${lead.email}`}
                              style={{ color: '#2563eb', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                            >
                              <span>✉️</span>
                              <span>{lead.email}</span>
                            </a>
                          ) : null}
                          {lead.phone ? (
                            <a
                              href={`tel:${lead.phone}`}
                              style={{ color: '#374151', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                            >
                              <span>📞</span>
                              <span>{lead.phone}</span>
                            </a>
                          ) : null}
                          {!lead.email && !lead.phone && (
                            <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>No contact info</span>
                          )}
                        </div>
                      </td>

                      {/* Source Column */}
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '0.15rem 0.5rem',
                            borderRadius: '4px',
                            backgroundColor: lead.source === 'discovery' ? '#f0fdf4' : '#f3f4f6',
                            color: lead.source === 'discovery' ? '#15803d' : '#4b5563',
                            border: `1px solid ${lead.source === 'discovery' ? '#bbf7d0' : '#e5e7eb'}`,
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            textTransform: 'capitalize'
                          }}
                        >
                          {lead.source || 'manual'}
                        </span>
                      </td>

                      {/* Status Column */}
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '0.2rem 0.6rem',
                            borderRadius: '9999px',
                            backgroundColor: statusStyle.bg,
                            color: statusStyle.color,
                            border: `1px solid ${statusStyle.border}`,
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            textTransform: 'capitalize'
                          }}
                        >
                          {lead.status}
                        </span>
                      </td>

                      {/* Priority Column */}
                      <td style={{ padding: '0.85rem 1rem' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '0.2rem 0.5rem',
                            borderRadius: '4px',
                            backgroundColor: priorityStyle.bg,
                            color: priorityStyle.color,
                            border: `1px solid ${priorityStyle.border}`,
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            textTransform: 'capitalize'
                          }}
                        >
                          {lead.priority}
                        </span>
                      </td>

                      {/* Added Date */}
                      <td style={{ padding: '0.85rem 1rem', color: '#6b7280', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                        {createdDate}
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '0.85rem 1rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', gap: '0.4rem' }}>
                          <button
                            type="button"
                            onClick={() => handleOpenLeadModal(lead, 'details')}
                            style={{
                              padding: '0.35rem 0.65rem',
                              borderRadius: '5px',
                              border: '1px solid #d1d5db',
                              backgroundColor: '#ffffff',
                              color: '#374151',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            Details
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenLeadModal(lead, 'edit')}
                            style={{
                              padding: '0.35rem 0.65rem',
                              borderRadius: '5px',
                              border: '1px solid #bfdbfe',
                              backgroundColor: '#eff6ff',
                              color: '#1d4ed8',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setLeadToArchive(lead)}
                            style={{
                              padding: '0.35rem 0.65rem',
                              borderRadius: '5px',
                              border: '1px solid #fecaca',
                              backgroundColor: '#fff5f5',
                              color: '#dc2626',
                              fontSize: '0.75rem',
                              fontWeight: 600,
                              cursor: 'pointer'
                            }}
                          >
                            Archive
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Bar */}
          <div
            style={{
              padding: '0.75rem 1.25rem',
              backgroundColor: '#f9fafb',
              borderTop: '1px solid #e5e7eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.75rem',
              fontSize: '0.875rem',
              color: '#4b5563'
            }}
          >
            <div>
              Showing{' '}
              <span style={{ fontWeight: 600, color: '#111827' }}>
                {pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.limit + 1}
              </span>{' '}
              to{' '}
              <span style={{ fontWeight: 600, color: '#111827' }}>
                {Math.min(pagination.page * pagination.limit, pagination.total)}
              </span>{' '}
              of <span style={{ fontWeight: 600, color: '#111827' }}>{pagination.total}</span> leads
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              {/* Rows per page selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}>
                <span>Rows:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  style={{
                    padding: '0.25rem 0.5rem',
                    borderRadius: '4px',
                    border: '1px solid #d1d5db',
                    fontSize: '0.8rem'
                  }}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </div>

              {/* Page Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <button
                  type="button"
                  disabled={currentPage <= 1 || loading}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  style={{
                    padding: '0.35rem 0.75rem',
                    borderRadius: '5px',
                    border: '1px solid #d1d5db',
                    backgroundColor: currentPage <= 1 ? '#f3f4f6' : '#ffffff',
                    color: currentPage <= 1 ? '#9ca3af' : '#374151',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: currentPage <= 1 ? 'not-allowed' : 'pointer'
                  }}
                >
                  ← Previous
                </button>
                <span style={{ fontSize: '0.8rem', color: '#4b5563', padding: '0 0.35rem' }}>
                  Page {pagination.page} of {pagination.totalPages || 1}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= pagination.totalPages || loading}
                  onClick={() => setCurrentPage((p) => p + 1)}
                  style={{
                    padding: '0.35rem 0.75rem',
                    borderRadius: '5px',
                    border: '1px solid #d1d5db',
                    backgroundColor: currentPage >= pagination.totalPages ? '#f3f4f6' : '#ffffff',
                    color: currentPage >= pagination.totalPages ? '#9ca3af' : '#374151',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: currentPage >= pagination.totalPages ? 'not-allowed' : 'pointer'
                  }}
                >
                  Next →
                </button>
              </div>
            </div>
          </div>
        </div>
      </>
    )}



      {/* LEAD DETAIL & EDIT MODAL */}
      {isModalOpen && selectedLead && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-lead-title"
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(17, 24, 39, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
            padding: '1.5rem',
            backdropFilter: 'blur(2px)'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCloseModal();
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              maxWidth: '680px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              border: '1px solid #e5e7eb',
              boxSizing: 'border-box'
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '1.25rem 1.5rem',
                borderBottom: '1px solid #e5e7eb',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <div>
                <h2 id="modal-lead-title" style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#111827' }}>
                  {selectedLead.firstName} {selectedLead.lastName || ''}
                </h2>
                {selectedLead.company && (
                  <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.875rem', color: '#4b5563' }}>
                    🏢 {selectedLead.company}
                  </p>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {/* Tabs */}
                <div style={{ display: 'flex', backgroundColor: '#f3f4f6', borderRadius: '6px', padding: '0.2rem' }}>
                  <button
                    type="button"
                    onClick={() => setModalTab('details')}
                    style={{
                      padding: '0.3rem 0.75rem',
                      borderRadius: '5px',
                      border: 'none',
                      backgroundColor: modalTab === 'details' ? '#ffffff' : 'transparent',
                      color: modalTab === 'details' ? '#1d4ed8' : '#6b7280',
                      fontWeight: 600,
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      boxShadow: modalTab === 'details' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
                    }}
                  >
                    Details
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalTab('edit')}
                    style={{
                      padding: '0.3rem 0.75rem',
                      borderRadius: '5px',
                      border: 'none',
                      backgroundColor: modalTab === 'edit' ? '#ffffff' : 'transparent',
                      color: modalTab === 'edit' ? '#1d4ed8' : '#6b7280',
                      fontWeight: 600,
                      fontSize: '0.8rem',
                      cursor: 'pointer',
                      boxShadow: modalTab === 'edit' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none'
                    }}
                  >
                    Edit
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleCloseModal}
                  aria-label="Close dialog"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#9ca3af',
                    fontSize: '1.25rem',
                    cursor: 'pointer',
                    padding: '0.25rem 0.5rem',
                    borderRadius: '4px'
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Error Alert */}
            {editError && (
              <div style={{ margin: '1rem 1.5rem 0 1.5rem', padding: '0.6rem 0.9rem', backgroundColor: '#fef2f2', color: '#991b1b', borderRadius: '6px', fontSize: '0.85rem' }}>
                ⚠️ {editError}
              </div>
            )}

            {/* Modal Content */}
            <div style={{ padding: '1.5rem' }}>
              {modalTab === 'details' ? (
                /* Details View */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                  {/* Status & Priority Cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
                    <div style={{ padding: '0.75rem', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Status</div>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '0.15rem 0.5rem',
                          borderRadius: '9999px',
                          backgroundColor: getStatusBadgeStyle(selectedLead.status).bg,
                          color: getStatusBadgeStyle(selectedLead.status).color,
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          textTransform: 'capitalize'
                        }}
                      >
                        {selectedLead.status}
                      </span>
                    </div>

                    <div style={{ padding: '0.75rem', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Priority</div>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '0.15rem 0.5rem',
                          borderRadius: '4px',
                          backgroundColor: getPriorityBadgeStyle(selectedLead.priority).bg,
                          color: getPriorityBadgeStyle(selectedLead.priority).color,
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          textTransform: 'capitalize'
                        }}
                      >
                        {selectedLead.priority}
                      </span>
                    </div>

                    <div style={{ padding: '0.75rem', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Source</div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151', textTransform: 'capitalize' }}>
                        {selectedLead.source || 'manual'}
                      </div>
                    </div>

                    <div style={{ padding: '0.75rem', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.25rem' }}>Created</div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>
                        {new Date(selectedLead.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>

                  {/* Contact Information */}
                  <div style={{ padding: '1rem', backgroundColor: '#ffffff', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                    <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.9rem', fontWeight: 700, color: '#111827' }}>
                      Contact Information
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', fontSize: '0.875rem' }}>
                      <div>
                        <span style={{ color: '#6b7280', fontSize: '0.8rem', display: 'block' }}>Email Address</span>
                        {selectedLead.email ? (
                          <a href={`mailto:${selectedLead.email}`} style={{ color: '#2563eb', fontWeight: 500, textDecoration: 'none' }}>
                            {selectedLead.email}
                          </a>
                        ) : (
                          <span style={{ color: '#9ca3af' }}>Not provided</span>
                        )}
                      </div>
                      <div>
                        <span style={{ color: '#6b7280', fontSize: '0.8rem', display: 'block' }}>Phone Number</span>
                        {selectedLead.phone ? (
                          <a href={`tel:${selectedLead.phone}`} style={{ color: '#374151', fontWeight: 500, textDecoration: 'none' }}>
                            {selectedLead.phone}
                          </a>
                        ) : (
                          <span style={{ color: '#9ca3af' }}>Not provided</span>
                        )}
                      </div>
                      <div>
                        <span style={{ color: '#6b7280', fontSize: '0.8rem', display: 'block' }}>Company Name</span>
                        <span style={{ color: '#374151', fontWeight: 500 }}>
                          {selectedLead.company || 'Not provided'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Discovered / Enriched Provenance Details */}
                  {(() => {
                    const prov = parseProvenanceNotes(selectedLead.notes);
                    return (
                      <div style={{ padding: '1rem', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                          <h4 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#1e293b' }}>
                            Discovery & Enrichment Provenance
                          </h4>
                          <div style={{ display: 'flex', gap: '0.35rem' }}>
                            {prov.isDiscovered && (
                              <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem', borderRadius: '4px', backgroundColor: '#e0e7ff', color: '#3730a3', fontWeight: 600 }}>
                                Discovered
                              </span>
                            )}
                            {prov.isEnriched && (
                              <span style={{ fontSize: '0.7rem', padding: '0.15rem 0.4rem', borderRadius: '4px', backgroundColor: '#dcfce7', color: '#15803d', fontWeight: 600 }}>
                                Website Enriched
                              </span>
                            )}
                          </div>
                        </div>

                        {prov.items.length > 0 ? (
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.6rem', fontSize: '0.85rem' }}>
                            {prov.items.map((item, idx) => (
                              <div key={idx} style={{ backgroundColor: '#ffffff', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', fontWeight: 500 }}>
                                  {item.label}
                                </span>
                                {item.value.startsWith('http://') || item.value.startsWith('https://') ? (
                                  <a
                                    href={item.value}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ color: '#2563eb', wordBreak: 'break-all', fontSize: '0.8rem' }}
                                  >
                                    {item.value} ↗
                                  </a>
                                ) : (
                                  <span style={{ color: '#1e293b', fontWeight: 500, wordBreak: 'break-word' }}>
                                    {item.value}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : null}

                        {/* Raw Notes section if any */}
                        {prov.rawNotes && (
                          <div style={{ marginTop: '0.75rem' }}>
                            <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginBottom: '0.25rem', fontWeight: 500 }}>
                              Additional Notes & Metadata:
                            </span>
                            <pre
                              style={{
                                margin: 0,
                                padding: '0.6rem 0.8rem',
                                backgroundColor: '#ffffff',
                                borderRadius: '6px',
                                border: '1px solid #e2e8f0',
                                fontSize: '0.75rem',
                                color: '#334155',
                                whiteSpace: 'pre-wrap',
                                fontFamily: 'inherit',
                                maxHeight: '120px',
                                overflowY: 'auto'
                              }}
                            >
                              {prov.rawNotes}
                            </pre>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Actions in details tab */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={() => setLeadToArchive(selectedLead)}
                      style={{
                        padding: '0.5rem 0.9rem',
                        backgroundColor: '#fff1f2',
                        color: '#e11d48',
                        border: '1px solid #fecdd3',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Archive Lead
                    </button>

                    <button
                      type="button"
                      onClick={() => setModalTab('edit')}
                      style={{
                        padding: '0.5rem 1.1rem',
                        backgroundColor: '#2563eb',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Edit Lead Information
                    </button>
                  </div>
                </div>
              ) : (
                /* Edit Form View */
                <form onSubmit={handleSaveEdit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '0.25rem' }}>
                        First Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={editFormData.firstName || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, firstName: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '6px',
                          border: '1px solid #d1d5db',
                          fontSize: '0.875rem',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '0.25rem' }}>
                        Last Name
                      </label>
                      <input
                        type="text"
                        value={editFormData.lastName || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, lastName: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '6px',
                          border: '1px solid #d1d5db',
                          fontSize: '0.875rem',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '0.25rem' }}>
                        Email Address
                      </label>
                      <input
                        type="email"
                        value={editFormData.email || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '6px',
                          border: '1px solid #d1d5db',
                          fontSize: '0.875rem',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '0.25rem' }}>
                        Phone Number
                      </label>
                      <input
                        type="text"
                        value={editFormData.phone || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '6px',
                          border: '1px solid #d1d5db',
                          fontSize: '0.875rem',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '0.25rem' }}>
                        Company Name
                      </label>
                      <input
                        type="text"
                        value={editFormData.company || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, company: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '6px',
                          border: '1px solid #d1d5db',
                          fontSize: '0.875rem',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '0.25rem' }}>
                        Lead Source
                      </label>
                      <input
                        type="text"
                        value={editFormData.source || ''}
                        onChange={(e) => setEditFormData({ ...editFormData, source: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '6px',
                          border: '1px solid #d1d5db',
                          fontSize: '0.875rem',
                          boxSizing: 'border-box'
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '0.25rem' }}>
                        Status
                      </label>
                      <select
                        value={editFormData.status || 'new'}
                        onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value as LeadStatus })}
                        style={{
                          width: '100%',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '6px',
                          border: '1px solid #d1d5db',
                          fontSize: '0.875rem',
                          backgroundColor: '#ffffff',
                          boxSizing: 'border-box'
                        }}
                      >
                        <option value="new">New</option>
                        <option value="contacted">Contacted</option>
                        <option value="qualified">Qualified</option>
                        <option value="converted">Converted</option>
                        <option value="lost">Lost</option>
                      </select>
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '0.25rem' }}>
                        Priority
                      </label>
                      <select
                        value={editFormData.priority || 'medium'}
                        onChange={(e) => setEditFormData({ ...editFormData, priority: e.target.value as LeadPriority })}
                        style={{
                          width: '100%',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '6px',
                          border: '1px solid #d1d5db',
                          fontSize: '0.875rem',
                          backgroundColor: '#ffffff',
                          boxSizing: 'border-box'
                        }}
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '0.25rem' }}>
                      Notes & Details
                    </label>
                    <textarea
                      rows={4}
                      value={editFormData.notes || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                      placeholder="Add notes, qualification criteria, or follow-up details..."
                      style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        borderRadius: '6px',
                        border: '1px solid #d1d5db',
                        fontSize: '0.85rem',
                        boxSizing: 'border-box',
                        fontFamily: 'inherit'
                      }}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                    <button
                      type="button"
                      onClick={() => setModalTab('details')}
                      style={{
                        padding: '0.5rem 1rem',
                        borderRadius: '6px',
                        border: '1px solid #d1d5db',
                        backgroundColor: '#ffffff',
                        color: '#374151',
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        cursor: 'pointer'
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingEdit}
                      style={{
                        padding: '0.5rem 1.25rem',
                        borderRadius: '6px',
                        border: 'none',
                        backgroundColor: '#2563eb',
                        color: '#ffffff',
                        fontSize: '0.875rem',
                        fontWeight: 600,
                        cursor: savingEdit ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {savingEdit ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ARCHIVE CONFIRMATION MODAL */}
      {leadToArchive && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="archive-modal-title"
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
            if (e.target === e.currentTarget) setLeadToArchive(null);
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              maxWidth: '440px',
              width: '100%',
              padding: '1.5rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
              border: '1px solid #e5e7eb'
            }}
          >
            <div style={{ fontSize: '2rem', marginBottom: '0.75rem', color: '#dc2626' }}>⚠️</div>
            <h3 id="archive-modal-title" style={{ margin: '0 0 0.5rem 0', fontSize: '1.15rem', fontWeight: 700, color: '#111827' }}>
              Archive Lead?
            </h3>
            <p style={{ margin: '0 0 1.25rem 0', fontSize: '0.875rem', color: '#4b5563', lineHeight: 1.5 }}>
              Are you sure you want to archive{' '}
              <strong>
                "{leadToArchive.firstName} {leadToArchive.lastName || ''}"
              </strong>
              ? This lead will be soft-archived and removed from your active CRM pipeline.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                disabled={archiving}
                onClick={() => setLeadToArchive(null)}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  backgroundColor: '#ffffff',
                  color: '#374151',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={archiving}
                onClick={handleArchiveConfirm}
                style={{
                  padding: '0.5rem 1.1rem',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: '#dc2626',
                  color: '#ffffff',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: archiving ? 'not-allowed' : 'pointer'
                }}
              >
                {archiving ? 'Archiving...' : 'Yes, Archive Lead'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BULK ARCHIVE CONFIRMATION MODAL */}

      {bulkArchiveModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="bulk-archive-modal-title"
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
            if (e.target === e.currentTarget && !bulkProcessing) setBulkArchiveModalOpen(false);
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              maxWidth: '460px',
              width: '100%',
              padding: '1.75rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
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
                <h3 id="bulk-archive-modal-title" style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#111827' }}>
                  Archive {selectedLeadIds.length} {selectedLeadIds.length === 1 ? 'Lead' : 'Leads'}?
                </h3>
                <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.825rem', color: '#6b7280' }}>
                  Action applies to all selected leads
                </p>
              </div>
            </div>

            <p style={{ fontSize: '0.875rem', color: '#4b5563', lineHeight: 1.5, marginBottom: '1.5rem' }}>
              Are you sure you want to archive <strong>{selectedLeadIds.length}</strong> selected lead{selectedLeadIds.length === 1 ? '' : 's'}? They will be removed from your active Leads CRM view and can no longer be updated via active bulk operations.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                disabled={bulkProcessing}
                onClick={() => setBulkArchiveModalOpen(false)}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  backgroundColor: '#ffffff',
                  color: '#374151',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: bulkProcessing ? 'not-allowed' : 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={bulkProcessing}
                onClick={handleBulkArchiveConfirm}
                style={{
                  padding: '0.5rem 1.1rem',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: '#dc2626',
                  color: '#ffffff',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: bulkProcessing ? 'not-allowed' : 'pointer'
                }}
              >
                {bulkProcessing
                  ? 'Archiving...'
                  : `Yes, Archive ${selectedLeadIds.length} ${selectedLeadIds.length === 1 ? 'Lead' : 'Leads'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

};
