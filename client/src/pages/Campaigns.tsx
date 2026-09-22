import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  getCampaigns,
  getCampaignById,
  getCampaignStats,
  getCampaignLeads,
  createCampaign,
  archiveCampaign,
  removeLeadFromCampaign,
  sendCampaign,
  CampaignItem,
  CampaignStatus,
  CampaignPagination,
  CampaignStats,
  CampaignLeadItem,
  CampaignLeadStatus
} from '../api/campaign.api';
import { fetchEmailTemplates, EmailTemplate } from '../api/template.api';

interface CampaignsProps {
  onNavigateToTemplates?: () => void;
}

const STATUS_FILTER_OPTIONS: { label: string; value: CampaignStatus | '' }[] = [
  { label: 'All Statuses', value: '' },
  { label: 'Draft', value: 'draft' },
  { label: 'Active', value: 'active' },
  { label: 'Paused', value: 'paused' },
  { label: 'Completed', value: 'completed' }
];

const LEAD_STATUS_FILTER_OPTIONS: { label: string; value: CampaignLeadStatus | '' }[] = [
  { label: 'All Statuses', value: '' },
  { label: 'Pending', value: 'pending' },
  { label: 'Sent', value: 'sent' },
  { label: 'Failed', value: 'failed' }
];

export const Campaigns: React.FC<CampaignsProps> = ({ onNavigateToTemplates }) => {
  // Navigation / View selection state
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);

  // -------------------------------------------------------------
  // CAMPAIGN LIST STATE
  // -------------------------------------------------------------
  const [campaigns, setCampaigns] = useState<CampaignItem[]>([]);
  const [pagination, setPagination] = useState<CampaignPagination>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  // List filter & search state
  const [page, setPage] = useState<number>(1);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | ''>('');
  const searchTimerRef = useRef<any>(null);

  // Create Campaign modal state
  const [createModalOpen, setCreateModalOpen] = useState<boolean>(false);
  const [availableTemplates, setAvailableTemplates] = useState<EmailTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState<boolean>(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    templateId: '',
    description: ''
  });
  const [createSubmitting, setCreateSubmitting] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Archive modal state
  const [campaignToArchive, setCampaignToArchive] = useState<CampaignItem | null>(null);
  const [archiving, setArchiving] = useState<boolean>(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  // -------------------------------------------------------------
  // CAMPAIGN DETAIL STATE
  // -------------------------------------------------------------
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignItem | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Campaign statistics state
  const [stats, setStats] = useState<CampaignStats | null>(null);
  const [statsLoading, setStatsLoading] = useState<boolean>(false);
  const [statsError, setStatsError] = useState<string | null>(null);

  // Campaign leads state
  const [campaignLeads, setCampaignLeads] = useState<CampaignLeadItem[]>([]);
  const [leadsLoading, setLeadsLoading] = useState<boolean>(false);
  const [leadsError, setLeadsError] = useState<string | null>(null);
  const [leadPage, setLeadPage] = useState<number>(1);
  const [leadStatusFilter, setLeadStatusFilter] = useState<CampaignLeadStatus | ''>('');
  const [leadPagination, setLeadPagination] = useState<CampaignPagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 1
  });

  // Remove lead modal state
  const [leadToRemove, setLeadToRemove] = useState<CampaignLeadItem | null>(null);
  const [removingLead, setRemovingLead] = useState<boolean>(false);
  const [removeLeadError, setRemoveLeadError] = useState<string | null>(null);
  const [detailSuccessMsg, setDetailSuccessMsg] = useState<string | null>(null);

  // Campaign dispatch / send state
  const [sendModalOpen, setSendModalOpen] = useState<boolean>(false);
  const [sendingCampaign, setSendingCampaign] = useState<boolean>(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [campaignCompletedBanner, setCampaignCompletedBanner] = useState<string | null>(null);

  // -------------------------------------------------------------
  // LIST LOGIC & DATA LOADING
  // -------------------------------------------------------------
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(val);
      setPage(1);
    }, 350);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setDebouncedSearch('');
    setPage(1);
  };

  const handleStatusFilterChange = (val: CampaignStatus | '') => {
    setStatusFilter(val);
    setPage(1);
  };

  const handleResetFilters = () => {
    setSearchQuery('');
    setDebouncedSearch('');
    setStatusFilter('');
    setPage(1);
  };

  const loadCampaigns = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await getCampaigns({
        page,
        limit: 10,
        status: statusFilter || undefined,
        search: debouncedSearch || undefined,
        sortBy: 'createdAt',
        sortOrder: 'desc'
      });
      setCampaigns(res.data);
      setPagination(res.pagination);
    } catch (err: any) {
      setError(err.message || 'Failed to load campaigns.');
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, debouncedSearch]);

  useEffect(() => {
    if (!selectedCampaignId) {
      loadCampaigns();
    }
  }, [loadCampaigns, selectedCampaignId]);

  // Modal keydown listener (Escape key)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (sendModalOpen && !sendingCampaign) {
          setSendModalOpen(false);
        } else if (createModalOpen && !createSubmitting) {
          setCreateModalOpen(false);
        } else if (campaignToArchive && !archiving) {
          setCampaignToArchive(null);
        } else if (leadToRemove && !removingLead) {
          setLeadToRemove(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sendModalOpen, sendingCampaign, createModalOpen, createSubmitting, campaignToArchive, archiving, leadToRemove, removingLead]);

  // Open Create Modal and fetch workspace templates
  const handleOpenCreateModal = async () => {
    setFormData({ name: '', templateId: '', description: '' });
    setCreateError(null);
    setCreateModalOpen(true);
    setLoadingTemplates(true);
    setTemplatesError(null);

    try {
      const templates = await fetchEmailTemplates();
      setAvailableTemplates(templates);
      if (templates.length > 0) {
        setFormData((prev) => ({ ...prev, templateId: templates[0]._id }));
      }
    } catch (err: any) {
      setTemplatesError(err.message || 'Failed to load email templates.');
    } finally {
      setLoadingTemplates(false);
    }
  };

  // Submit Create Campaign
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = formData.name.trim();
    const trimmedDesc = formData.description.trim();

    if (!trimmedName) {
      setCreateError('Campaign name is required.');
      return;
    }
    if (trimmedName.length > 150) {
      setCreateError('Campaign name cannot exceed 150 characters.');
      return;
    }
    if (!formData.templateId) {
      setCreateError('Please select an email template.');
      return;
    }
    if (trimmedDesc.length > 1000) {
      setCreateError('Description cannot exceed 1000 characters.');
      return;
    }

    try {
      setCreateSubmitting(true);
      setCreateError(null);

      await createCampaign({
        name: trimmedName,
        templateId: formData.templateId,
        description: trimmedDesc || undefined
      });

      setCreateModalOpen(false);
      setSuccessMsg('Campaign created successfully.');
      setTimeout(() => setSuccessMsg(null), 4000);

      if (page === 1) {
        await loadCampaigns();
      } else {
        setPage(1);
      }
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create campaign.');
    } finally {
      setCreateSubmitting(false);
    }
  };

  // Submit Archive Campaign
  const handleConfirmArchive = async () => {
    if (!campaignToArchive) return;

    try {
      setArchiving(true);
      setArchiveError(null);

      await archiveCampaign(campaignToArchive._id);
      const name = campaignToArchive.name;
      setCampaignToArchive(null);
      setSuccessMsg(`Campaign "${name}" archived successfully.`);
      setTimeout(() => setSuccessMsg(null), 4000);

      if (campaigns.length === 1 && page > 1) {
        setPage((prev) => prev - 1);
      } else {
        await loadCampaigns();
      }
    } catch (err: any) {
      setArchiveError(err.message || 'Failed to archive campaign.');
    } finally {
      setArchiving(false);
    }
  };

  // -------------------------------------------------------------
  // DETAIL VIEW LOGIC & DATA LOADING
  // -------------------------------------------------------------
  const loadCampaignDetail = useCallback(async (id: string) => {
    try {
      setDetailLoading(true);
      setDetailError(null);
      const campaign = await getCampaignById(id);
      setSelectedCampaign(campaign);
    } catch (err: any) {
      setDetailError(err.message || 'Unable to load campaign.');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const loadCampaignStatsData = useCallback(async (id: string) => {
    try {
      setStatsLoading(true);
      setStatsError(null);
      const statsData = await getCampaignStats(id);
      setStats(statsData);
    } catch (err: any) {
      setStatsError(err.message || 'Failed to load campaign statistics.');
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const loadCampaignLeadsData = useCallback(
    async (id: string, pageNum: number, statusVal: CampaignLeadStatus | '') => {
      try {
        setLeadsLoading(true);
        setLeadsError(null);
        const res = await getCampaignLeads(id, {
          page: pageNum,
          limit: 20,
          status: statusVal || undefined
        });
        setCampaignLeads(res.data);
        setLeadPagination(res.pagination);
      } catch (err: any) {
        setLeadsError(err.message || 'Failed to load campaign leads.');
      } finally {
        setLeadsLoading(false);
      }
    },
    []
  );

  // When selectedCampaignId changes, load all detail sub-resources
  useEffect(() => {
    if (selectedCampaignId) {
      setLeadPage(1);
      setLeadStatusFilter('');
      loadCampaignDetail(selectedCampaignId);
      loadCampaignStatsData(selectedCampaignId);
      loadCampaignLeadsData(selectedCampaignId, 1, '');
    } else {
      setSelectedCampaign(null);
      setStats(null);
      setCampaignLeads([]);
      setDetailError(null);
      setStatsError(null);
      setLeadsError(null);
      setDetailSuccessMsg(null);
      setCampaignCompletedBanner(null);
      setSendError(null);
    }
  }, [selectedCampaignId, loadCampaignDetail, loadCampaignStatsData, loadCampaignLeadsData]);

  // Polling for active campaign progress every ~4 seconds
  useEffect(() => {
    if (!selectedCampaignId || !selectedCampaign || selectedCampaign.status !== 'active') {
      return;
    }

    if (stats && stats.pending === 0) {
      return;
    }

    const intervalId = setInterval(async () => {
      try {
        const [updatedStats, updatedCamp, updatedLeadsRes] = await Promise.all([
          getCampaignStats(selectedCampaignId),
          getCampaignById(selectedCampaignId),
          getCampaignLeads(selectedCampaignId, {
            page: leadPage,
            limit: 20,
            status: leadStatusFilter || undefined
          })
        ]);

        setStats(updatedStats);
        setSelectedCampaign(updatedCamp);
        setCampaignLeads(updatedLeadsRes.data);
        setLeadPagination(updatedLeadsRes.pagination);

        if (updatedStats.pending === 0 || updatedCamp.status === 'completed') {
          setCampaignCompletedBanner(
            `Campaign completed! All ${updatedStats.totalLeads} emails have been processed.`
          );
        }
      } catch (pollErr: any) {
        console.warn('Campaign polling error (will retry):', pollErr?.message || pollErr);
      }
    }, 4000);

    return () => {
      clearInterval(intervalId);
    };
  }, [selectedCampaignId, selectedCampaign?.status, stats?.pending, leadPage, leadStatusFilter]);

  // When leadPage or leadStatusFilter changes within detail view
  const handleLeadStatusFilterChange = (newStatus: CampaignLeadStatus | '') => {
    setLeadStatusFilter(newStatus);
    setLeadPage(1);
    if (selectedCampaignId) {
      loadCampaignLeadsData(selectedCampaignId, 1, newStatus);
    }
  };

  const handleLeadPageChange = (newPage: number) => {
    setLeadPage(newPage);
    if (selectedCampaignId) {
      loadCampaignLeadsData(selectedCampaignId, newPage, leadStatusFilter);
    }
  };

  // Switch to detail view
  const handleSelectCampaign = (campaignId: string) => {
    setSelectedCampaignId(campaignId);
  };

  // Back to list view
  const handleBackToList = () => {
    setSelectedCampaignId(null);
    setCampaignCompletedBanner(null);
    setSendError(null);
  };

  // Refresh current campaign detail
  const handleRefreshDetail = () => {
    if (selectedCampaignId) {
      loadCampaignDetail(selectedCampaignId);
      loadCampaignStatsData(selectedCampaignId);
      loadCampaignLeadsData(selectedCampaignId, leadPage, leadStatusFilter);
    }
  };

  // Remove lead flow
  const handleOpenRemoveLeadModal = (leadItem: CampaignLeadItem) => {
    setLeadToRemove(leadItem);
    setRemoveLeadError(null);
  };

  const handleConfirmRemoveLead = async () => {
    if (!leadToRemove || !selectedCampaignId) return;

    try {
      setRemovingLead(true);
      setRemoveLeadError(null);

      // Prefer passing underlying CRM Lead ID
      const targetId =
        typeof leadToRemove.leadId === 'object' && leadToRemove.leadId !== null
          ? leadToRemove.leadId._id
          : String(leadToRemove.leadId || leadToRemove._id);

      await removeLeadFromCampaign(selectedCampaignId, targetId);

      setLeadToRemove(null);
      setDetailSuccessMsg('Lead removed from campaign.');
      setTimeout(() => setDetailSuccessMsg(null), 4000);

      // Refresh stats and leads
      await loadCampaignStatsData(selectedCampaignId);

      // Handle page decrement if last lead on a non-first page was removed
      if (campaignLeads.length === 1 && leadPage > 1) {
        const nextP = leadPage - 1;
        setLeadPage(nextP);
        await loadCampaignLeadsData(selectedCampaignId, nextP, leadStatusFilter);
      } else {
        await loadCampaignLeadsData(selectedCampaignId, leadPage, leadStatusFilter);
      }
    } catch (err: any) {
      setRemoveLeadError(err.message || 'Failed to remove lead from campaign.');
    } finally {
      setRemovingLead(false);
    }
  };

  // Send campaign dispatch handlers
  const handleOpenSendModal = () => {
    setSendError(null);
    setSendModalOpen(true);
  };

  const handleConfirmDispatch = async () => {
    if (!selectedCampaignId || !selectedCampaign) return;

    try {
      setSendingCampaign(true);
      setSendError(null);

      const res = await sendCampaign(selectedCampaignId);

      // 202 Accepted response handling
      setSendModalOpen(false);
      setDetailSuccessMsg(
        `Campaign queued for delivery! ${res.queued} email(s) queued for background delivery.`
      );
      setTimeout(() => setDetailSuccessMsg(null), 6000);

      // Optimistically set active status
      setSelectedCampaign((prev) => (prev ? { ...prev, status: 'active' } : null));

      // Refresh detail, stats, and leads immediately
      await Promise.all([
        loadCampaignDetail(selectedCampaignId),
        loadCampaignStatsData(selectedCampaignId),
        loadCampaignLeadsData(selectedCampaignId, leadPage, leadStatusFilter)
      ]);
    } catch (err: any) {
      if (err.status === 503) {
        setSendError(
          'Email delivery service is currently unavailable. Please ensure the message queue service is running and try again.'
        );
      } else {
        setSendError(err.message || 'Failed to dispatch campaign.');
      }
    } finally {
      setSendingCampaign(false);
    }
  };

  // -------------------------------------------------------------
  // STYLING HELPERS
  // -------------------------------------------------------------
  const getStatusBadgeStyle = (status: CampaignStatus) => {
    switch (status) {
      case 'draft':
        return { bg: '#f3f4f6', color: '#4b5563', border: '#e5e7eb', label: 'Draft' };
      case 'active':
        return { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe', label: 'Active' };
      case 'paused':
        return { bg: '#fffbeb', color: '#b45309', border: '#fde68a', label: 'Paused' };
      case 'completed':
        return { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0', label: 'Completed' };
      default:
        return { bg: '#f3f4f6', color: '#4b5563', border: '#e5e7eb', label: status };
    }
  };

  const getCampaignLeadStatusBadgeStyle = (status: CampaignLeadStatus) => {
    switch (status) {
      case 'pending':
        return { bg: '#fffbeb', color: '#b45309', border: '#fde68a', label: 'Pending' };
      case 'sent':
        return { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0', label: 'Sent' };
      case 'failed':
        return { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca', label: 'Failed' };
      default:
        return { bg: '#f3f4f6', color: '#4b5563', border: '#e5e7eb', label: status };
    }
  };

  const getCrmStatusBadgeStyle = (status?: string) => {
    switch (status) {
      case 'new':
        return { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' };
      case 'contacted':
        return { bg: '#f5f3ff', color: '#6d28d9', border: '#ddd6fe' };
      case 'qualified':
        return { bg: '#ecfdf5', color: '#047857', border: '#a7f3d0' };
      case 'converted':
        return { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' };
      case 'lost':
        return { bg: '#f9fafb', color: '#6b7280', border: '#e5e7eb' };
      default:
        return { bg: '#f9fafb', color: '#6b7280', border: '#e5e7eb' };
    }
  };

  const renderTemplateCell = (templateId: CampaignItem['templateId']) => {
    if (typeof templateId === 'object' && templateId !== null && 'name' in templateId) {
      return (
        <div>
          <div style={{ fontWeight: 600, color: '#111827', fontSize: '0.875rem' }}>
            {templateId.name}
          </div>
          {templateId.subject && (
            <div style={{ fontSize: '0.775rem', color: '#6b7280', marginTop: '0.15rem' }}>
              Subject: {templateId.subject}
            </div>
          )}
        </div>
      );
    }
    return (
      <span style={{ fontSize: '0.85rem', color: '#9ca3af', fontStyle: 'italic' }}>
        Template information unavailable
      </span>
    );
  };

  const formatDate = (isoStr?: string | null) => {
    if (!isoStr) return '—';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return isoStr;
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return isoStr;
    }
  };

  const isListFiltered = Boolean(debouncedSearch || statusFilter);

  // =============================================================
  // RENDER: DETAIL VIEW
  // =============================================================
  if (selectedCampaignId) {
    const detailStatusStyle = selectedCampaign ? getStatusBadgeStyle(selectedCampaign.status) : null;

    return (
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '2rem 1.5rem', color: '#111827' }}>
        {/* Navigation & Action Bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1.5rem',
            flexWrap: 'wrap',
            gap: '1rem'
          }}
        >
          <button
            type="button"
            onClick={handleBackToList}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.5rem 0.9rem',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              backgroundColor: '#ffffff',
              color: '#374151',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
            }}
          >
            <span>←</span>
            <span>Back to Campaigns</span>
          </button>

          <button
            type="button"
            onClick={handleRefreshDetail}
            disabled={detailLoading || statsLoading || leadsLoading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.5rem 0.9rem',
              borderRadius: '6px',
              border: '1px solid #d1d5db',
              backgroundColor: '#ffffff',
              color: '#374151',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: detailLoading || statsLoading || leadsLoading ? 'not-allowed' : 'pointer'
            }}
          >
            <span>🔄</span>
            <span>{detailLoading || statsLoading || leadsLoading ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>

        {/* Notifications */}
        {detailSuccessMsg && (
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
            <span>✓ {detailSuccessMsg}</span>
            <button
              onClick={() => setDetailSuccessMsg(null)}
              style={{ background: 'none', border: 'none', color: '#065f46', cursor: 'pointer', fontSize: '1rem' }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Campaign Detail Loading & Fatal Error State */}
        {detailLoading && !selectedCampaign ? (
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '10px',
              border: '1px solid #e5e7eb',
              padding: '4rem 2rem',
              textAlign: 'center',
              color: '#6b7280',
              marginBottom: '2rem'
            }}
          >
            <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>⏳</div>
            <p style={{ fontSize: '1rem', fontWeight: 600, color: '#374151' }}>Loading campaign...</p>
            <p style={{ fontSize: '0.875rem', margin: 0 }}>Retrieving campaign details and configuration.</p>
          </div>
        ) : detailError && !selectedCampaign ? (
          <div
            role="alert"
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '10px',
              border: '1px solid #fecaca',
              padding: '3rem 2rem',
              textAlign: 'center',
              color: '#991b1b',
              marginBottom: '2rem'
            }}
          >
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>⚠️</div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>Unable to load campaign.</h3>
            <p style={{ fontSize: '0.875rem', color: '#b91c1c', maxWidth: '420px', margin: '0 auto 1.5rem auto' }}>
              {detailError}
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
              <button
                onClick={handleBackToList}
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #d1d5db',
                  color: '#374151',
                  borderRadius: '6px',
                  padding: '0.5rem 1rem',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Back to Campaigns
              </button>
              <button
                onClick={() => selectedCampaignId && loadCampaignDetail(selectedCampaignId)}
                style={{
                  backgroundColor: '#2563eb',
                  border: 'none',
                  color: '#ffffff',
                  borderRadius: '6px',
                  padding: '0.5rem 1rem',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Retry
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* CAMPAIGN HEADER CARD */}
            {selectedCampaign && (
              <div
                style={{
                  backgroundColor: '#ffffff',
                  borderRadius: '10px',
                  border: '1px solid #e5e7eb',
                  padding: '1.5rem',
                  marginBottom: '1.5rem',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)'
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                    gap: '1rem',
                    marginBottom: '0.75rem'
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                      <h1 style={{ fontSize: '1.5rem', fontWeight: 800, margin: 0, color: '#111827' }}>
                        {selectedCampaign.name}
                      </h1>
                      {detailStatusStyle && (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            padding: '0.25rem 0.65rem',
                            borderRadius: '9999px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            backgroundColor: detailStatusStyle.bg,
                            color: detailStatusStyle.color,
                            border: `1px solid ${detailStatusStyle.border}`
                          }}
                        >
                          {selectedCampaign.status === 'active' && (
                            <span
                              style={{
                                width: '7px',
                                height: '7px',
                                borderRadius: '50%',
                                backgroundColor: '#2563eb',
                                display: 'inline-block'
                              }}
                            />
                          )}
                          {detailStatusStyle.label}
                        </span>
                      )}
                    </div>
                    {selectedCampaign.description && (
                      <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem', color: '#4b5563', lineHeight: 1.5 }}>
                        {selectedCampaign.description}
                      </p>
                    )}
                  </div>

                  <div style={{ fontSize: '0.8rem', color: '#6b7280', textAlign: 'right' }}>
                    <div>
                      <strong>Created:</strong> {formatDate(selectedCampaign.createdAt)}
                    </div>
                    {selectedCampaign.updatedAt && (
                      <div style={{ marginTop: '0.2rem' }}>
                        <strong>Updated:</strong> {formatDate(selectedCampaign.updatedAt)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* CAMPAIGN COMPLETED BANNER */}
            {campaignCompletedBanner && (
              <div
                style={{
                  backgroundColor: '#ecfdf5',
                  border: '1px solid #a7f3d0',
                  borderRadius: '10px',
                  padding: '1rem 1.25rem',
                  marginBottom: '1.5rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '1rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '1.5rem' }}>🎉</span>
                  <div>
                    <div style={{ fontSize: '0.925rem', fontWeight: 700, color: '#065f46' }}>
                      Campaign Delivery Complete
                    </div>
                    <div style={{ fontSize: '0.825rem', color: '#047857', marginTop: '0.15rem' }}>
                      {campaignCompletedBanner}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCampaignCompletedBanner(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#047857',
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontSize: '1rem'
                  }}
                  aria-label="Dismiss completion banner"
                >
                  ✕
                </button>
              </div>
            )}

            {/* CAMPAIGN DISPATCH SECTION */}
            {(() => {
              const status = selectedCampaign?.status;
              const isActive = status === 'active';
              const isCompleted = status === 'completed';
              const isPaused = status === 'paused';
              const isDraft = status === 'draft';
              const pendingCount = stats ? stats.pending : 0;
              const canSend = (isDraft || isPaused) && pendingCount > 0;

              return (
                <div
                  style={{
                    backgroundColor: isActive ? '#eff6ff' : isCompleted ? '#f0fdf4' : '#f8fafc',
                    borderRadius: '10px',
                    border: `1px solid ${isActive ? '#93c5fd' : isCompleted ? '#bbf7d0' : '#e2e8f0'}`,
                    padding: '1.25rem',
                    marginBottom: '1.5rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '1rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                    <span style={{ fontSize: '1.75rem' }}>
                      {isActive ? '⏳' : isCompleted ? '✅' : '🚀'}
                    </span>
                    <div>
                      <div
                        style={{
                          fontSize: '0.95rem',
                          fontWeight: 700,
                          color: isActive ? '#1e40af' : isCompleted ? '#166534' : '#1e293b'
                        }}
                      >
                        {isActive
                          ? 'Campaign is currently being dispatched in the background...'
                          : isCompleted
                          ? 'Campaign Completed'
                          : 'Campaign Dispatch'}
                      </div>
                      <div
                        style={{
                          fontSize: '0.825rem',
                          color: isActive ? '#2563eb' : isCompleted ? '#15803d' : '#64748b',
                          marginTop: '0.2rem'
                        }}
                      >
                        {isActive
                          ? `Pending: ${stats?.pending ?? 0} | Sent: ${stats?.sent ?? 0} | Failed: ${stats?.failed ?? 0}`
                          : isCompleted
                          ? `All ${stats?.totalLeads ?? 0} lead(s) have been processed (${stats?.sent ?? 0} sent, ${stats?.failed ?? 0} failed).`
                          : pendingCount === 0
                          ? 'No pending leads to send. Associate leads from CRM to enable delivery.'
                          : `${pendingCount} lead(s) ready for background delivery.`}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleOpenSendModal}
                    disabled={!canSend}
                    title={
                      isActive
                        ? 'Campaign is currently sending in the background'
                        : isCompleted
                        ? 'Campaign has finished delivery'
                        : pendingCount === 0
                        ? 'No pending leads to send'
                        : 'Send this campaign to pending leads'
                    }
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      backgroundColor: canSend ? '#2563eb' : '#cbd5e1',
                      color: canSend ? '#ffffff' : '#64748b',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '0.55rem 1.15rem',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      cursor: canSend ? 'pointer' : 'not-allowed',
                      boxShadow: canSend ? '0 1px 2px rgba(0, 0, 0, 0.05)' : 'none'
                    }}
                  >
                    {isActive ? (
                      <>
                        <span>↻</span>
                        <span>Campaign Sending...</span>
                      </>
                    ) : isCompleted ? (
                      <>
                        <span>✓</span>
                        <span>Campaign Completed</span>
                      </>
                    ) : pendingCount === 0 ? (
                      <>
                        <span>⏸</span>
                        <span>No Pending Leads</span>
                      </>
                    ) : (
                      <>
                        <span>🚀</span>
                        <span>Send Campaign</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })()}

            {/* EMAIL TEMPLATE SUMMARY CARD */}
            <div
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '10px',
                border: '1px solid #e5e7eb',
                padding: '1.25rem',
                marginBottom: '1.5rem',
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)'
              }}
            >
              <div
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: '#6b7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  marginBottom: '0.5rem'
                }}
              >
                Assigned Email Template
              </div>

              {selectedCampaign ? (
                typeof selectedCampaign.templateId === 'object' &&
                selectedCampaign.templateId !== null &&
                'name' in selectedCampaign.templateId ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: '#111827' }}>
                      {selectedCampaign.templateId.name}
                    </div>
                    {selectedCampaign.templateId.subject && (
                      <div style={{ fontSize: '0.875rem', color: '#4b5563' }}>
                        <span style={{ fontWeight: 600, color: '#374151' }}>Subject:</span>{' '}
                        {selectedCampaign.templateId.subject}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: '0.875rem', color: '#9ca3af', fontStyle: 'italic' }}>
                    Template information unavailable.
                  </div>
                )
              ) : (
                <div style={{ fontSize: '0.875rem', color: '#9ca3af', fontStyle: 'italic' }}>
                  Loading template...
                </div>
              )}
            </div>

            {/* CAMPAIGN STATISTICS (EXACTLY 4 METRICS) */}
            <div style={{ marginBottom: '2rem' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.75rem'
                }}
              >
                <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#111827', margin: 0 }}>
                  Campaign Statistics
                </h2>
                {statsLoading && (
                  <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>Loading statistics...</span>
                )}
              </div>

              {statsError ? (
                <div
                  style={{
                    backgroundColor: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: '8px',
                    padding: '0.85rem 1rem',
                    color: '#991b1b',
                    fontSize: '0.85rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <span>Failed to load statistics: {statsError}</span>
                  <button
                    onClick={() => selectedCampaignId && loadCampaignStatsData(selectedCampaignId)}
                    style={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #fca5a5',
                      color: '#991b1b',
                      borderRadius: '4px',
                      padding: '0.25rem 0.55rem',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '1rem'
                  }}
                >
                  {/* Card 1: Total Leads */}
                  <div
                    style={{
                      backgroundColor: '#ffffff',
                      borderRadius: '10px',
                      border: '1px solid #e5e7eb',
                      padding: '1.25rem',
                      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
                      borderTop: '3px solid #2563eb'
                    }}
                  >
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                      Total Leads
                    </div>
                    <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#111827', margin: '0.35rem 0' }}>
                      {stats ? stats.totalLeads : '—'}
                    </div>
                    <div style={{ fontSize: '0.775rem', color: '#6b7280', lineHeight: 1.3 }}>
                      Total recipients enrolled in campaign
                    </div>
                  </div>

                  {/* Card 2: Pending */}
                  <div
                    style={{
                      backgroundColor: '#ffffff',
                      borderRadius: '10px',
                      border: '1px solid #e5e7eb',
                      padding: '1.25rem',
                      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
                      borderTop: '3px solid #d97706'
                    }}
                  >
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                      Pending
                    </div>
                    <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#b45309', margin: '0.35rem 0' }}>
                      {stats ? stats.pending : '—'}
                    </div>
                    <div style={{ fontSize: '0.775rem', color: '#6b7280', lineHeight: 1.3 }}>
                      Awaiting background delivery
                    </div>
                  </div>

                  {/* Card 3: Sent */}
                  <div
                    style={{
                      backgroundColor: '#ffffff',
                      borderRadius: '10px',
                      border: '1px solid #e5e7eb',
                      padding: '1.25rem',
                      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
                      borderTop: '3px solid #059669'
                    }}
                  >
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                      Sent
                    </div>
                    <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#047857', margin: '0.35rem 0' }}>
                      {stats ? stats.sent : '—'}
                    </div>
                    <div style={{ fontSize: '0.775rem', color: '#6b7280', lineHeight: 1.3 }}>
                      Successfully processed by email service
                    </div>
                  </div>

                  {/* Card 4: Failed */}
                  <div
                    style={{
                      backgroundColor: '#ffffff',
                      borderRadius: '10px',
                      border: '1px solid #e5e7eb',
                      padding: '1.25rem',
                      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
                      borderTop: '3px solid #dc2626'
                    }}
                  >
                    <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
                      Failed
                    </div>
                    <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#b91c1c', margin: '0.35rem 0' }}>
                      {stats ? stats.failed : '—'}
                    </div>
                    <div style={{ fontSize: '0.775rem', color: '#6b7280', lineHeight: 1.3 }}>
                      Processing or delivery failure recorded
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* CAMPAIGN LEADS TABLE SECTION */}
            <div style={{ marginBottom: '2rem' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '1rem',
                  flexWrap: 'wrap',
                  gap: '1rem'
                }}
              >
                <div>
                  <h2 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#111827', margin: 0 }}>
                    Campaign Leads
                  </h2>
                  <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', color: '#6b7280' }}>
                    Recipients enrolled in this campaign.
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  {/* Status Filter */}
                  <label htmlFor="lead-status-filter" style={{ fontSize: '0.85rem', fontWeight: 600, color: '#4b5563' }}>
                    Status:
                  </label>
                  <select
                    id="lead-status-filter"
                    value={leadStatusFilter}
                    onChange={(e) => handleLeadStatusFilterChange(e.target.value as CampaignLeadStatus | '')}
                    style={{
                      padding: '0.45rem 0.75rem',
                      borderRadius: '6px',
                      border: '1px solid #d1d5db',
                      fontSize: '0.85rem',
                      backgroundColor: '#ffffff',
                      color: '#374151',
                      cursor: 'pointer'
                    }}
                  >
                    {LEAD_STATUS_FILTER_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() =>
                      selectedCampaignId && loadCampaignLeadsData(selectedCampaignId, leadPage, leadStatusFilter)
                    }
                    disabled={leadsLoading}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      padding: '0.45rem 0.75rem',
                      borderRadius: '6px',
                      border: '1px solid #d1d5db',
                      backgroundColor: '#ffffff',
                      color: '#374151',
                      fontSize: '0.85rem',
                      fontWeight: 500,
                      cursor: leadsLoading ? 'not-allowed' : 'pointer'
                    }}
                  >
                    <span>🔄</span>
                    <span>{leadsLoading ? 'Loading...' : 'Refresh'}</span>
                  </button>
                </div>
              </div>

              {/* Localized Leads Error */}
              {leadsError && (
                <div
                  style={{
                    backgroundColor: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: '8px',
                    padding: '0.85rem 1rem',
                    color: '#991b1b',
                    fontSize: '0.85rem',
                    marginBottom: '1rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <span>Failed to load campaign leads: {leadsError}</span>
                  <button
                    onClick={() =>
                      selectedCampaignId && loadCampaignLeadsData(selectedCampaignId, leadPage, leadStatusFilter)
                    }
                    style={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #fca5a5',
                      color: '#991b1b',
                      borderRadius: '4px',
                      padding: '0.25rem 0.55rem',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Retry
                  </button>
                </div>
              )}

              {/* Leads Content: Loading / Empty / Table */}
              {leadsLoading && campaignLeads.length === 0 ? (
                <div
                  style={{
                    backgroundColor: '#ffffff',
                    borderRadius: '10px',
                    border: '1px solid #e5e7eb',
                    padding: '3.5rem 2rem',
                    textAlign: 'center',
                    color: '#6b7280'
                  }}
                >
                  <div style={{ fontSize: '1.75rem', marginBottom: '0.5rem' }}>⏳</div>
                  <p style={{ fontSize: '0.95rem', fontWeight: 600, color: '#374151', margin: '0 0 0.25rem 0' }}>
                    Loading campaign leads...
                  </p>
                  <p style={{ fontSize: '0.825rem', margin: 0 }}>Retrieving recipients from this campaign.</p>
                </div>
              ) : campaignLeads.length === 0 ? (
                <div
                  style={{
                    backgroundColor: '#ffffff',
                    borderRadius: '10px',
                    border: '1px solid #e5e7eb',
                    padding: '3.5rem 2rem',
                    textAlign: 'center',
                    color: '#4b5563'
                  }}
                >
                  {leadStatusFilter ? (
                    <div>
                      <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔍</div>
                      <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#111827', margin: '0 0 0.4rem 0' }}>
                        No leads match status &ldquo;{leadStatusFilter}&rdquo;
                      </h4>
                      <p style={{ fontSize: '0.875rem', color: '#6b7280', margin: '0 0 1rem 0' }}>
                        No enrolled leads matched your selected filter.
                      </p>
                      <button
                        type="button"
                        onClick={() => handleLeadStatusFilterChange('')}
                        style={{
                          backgroundColor: '#2563eb',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '6px',
                          padding: '0.45rem 0.9rem',
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        Clear Filter
                      </button>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: '2.25rem', marginBottom: '0.5rem' }}>👥</div>
                      <h4 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#111827', margin: '0 0 0.4rem 0' }}>
                        No leads have been added to this campaign yet.
                      </h4>
                      <p style={{ fontSize: '0.875rem', color: '#6b7280', maxWidth: '420px', margin: '0 auto' }}>
                        Go to Leads CRM and use Add to Campaign to add recipients.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div
                  style={{
                    backgroundColor: '#ffffff',
                    borderRadius: '10px',
                    border: '1px solid #e5e7eb',
                    overflow: 'hidden',
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
                  }}
                >
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                          <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>
                            Name
                          </th>
                          <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>
                            Email
                          </th>
                          <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>
                            Company
                          </th>
                          <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>
                            Phone
                          </th>
                          <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>
                            CRM Status
                          </th>
                          <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>
                            Campaign Status
                          </th>
                          <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>
                            Added
                          </th>
                          <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', textAlign: 'right' }}>
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {campaignLeads.map((item) => {
                          const lead = item.leadId || {};
                          const fullName = lead.firstName
                            ? `${lead.firstName}${lead.lastName ? ' ' + lead.lastName : ''}`
                            : 'Unknown Lead';
                          const crmStatusStyle = getCrmStatusBadgeStyle(lead.status);
                          const campStatusStyle = getCampaignLeadStatusBadgeStyle(item.status);

                          return (
                            <tr
                              key={item._id}
                              style={{
                                borderBottom: '1px solid #f3f4f6',
                                transition: 'background-color 0.1s'
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#fafafa')}
                              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                            >
                              {/* 1. Name */}
                              <td style={{ padding: '0.85rem 1rem', fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>
                                {fullName}
                              </td>

                              {/* 2. Email */}
                              <td style={{ padding: '0.85rem 1rem', fontSize: '0.85rem', color: lead.email ? '#374151' : '#9ca3af' }}>
                                {lead.email || <em>No email</em>}
                              </td>

                              {/* 3. Company */}
                              <td style={{ padding: '0.85rem 1rem', fontSize: '0.85rem', color: '#4b5563' }}>
                                {lead.company || '—'}
                              </td>

                              {/* 4. Phone */}
                              <td style={{ padding: '0.85rem 1rem', fontSize: '0.85rem', color: '#4b5563' }}>
                                {lead.phone || '—'}
                              </td>

                              {/* 5. CRM Lead Status */}
                              <td style={{ padding: '0.85rem 1rem' }}>
                                <span
                                  style={{
                                    display: 'inline-block',
                                    padding: '0.15rem 0.5rem',
                                    borderRadius: '9999px',
                                    fontSize: '0.725rem',
                                    fontWeight: 600,
                                    backgroundColor: crmStatusStyle.bg,
                                    color: crmStatusStyle.color,
                                    border: `1px solid ${crmStatusStyle.border}`,
                                    textTransform: 'capitalize'
                                  }}
                                >
                                  {lead.status || 'new'}
                                </span>
                              </td>

                              {/* 6. Campaign Status */}
                              <td style={{ padding: '0.85rem 1rem' }}>
                                <span
                                  style={{
                                    display: 'inline-block',
                                    padding: '0.15rem 0.5rem',
                                    borderRadius: '9999px',
                                    fontSize: '0.725rem',
                                    fontWeight: 600,
                                    backgroundColor: campStatusStyle.bg,
                                    color: campStatusStyle.color,
                                    border: `1px solid ${campStatusStyle.border}`
                                  }}
                                >
                                  {campStatusStyle.label}
                                </span>
                              </td>

                              {/* 7. Added */}
                              <td style={{ padding: '0.85rem 1rem', fontSize: '0.8rem', color: '#6b7280', whiteSpace: 'nowrap' }}>
                                {formatDate(item.addedAt)}
                              </td>

                              {/* 8. Action: Remove */}
                              <td style={{ padding: '0.85rem 1rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                <button
                                  type="button"
                                  onClick={() => handleOpenRemoveLeadModal(item)}
                                  title="Remove lead from campaign"
                                  style={{
                                    padding: '0.3rem 0.65rem',
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    borderRadius: '5px',
                                    border: '1px solid #fecaca',
                                    backgroundColor: '#fff5f5',
                                    color: '#dc2626',
                                    cursor: 'pointer'
                                  }}
                                >
                                  Remove
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  <div
                    style={{
                      padding: '0.75rem 1rem',
                      backgroundColor: '#f9fafb',
                      borderTop: '1px solid #e5e7eb',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '0.5rem'
                    }}
                  >
                    <div style={{ fontSize: '0.825rem', color: '#6b7280' }}>
                      Showing {campaignLeads.length} of {leadPagination.total} lead{leadPagination.total === 1 ? '' : 's'}{' '}
                      (Page {leadPagination.page} of {Math.max(leadPagination.totalPages, 1)})
                    </div>

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        type="button"
                        onClick={() => handleLeadPageChange(Math.max(leadPagination.page - 1, 1))}
                        disabled={leadPagination.page <= 1 || leadsLoading}
                        style={{
                          padding: '0.35rem 0.75rem',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          borderRadius: '5px',
                          border: '1px solid #d1d5db',
                          backgroundColor: leadPagination.page <= 1 ? '#f3f4f6' : '#ffffff',
                          color: leadPagination.page <= 1 ? '#9ca3af' : '#374151',
                          cursor: leadPagination.page <= 1 || leadsLoading ? 'not-allowed' : 'pointer'
                        }}
                      >
                        Previous
                      </button>
                      <button
                        type="button"
                        onClick={() => handleLeadPageChange(Math.min(leadPagination.page + 1, leadPagination.totalPages))}
                        disabled={leadPagination.page >= leadPagination.totalPages || leadsLoading}
                        style={{
                          padding: '0.35rem 0.75rem',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          borderRadius: '5px',
                          border: '1px solid #d1d5db',
                          backgroundColor: leadPagination.page >= leadPagination.totalPages ? '#f3f4f6' : '#ffffff',
                          color: leadPagination.page >= leadPagination.totalPages ? '#9ca3af' : '#374151',
                          cursor: leadPagination.page >= leadPagination.totalPages || leadsLoading ? 'not-allowed' : 'pointer'
                        }}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* REMOVE LEAD CONFIRMATION MODAL */}
        {leadToRemove && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="remove-lead-title"
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
              if (e.target === e.currentTarget && !removingLead) setLeadToRemove(null);
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
                  <h3 id="remove-lead-title" style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#111827' }}>
                    Remove lead from campaign?
                  </h3>
                  <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.825rem', color: '#6b7280' }}>
                    {leadToRemove.leadId?.firstName
                      ? `${leadToRemove.leadId.firstName}${leadToRemove.leadId.lastName ? ' ' + leadToRemove.leadId.lastName : ''}`
                      : 'Selected Lead'}
                  </p>
                </div>
              </div>

              {removeLeadError && (
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
                  ⚠️ {removeLeadError}
                </div>
              )}

              <p style={{ fontSize: '0.875rem', color: '#4b5563', lineHeight: 1.5, marginBottom: '1.5rem' }}>
                This will remove the lead from this campaign only. The CRM lead will remain unchanged.
              </p>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  disabled={removingLead}
                  onClick={() => setLeadToRemove(null)}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    backgroundColor: '#ffffff',
                    color: '#374151',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: removingLead ? 'not-allowed' : 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={removingLead}
                  onClick={handleConfirmRemoveLead}
                  style={{
                    padding: '0.5rem 1.1rem',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: '#dc2626',
                    color: '#ffffff',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: removingLead ? 'not-allowed' : 'pointer'
                  }}
                >
                  {removingLead ? 'Removing...' : 'Remove Lead'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SEND CAMPAIGN CONFIRMATION MODAL */}
        {sendModalOpen && selectedCampaign && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="send-campaign-modal-title"
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(17, 24, 39, 0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 50,
              padding: '1.5rem',
              backdropFilter: 'blur(2px)'
            }}
            onClick={(e) => {
              if (e.target === e.currentTarget && !sendingCampaign) setSendModalOpen(false);
            }}
          >
            <div
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '12px',
                maxWidth: '520px',
                width: '100%',
                padding: '1.75rem',
                boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
                border: '1px solid #e5e7eb'
              }}
            >
              {/* Modal Header */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '1.25rem'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      backgroundColor: '#eff6ff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '1.25rem',
                      flexShrink: 0
                    }}
                  >
                    🚀
                  </div>
                  <div>
                    <h3
                      id="send-campaign-modal-title"
                      style={{
                        margin: 0,
                        fontSize: '1.15rem',
                        fontWeight: 700,
                        color: '#111827'
                      }}
                    >
                      Send Campaign: {selectedCampaign.name}?
                    </h3>
                    <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', color: '#6b7280' }}>
                      Confirm asynchronous background dispatch
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSendModalOpen(false)}
                  disabled={sendingCampaign}
                  aria-label="Close modal"
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: '1.25rem',
                    color: '#9ca3af',
                    cursor: sendingCampaign ? 'not-allowed' : 'pointer',
                    padding: '0.25rem'
                  }}
                >
                  ✕
                </button>
              </div>

              {/* Error Banner */}
              {sendError && (
                <div
                  style={{
                    backgroundColor: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: '6px',
                    padding: '0.75rem',
                    color: '#991b1b',
                    fontSize: '0.85rem',
                    marginBottom: '1.25rem',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.5rem'
                  }}
                >
                  <span>⚠️</span>
                  <div>{sendError}</div>
                </div>
              )}

              {/* Summary Details */}
              <div
                style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '1rem',
                  fontSize: '0.85rem',
                  color: '#334155',
                  marginBottom: '1rem',
                  lineHeight: 1.6
                }}
              >
                <div>
                  <strong>Campaign:</strong> {selectedCampaign.name}
                </div>
                <div>
                  <strong>Template:</strong>{' '}
                  {typeof selectedCampaign.templateId === 'object' && selectedCampaign.templateId !== null
                    ? `${selectedCampaign.templateId.name} ("${selectedCampaign.templateId.subject}")`
                    : 'Assigned Template'}
                </div>
                <div>
                  <strong>Recipients to queue:</strong>{' '}
                  <span style={{ fontWeight: 700, color: '#1d4ed8' }}>
                    {stats ? stats.pending : 0} pending lead(s)
                  </span>
                </div>
              </div>

              {/* Missing emails check warning */}
              {(() => {
                const missingEmails = campaignLeads.filter(
                  (l) => !l.leadId?.email || !l.leadId.email.trim()
                );
                if (missingEmails.length > 0) {
                  return (
                    <div
                      style={{
                        backgroundColor: '#fffbeb',
                        border: '1px solid #fde68a',
                        borderRadius: '6px',
                        padding: '0.75rem',
                        color: '#92400e',
                        fontSize: '0.825rem',
                        marginBottom: '1rem',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.5rem'
                      }}
                    >
                      <span>⚠️</span>
                      <div>
                        <strong>Missing Email Warning:</strong> Some leads in this campaign ({missingEmails.length} in currently loaded page) do not have an email address. These leads will fail during delivery.
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              {/* Async Information Notice */}
              <div
                style={{
                  backgroundColor: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  borderRadius: '6px',
                  padding: '0.75rem 1rem',
                  fontSize: '0.825rem',
                  color: '#1e40af',
                  marginBottom: '1.5rem',
                  lineHeight: 1.4
                }}
              >
                ℹ️ <strong>Asynchronous Dispatch:</strong> This will enqueue {stats ? stats.pending : 0} email delivery job(s) for asynchronous background processing. Emails will be dispatched using the configured email provider.
              </div>

              {/* Modal Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  type="button"
                  disabled={sendingCampaign}
                  onClick={() => setSendModalOpen(false)}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: '6px',
                    border: '1px solid #d1d5db',
                    backgroundColor: '#ffffff',
                    color: '#374151',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: sendingCampaign ? 'not-allowed' : 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={sendingCampaign}
                  onClick={handleConfirmDispatch}
                  style={{
                    padding: '0.5rem 1.25rem',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor: '#2563eb',
                    color: '#ffffff',
                    fontSize: '0.875rem',
                    fontWeight: 600,
                    cursor: sendingCampaign ? 'not-allowed' : 'pointer',
                    opacity: sendingCampaign ? 0.7 : 1
                  }}
                >
                  {sendingCampaign ? 'Dispatching...' : 'Confirm & Dispatch'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =============================================================
  // RENDER: LIST VIEW
  // =============================================================
  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '2rem 1.5rem', color: '#111827' }}>
      {/* Header Banner */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '2rem',
          flexWrap: 'wrap',
          gap: '1rem'
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, color: '#111827' }}>
              Campaigns
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
            Create and manage email outreach campaigns for your CRM leads.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenCreateModal}
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
          <span>Create Campaign</span>
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

      {infoMsg && (
        <div
          role="status"
          style={{
            marginBottom: '1.5rem',
            padding: '0.75rem 1rem',
            backgroundColor: '#eff6ff',
            color: '#1e40af',
            borderRadius: '8px',
            border: '1px solid #bfdbfe',
            fontSize: '0.875rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <span>ℹ️ {infoMsg}</span>
          <button
            onClick={() => setInfoMsg(null)}
            style={{ background: 'none', border: 'none', color: '#1e40af', cursor: 'pointer', fontSize: '1rem' }}
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
            padding: '0.85rem 1rem',
            backgroundColor: '#fef2f2',
            color: '#991b1b',
            borderRadius: '8px',
            border: '1px solid #fecaca',
            fontSize: '0.875rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.5rem'
          }}
        >
          <div>
            <strong>Error:</strong> {error}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <button
              onClick={loadCampaigns}
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #fca5a5',
                color: '#991b1b',
                borderRadius: '4px',
                padding: '0.3rem 0.65rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Retry
            </button>
            <button
              onClick={() => setError(null)}
              style={{ background: 'none', border: 'none', color: '#991b1b', cursor: 'pointer', fontSize: '1rem' }}
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Controls Bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
          marginBottom: '1.5rem'
        }}
      >
        <div style={{ display: 'flex', flex: '1 1 320px', maxWidth: '600px', gap: '0.75rem', alignItems: 'center' }}>
          {/* Search Input */}
          <div style={{ position: 'relative', flex: '1 1 240px' }}>
            <span
              style={{
                position: 'absolute',
                left: '0.75rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#9ca3af',
                fontSize: '0.85rem'
              }}
            >
              🔎
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              placeholder="Search campaigns..."
              style={{
                width: '100%',
                padding: '0.55rem 2rem 0.55rem 2.25rem',
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
                aria-label="Clear search query"
                style={{
                  position: 'absolute',
                  right: '0.65rem',
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
            onChange={(e) => handleStatusFilterChange(e.target.value as CampaignStatus | '')}
            aria-label="Filter campaigns by status"
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
            {STATUS_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {/* Clear Filters */}
          {isListFiltered && (
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

        {/* Refresh Button */}
        <button
          type="button"
          onClick={loadCampaigns}
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

      {/* Main Table / Empty State / Loading State */}
      {loading && campaigns.length === 0 ? (
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
          <p style={{ fontSize: '1rem', fontWeight: 600, color: '#374151' }}>Loading campaigns...</p>
          <p style={{ fontSize: '0.875rem', margin: 0 }}>Retrieving campaigns from your workspace.</p>
        </div>
      ) : campaigns.length === 0 ? (
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
          {isListFiltered ? (
            <div>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>🔍</div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827', margin: '0 0 0.5rem 0' }}>
                No campaigns match your current filters
              </h3>
              <p style={{ fontSize: '0.9rem', color: '#6b7280', maxWidth: '460px', margin: '0 auto 1.25rem auto' }}>
                No campaigns matched your search query or status filter. Try clearing your filters to see all campaigns.
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
                Reset Filters
              </button>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📢</div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827', margin: '0 0 0.5rem 0' }}>
                No campaigns created yet.
              </h3>
              <p style={{ fontSize: '0.9rem', color: '#6b7280', maxWidth: '460px', margin: '0 auto 1.5rem auto' }}>
                Create your first campaign to start organizing email outreach.
              </p>
              <button
                type="button"
                onClick={handleOpenCreateModal}
                style={{
                  backgroundColor: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '0.65rem 1.25rem',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
                }}
              >
                Create Your First Campaign
              </button>
            </div>
          )}
        </div>
      ) : (
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '10px',
            border: '1px solid #e5e7eb',
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
          }}
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead>
                <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>
                    Campaign
                  </th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>
                    Email Template
                  </th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>
                    Status
                  </th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>
                    Created
                  </th>
                  <th style={{ padding: '0.75rem 1rem', fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', textAlign: 'right' }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => {
                  const statusStyle = getStatusBadgeStyle(c.status);
                  return (
                    <tr
                      key={c._id}
                      style={{
                        borderBottom: '1px solid #f3f4f6',
                        transition: 'background-color 0.1s'
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#fafafa')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      {/* Campaign Column */}
                      <td style={{ padding: '1rem', verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 600, color: '#111827', fontSize: '0.9rem', marginBottom: '0.15rem' }}>
                          {c.name}
                        </div>
                        {c.description && (
                          <div style={{ fontSize: '0.8rem', color: '#6b7280', lineHeight: 1.4, maxWidth: '380px' }}>
                            {c.description}
                          </div>
                        )}
                      </td>

                      {/* Email Template Column */}
                      <td style={{ padding: '1rem', verticalAlign: 'top' }}>
                        {renderTemplateCell(c.templateId)}
                      </td>

                      {/* Status Column */}
                      <td style={{ padding: '1rem', verticalAlign: 'top' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '0.2rem 0.55rem',
                            borderRadius: '9999px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            backgroundColor: statusStyle.bg,
                            color: statusStyle.color,
                            border: `1px solid ${statusStyle.border}`
                          }}
                        >
                          {statusStyle.label}
                        </span>
                      </td>

                      {/* Created Column */}
                      <td style={{ padding: '1rem', verticalAlign: 'top', fontSize: '0.85rem', color: '#4b5563', whiteSpace: 'nowrap' }}>
                        {formatDate(c.createdAt)}
                      </td>

                      {/* Actions Column */}
                      <td style={{ padding: '1rem', verticalAlign: 'top', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', gap: '0.4rem', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            onClick={() => handleSelectCampaign(c._id)}
                            title="View / Manage Campaign"
                            style={{
                              padding: '0.35rem 0.7rem',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              borderRadius: '5px',
                              border: '1px solid #d1d5db',
                              backgroundColor: '#ffffff',
                              color: '#374151',
                              cursor: 'pointer'
                            }}
                          >
                            View / Manage
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setArchiveError(null);
                              setCampaignToArchive(c);
                            }}
                            title="Archive Campaign"
                            style={{
                              padding: '0.35rem 0.7rem',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              borderRadius: '5px',
                              border: '1px solid #fecaca',
                              backgroundColor: '#fff5f5',
                              color: '#dc2626',
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

          {/* Pagination */}
          <div
            style={{
              padding: '0.75rem 1rem',
              backgroundColor: '#f9fafb',
              borderTop: '1px solid #e5e7eb',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.5rem'
            }}
          >
            <div style={{ fontSize: '0.825rem', color: '#6b7280' }}>
              Showing {campaigns.length} of {pagination.total} campaign{pagination.total === 1 ? '' : 's'} (Page {pagination.page} of {Math.max(pagination.totalPages, 1)})
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
                disabled={pagination.page <= 1 || loading}
                style={{
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  borderRadius: '5px',
                  border: '1px solid #d1d5db',
                  backgroundColor: pagination.page <= 1 ? '#f3f4f6' : '#ffffff',
                  color: pagination.page <= 1 ? '#9ca3af' : '#374151',
                  cursor: pagination.page <= 1 || loading ? 'not-allowed' : 'pointer'
                }}
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(p + 1, pagination.totalPages))}
                disabled={pagination.page >= pagination.totalPages || loading}
                style={{
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  borderRadius: '5px',
                  border: '1px solid #d1d5db',
                  backgroundColor: pagination.page >= pagination.totalPages ? '#f3f4f6' : '#ffffff',
                  color: pagination.page >= pagination.totalPages ? '#9ca3af' : '#374151',
                  cursor: pagination.page >= pagination.totalPages || loading ? 'not-allowed' : 'pointer'
                }}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE CAMPAIGN MODAL */}
      {createModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-campaign-title"
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
            if (e.target === e.currentTarget && !createSubmitting) setCreateModalOpen(false);
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              maxWidth: '560px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '1.75rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h2 id="create-campaign-title" style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#111827' }}>
                Create New Campaign
              </h2>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                disabled={createSubmitting}
                style={{ background: 'none', border: 'none', fontSize: '1.25rem', color: '#6b7280', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {createError && (
              <div
                id="create-campaign-error"
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
                ⚠️ {createError}
              </div>
            )}

            {loadingTemplates ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>
                <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>⏳</div>
                <p style={{ margin: 0, fontSize: '0.875rem' }}>Loading workspace email templates...</p>
              </div>
            ) : templatesError ? (
              <div
                style={{
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#991b1b',
                  borderRadius: '6px',
                  padding: '0.85rem',
                  fontSize: '0.85rem',
                  marginBottom: '1rem'
                }}
              >
                Failed to load email templates: {templatesError}
              </div>
            ) : availableTemplates.length === 0 ? (
              <div
                style={{
                  backgroundColor: '#fffbeb',
                  border: '1px solid #fde68a',
                  color: '#92400e',
                  borderRadius: '8px',
                  padding: '1.25rem',
                  marginBottom: '1.5rem',
                  textAlign: 'center'
                }}
              >
                <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⚠️</div>
                <h4 style={{ margin: '0 0 0.4rem 0', fontSize: '1rem', fontWeight: 700, color: '#92400e' }}>
                  No Email Templates Available
                </h4>
                <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', lineHeight: 1.4 }}>
                  No email templates found in your workspace. Create an email template before creating a campaign.
                </p>
                {onNavigateToTemplates && (
                  <button
                    type="button"
                    onClick={() => {
                      setCreateModalOpen(false);
                      onNavigateToTemplates();
                    }}
                    style={{
                      backgroundColor: '#2563eb',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '0.5rem 1rem',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    Go to Email Templates
                  </button>
                )}
              </div>
            ) : (
              <form onSubmit={handleCreateSubmit}>
                {/* Campaign Name */}
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '0.35rem' }}>
                    Campaign Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g., Q4 Restaurant Outreach"
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

                {/* Email Template Selection */}
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '0.35rem' }}>
                    Email Template *
                  </label>
                  <select
                    value={formData.templateId}
                    onChange={(e) => setFormData({ ...formData, templateId: e.target.value })}
                    required
                    style={{
                      width: '100%',
                      padding: '0.6rem 0.75rem',
                      borderRadius: '6px',
                      border: '1px solid #d1d5db',
                      fontSize: '0.875rem',
                      backgroundColor: '#ffffff',
                      color: '#111827',
                      boxSizing: 'border-box',
                      cursor: 'pointer'
                    }}
                  >
                    {availableTemplates.map((t) => (
                      <option key={t._id} value={t._id}>
                        {t.name} — {t.subject}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Description */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '0.35rem' }}>
                    Description (Optional)
                  </label>
                  <textarea
                    rows={3}
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Targeting Paris restaurants discovered during Q1..."
                    maxLength={1000}
                    style={{
                      width: '100%',
                      padding: '0.6rem 0.75rem',
                      borderRadius: '6px',
                      border: '1px solid #d1d5db',
                      fontSize: '0.875rem',
                      boxSizing: 'border-box',
                      fontFamily: 'inherit',
                      lineHeight: 1.4
                    }}
                  />
                  <div style={{ fontSize: '0.75rem', color: '#9ca3af', textAlign: 'right', marginTop: '0.25rem' }}>
                    {formData.description.length}/1000
                  </div>
                </div>

                {/* Form Buttons */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                  <button
                    type="button"
                    disabled={createSubmitting}
                    onClick={() => setCreateModalOpen(false)}
                    style={{
                      padding: '0.5rem 1rem',
                      borderRadius: '6px',
                      border: '1px solid #d1d5db',
                      backgroundColor: '#ffffff',
                      color: '#374151',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      cursor: createSubmitting ? 'not-allowed' : 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createSubmitting}
                    style={{
                      padding: '0.5rem 1.25rem',
                      borderRadius: '6px',
                      border: 'none',
                      backgroundColor: '#2563eb',
                      color: '#ffffff',
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      cursor: createSubmitting ? 'not-allowed' : 'pointer'
                    }}
                  >
                    {createSubmitting ? 'Creating Campaign...' : 'Create Campaign'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ARCHIVE CONFIRMATION MODAL */}
      {campaignToArchive && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="archive-campaign-title"
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
            if (e.target === e.currentTarget && !archiving) setCampaignToArchive(null);
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
                <h3 id="archive-campaign-title" style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#111827' }}>
                  Archive this campaign?
                </h3>
                <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.825rem', color: '#6b7280' }}>
                  {campaignToArchive.name}
                </p>
              </div>
            </div>

            {archiveError && (
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
                ⚠️ {archiveError}
              </div>
            )}

            <p style={{ fontSize: '0.875rem', color: '#4b5563', lineHeight: 1.5, marginBottom: '1.5rem' }}>
              This will remove the campaign from your active campaign list. Your CRM leads will not be deleted.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                disabled={archiving}
                onClick={() => setCampaignToArchive(null)}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  backgroundColor: '#ffffff',
                  color: '#374151',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: archiving ? 'not-allowed' : 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={archiving}
                onClick={handleConfirmArchive}
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
                {archiving ? 'Archiving...' : 'Archive Campaign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
