import React, { useState } from 'react';
import {
  searchProspects,
  enrichProspect,
  convertProspectToLead,
  DiscoveredProspect,
  DiscoverySearchResult,
  SocialProfile
} from '../api/discovery.api';
import { exportProspectsToCsv } from '../utils/csv.util';

const EXAMPLE_QUERIES = [
  'Find flower shops in Jaipur',
  'Find dentists in Guwahati',
  'Find software companies in Bangalore',
  'Find book stores in Kolkata',
  'Find restaurants in Delhi'
];

type ConversionStatus = 'idle' | 'converting' | 'saved' | 'error';
type EnrichStatus = 'idle' | 'loading' | 'enriched' | 'error';

interface LeadDiscoveryProps {
  onNavigateToCRM?: () => void;
}

export const LeadDiscovery: React.FC<LeadDiscoveryProps> = ({ onNavigateToCRM }) => {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchResult, setSearchResult] = useState<DiscoverySearchResult | null>(null);

  // Track CRM conversion state per prospect ID: 'idle' | 'converting' | 'saved' | 'error'
  const [conversionState, setConversionState] = useState<Record<string, ConversionStatus>>({});
  const [conversionMsg, setConversionMsg] = useState<string | null>(null);

  // Track website enrichment state per prospect ID: 'idle' | 'loading' | 'enriched' | 'error'
  const [enrichingState, setEnrichingState] = useState<Record<string, EnrichStatus>>({});

  // Export CSV confirmation modal state
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleSearch = async (e?: React.FormEvent, searchQuery?: string) => {
    if (e) e.preventDefault();
    const effectiveQuery = (searchQuery !== undefined ? searchQuery : query).trim();

    if (!effectiveQuery) {
      setError('Please enter a prospecting search query.');
      return;
    }

    try {
      setSearching(true);
      setError(null);
      setConversionMsg(null);

      const result = await searchProspects(effectiveQuery);
      setSearchResult(result);
    } catch (err: any) {
      setError(err.message || 'Discovery search failed. Please try again.');
    } finally {
      setSearching(false);
    }
  };

  const handleLoadMore = async () => {
    if (!searchResult?.nextCursor || loadingMore) return;
    try {
      setLoadingMore(true);
      setError(null);
      const moreResult = await searchProspects(query, 8, searchResult.nextCursor);
      setSearchResult({
        ...moreResult,
        prospects: [...searchResult.prospects, ...moreResult.prospects],
        total: searchResult.prospects.length + moreResult.prospects.length
      });
    } catch (err: any) {
      setError(err.message || 'Failed to load more prospects.');
    } finally {
      setLoadingMore(false);
    }
  };

  const handleExampleClick = (example: string) => {
    setQuery(example);
    handleSearch(undefined, example);
  };

  const handleConvertToLead = async (prospect: DiscoveredProspect) => {
    try {
      setConversionState((prev) => ({ ...prev, [prospect.id]: 'converting' }));
      setConversionMsg(null);

      await convertProspectToLead(prospect);
      setConversionState((prev) => ({ ...prev, [prospect.id]: 'saved' }));
      setConversionMsg(`"${prospect.name}" was successfully converted and saved to Lead CRM!`);
    } catch (err: any) {
      setConversionState((prev) => ({ ...prev, [prospect.id]: 'error' }));
      setError(err.message || `Failed to convert "${prospect.name}" to a lead.`);
    }
  };

  const handleEnrich = async (prospect: DiscoveredProspect) => {
    try {
      setEnrichingState((prev) => ({ ...prev, [prospect.id]: 'loading' }));
      setError(null);

      const { prospect: enrichedProspect } = await enrichProspect(prospect);

      if (searchResult) {
        setSearchResult({
          ...searchResult,
          prospects: searchResult.prospects.map((p) =>
            p.id === prospect.id ? enrichedProspect : p
          )
        });
      }

      setEnrichingState((prev) => ({ ...prev, [prospect.id]: 'enriched' }));
      setConversionMsg(`Enriched "${prospect.name}" with public contact data from its website!`);
    } catch (err: any) {
      setEnrichingState((prev) => ({ ...prev, [prospect.id]: 'error' }));
      setError(err.message || `Website enrichment failed for "${prospect.name}".`);
    }
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '2rem 1.5rem', color: '#111827' }}>
      {/* Page Header */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, color: '#111827' }}>
            Lead Discovery & Research
          </h1>
          <span
            style={{
              fontSize: '0.75rem',
              fontWeight: 600,
              backgroundColor: '#e0e7ff',
              color: '#3730a3',
              padding: '0.2rem 0.6rem',
              borderRadius: '9999px'
            }}
          >
            Phase 9
          </span>
        </div>
        <p style={{ margin: 0, color: '#4b5563', fontSize: '0.95rem' }}>
          Discover prospective businesses, professionals, and organizations dynamically across any category and location.
        </p>
      </div>

      {/* Natural Language Search Hero Section */}
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '12px',
          border: '1px solid #e5e7eb',
          padding: '1.75rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          marginBottom: '2rem'
        }}
      >
        <label
          htmlFor="prospect-search-input"
          style={{ display: 'block', fontSize: '1rem', fontWeight: 600, color: '#1f2937', marginBottom: '0.75rem' }}
        >
          What kind of prospects are you looking for?
        </label>

        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <input
            id="prospect-search-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g., Find flower shops in Jaipur, or Software companies in Bangalore..."
            disabled={searching}
            style={{
              flex: '1 1 320px',
              padding: '0.75rem 1rem',
              fontSize: '1rem',
              borderRadius: '8px',
              border: '1px solid #d1d5db',
              outline: 'none',
              boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)'
            }}
          />
          <button
            type="submit"
            disabled={searching || !query.trim()}
            style={{
              padding: '0.75rem 1.75rem',
              backgroundColor: searching || !query.trim() ? '#9ca3af' : '#2563eb',
              color: '#ffffff',
              fontSize: '1rem',
              fontWeight: 600,
              border: 'none',
              borderRadius: '8px',
              cursor: searching || !query.trim() ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.15s ease'
            }}
          >
            {searching ? 'Discovering...' : 'Search Prospects'}
          </button>
        </form>

        {/* Dynamic Example Chips */}
        <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: 500 }}>Try examples:</span>
          {EXAMPLE_QUERIES.map((example, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleExampleClick(example)}
              style={{
                fontSize: '0.8rem',
                backgroundColor: '#f3f4f6',
                color: '#374151',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                padding: '0.25rem 0.6rem',
                cursor: 'pointer'
              }}
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      {/* Success Notification */}
      {conversionMsg && (
        <div
          style={{
            backgroundColor: '#ecfdf5',
            border: '1px solid #a7f3d0',
            color: '#065f46',
            borderRadius: '8px',
            padding: '0.75rem 1rem',
            fontSize: '0.9rem',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            flexWrap: 'wrap'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span>✓ {conversionMsg}</span>
            {onNavigateToCRM && conversionMsg.includes('saved to Lead CRM') && (
              <button
                type="button"
                onClick={onNavigateToCRM}
                style={{
                  backgroundColor: '#059669',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '0.25rem 0.65rem',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                }}
              >
                View in Leads CRM →
              </button>
            )}
          </div>
          <button
            onClick={() => setConversionMsg(null)}
            style={{ background: 'none', border: 'none', color: '#065f46', cursor: 'pointer', fontWeight: 600 }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div
          style={{
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#991b1b',
            borderRadius: '8px',
            padding: '0.75rem 1rem',
            fontSize: '0.9rem',
            marginBottom: '1.5rem'
          }}
        >
          {error}
        </div>
      )}

      {/* Loading Skeleton */}
      {searching && (
        <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
          <div
            style={{
              display: 'inline-block',
              width: '36px',
              height: '36px',
              border: '3px solid #e5e7eb',
              borderTopColor: '#2563eb',
              borderRadius: '50%',
              animation: 'spin 0.8s linear infinite'
            }}
          />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ marginTop: '1rem', color: '#4b5563', fontSize: '0.95rem' }}>
            Querying discovery provider and normalizing candidate prospects...
          </p>
        </div>
      )}

      {/* Search Results Area */}
      {!searching && searchResult && (
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1.25rem',
              flexWrap: 'wrap',
              gap: '0.5rem'
            }}
          >
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: '#111827' }}>
                Discovered Prospects ({searchResult.total})
              </h2>
              <p style={{ fontSize: '0.85rem', color: '#6b7280', margin: '0.25rem 0 0 0' }}>
                Query: &ldquo;{searchResult.query}&rdquo;
                {searchResult.metadata?.extractedCategory && ` • Category: ${searchResult.metadata.extractedCategory}`}
                {searchResult.metadata?.extractedLocation && ` • Location: ${searchResult.metadata.extractedLocation}`}
              </p>
              {searchResult.attribution && (
                <p style={{ fontSize: '0.75rem', color: '#4b5563', margin: '0.35rem 0 0 0' }}>
                  ℹ️ {searchResult.attribution}
                </p>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setExportModalOpen(true)}
                disabled={searchResult.prospects.length === 0}
                aria-label="Export discovery prospects to CSV"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  backgroundColor: '#ffffff',
                  color: '#374151',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: searchResult.prospects.length === 0 ? 'not-allowed' : 'pointer',
                  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
                }}
              >
                <span>📥</span>
                <span>Export Results (CSV)</span>
              </button>
              <span
                style={{
                  fontSize: '0.75rem',
                  backgroundColor: searchResult.simulated ? '#fef3c7' : '#dcfce7',
                  color: searchResult.simulated ? '#92400e' : '#166534',
                  border: searchResult.simulated ? '1px solid #fde68a' : '1px solid #bbf7d0',
                  padding: '0.25rem 0.65rem',
                  borderRadius: '6px',
                  fontWeight: 600
                }}
              >
                {searchResult.simulated
                  ? `Provider: ${searchResult.provider} (Sandbox)`
                  : `Real Provider: ${searchResult.provider.toUpperCase()}`}
              </span>
            </div>
          </div>

          {searchResult.prospects.length === 0 ? (
            <div
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                padding: '3rem 1rem',
                textAlign: 'center',
                color: '#6b7280'
              }}
            >
              <p style={{ margin: 0, fontSize: '1rem' }}>No prospects found for this query.</p>
              <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                Try adjusting your search keywords or location criteria.
              </p>
            </div>
          ) : (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
                {searchResult.prospects.map((prospect: DiscoveredProspect) => {
                  const status = conversionState[prospect.id] || 'idle';
                  const enrichStatus = enrichingState[prospect.id] || 'idle';

                  return (
                    <div
                      key={prospect.id}
                      style={{
                        backgroundColor: '#ffffff',
                        border: '1px solid #e5e7eb',
                        borderRadius: '10px',
                        padding: '1.25rem',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                        transition: 'transform 0.15s ease, box-shadow 0.15s ease'
                      }}
                    >
                      <div>
                        {/* Top Category & Type Badge */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            <span
                              style={{
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                textTransform: 'uppercase',
                                backgroundColor: prospect.entityType === 'person' ? '#eff6ff' : '#f0fdf4',
                                color: prospect.entityType === 'person' ? '#1d4ed8' : '#15803d',
                                padding: '0.15rem 0.45rem',
                                borderRadius: '4px'
                              }}
                            >
                              {prospect.entityType}
                            </span>
                            {prospect.source === 'development_sandbox' ? (
                              <span
                                style={{
                                  fontSize: '0.68rem',
                                  fontWeight: 700,
                                  textTransform: 'uppercase',
                                  backgroundColor: '#fef3c7',
                                  color: '#92400e',
                                  border: '1px solid #fde68a',
                                  padding: '0.15rem 0.45rem',
                                  borderRadius: '4px',
                                  letterSpacing: '0.025em'
                                }}
                              >
                                Sandbox Data
                              </span>
                            ) : (
                              <span
                                style={{
                                  fontSize: '0.68rem',
                                  fontWeight: 700,
                                  textTransform: 'uppercase',
                                  backgroundColor: '#ecfdf5',
                                  color: '#065f46',
                                  border: '1px solid #a7f3d0',
                                  padding: '0.15rem 0.45rem',
                                  borderRadius: '4px',
                                  letterSpacing: '0.025em'
                                }}
                              >
                                Real Listing
                              </span>
                            )}
                            {prospect.isEnriched && (
                              <span
                                style={{
                                  fontSize: '0.68rem',
                                  fontWeight: 700,
                                  textTransform: 'uppercase',
                                  backgroundColor: '#f3e8ff',
                                  color: '#6b21a8',
                                  border: '1px solid #d8b4fe',
                                  padding: '0.15rem 0.45rem',
                                  borderRadius: '4px',
                                  letterSpacing: '0.025em'
                                }}
                              >
                                ✨ Enriched
                              </span>
                            )}
                          </div>
                          <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                            {prospect.category}
                          </span>
                        </div>

                        {/* Prospect Name */}
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: '#111827' }}>
                          {prospect.name}
                        </h3>

                        {/* Description */}
                        {prospect.description && (
                          <p style={{ fontSize: '0.85rem', color: '#4b5563', margin: '0 0 0.75rem 0', lineHeight: 1.4 }}>
                            {prospect.description}
                          </p>
                        )}

                        {/* Location */}
                        <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <span>📍</span>
                          <span>
                            {[prospect.location?.address, prospect.location?.city, prospect.location?.state, prospect.location?.country]
                              .filter(Boolean)
                              .join(', ') || <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>Location details not listed</span>}
                          </span>
                        </div>

                        {/* Contact Points */}
                        <div style={{ fontSize: '0.8rem', color: '#4b5563', borderTop: '1px solid #f3f4f6', paddingTop: '0.5rem', marginTop: '0.5rem' }}>
                          <div style={{ marginBottom: '0.25rem' }}>
                            <strong>Phone:</strong>{' '}
                            {prospect.phone ? (
                              <span>
                                {prospect.phone}
                                {prospect.provenance?.phone?.source === 'website' && (
                                  <span style={{ fontSize: '0.65rem', backgroundColor: '#f3e8ff', color: '#6b21a8', padding: '0.1rem 0.35rem', borderRadius: '3px', marginLeft: '0.35rem', fontWeight: 600 }}>
                                    via Website
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>Not available</span>
                            )}
                          </div>
                          <div style={{ marginBottom: '0.25rem' }}>
                            <strong>Email:</strong>{' '}
                            {prospect.email ? (
                              <span>
                                {prospect.email}
                                {prospect.provenance?.email?.source === 'website' && (
                                  <span style={{ fontSize: '0.65rem', backgroundColor: '#f3e8ff', color: '#6b21a8', padding: '0.1rem 0.35rem', borderRadius: '3px', marginLeft: '0.35rem', fontWeight: 600 }}>
                                    via Website
                                  </span>
                                )}
                              </span>
                            ) : (
                              <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>Not available</span>
                            )}
                          </div>
                          <div style={{ marginBottom: '0.25rem' }}>
                            <strong>Web:</strong>{' '}
                            {prospect.website ? (
                              <a
                                href={prospect.website}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: '#2563eb', textDecoration: 'none' }}
                              >
                                {prospect.website.replace(/^https?:\/\//, '')}
                              </a>
                            ) : (
                              <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>Not available</span>
                            )}
                          </div>

                          {/* Social Profiles extracted via website */}
                          {prospect.socialProfiles && prospect.socialProfiles.length > 0 && (
                            <div style={{ marginTop: '0.35rem', display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
                              <strong style={{ fontSize: '0.75rem', color: '#4b5563' }}>Social:</strong>
                              {prospect.socialProfiles.map((sp: SocialProfile, idx: number) => (
                                <a
                                  key={idx}
                                  href={sp.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{
                                    fontSize: '0.72rem',
                                    color: '#4338ca',
                                    backgroundColor: '#eef2ff',
                                    padding: '0.1rem 0.4rem',
                                    borderRadius: '4px',
                                    textDecoration: 'none',
                                    fontWeight: 500
                                  }}
                                >
                                  {sp.platform} ↗
                                </a>
                              ))}
                            </div>
                          )}

                          {prospect.sourceUrl && (
                            <div style={{ marginTop: '0.25rem', fontSize: '0.75rem' }}>
                              <a
                                href={prospect.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: '#4b5563', textDecoration: 'underline' }}
                              >
                                View on {prospect.source === 'openstreetmap' ? 'OpenStreetMap ↗' : 'Directory ↗'}
                              </a>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Card Actions */}
                      <div style={{ marginTop: '1.25rem', paddingTop: '0.75rem', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
                        <div style={{ fontSize: '0.7rem', color: '#9ca3af', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                          <span>
                            Source: {prospect.source === 'development_sandbox' ? 'Development Sandbox (Simulated)' : prospect.source}
                          </span>
                          {prospect.externalId && (
                            <span style={{ fontSize: '0.65rem' }}>ID: {prospect.externalId}</span>
                          )}
                        </div>

                        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                          {/* Website Enrichment Button */}
                          {prospect.website && (
                            <button
                              type="button"
                              onClick={() => handleEnrich(prospect)}
                              disabled={enrichStatus === 'loading' || prospect.isEnriched}
                              style={{
                                padding: '0.4rem 0.75rem',
                                borderRadius: '6px',
                                fontSize: '0.78rem',
                                fontWeight: 600,
                                border: prospect.isEnriched ? '1px solid #d8b4fe' : '1px solid #c084fc',
                                backgroundColor: prospect.isEnriched ? '#faf5ff' : '#ffffff',
                                color: prospect.isEnriched ? '#6b21a8' : '#7e22ce',
                                cursor: enrichStatus === 'loading' || prospect.isEnriched ? 'default' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.25rem'
                              }}
                            >
                              {enrichStatus === 'loading' && 'Enriching...'}
                              {prospect.isEnriched && '✨ Enriched'}
                              {!prospect.isEnriched && enrichStatus !== 'loading' && '✨ Enrich'}
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleConvertToLead(prospect)}
                            disabled={status === 'converting' || status === 'saved'}
                            style={{
                              padding: '0.4rem 0.85rem',
                              borderRadius: '6px',
                              fontSize: '0.8rem',
                              fontWeight: 600,
                              border: status === 'saved' ? '1px solid #86efac' : 'none',
                              backgroundColor:
                                status === 'saved'
                                  ? '#f0fdf4'
                                  : status === 'converting'
                                  ? '#9ca3af'
                                  : '#059669',
                              color: status === 'saved' ? '#15803d' : '#ffffff',
                              cursor: status === 'saved' || status === 'converting' ? 'default' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.35rem'
                            }}
                          >
                            {status === 'converting' && 'Saving...'}
                            {status === 'saved' && '✓ Saved in CRM'}
                            {status === 'idle' && '+ Save as Lead'}
                            {status === 'error' && 'Retry Save'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pagination Load More Button */}
              {searchResult.nextCursor && (
                <div style={{ textAlign: 'center', marginTop: '2rem' }}>
                  <button
                    type="button"
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    style={{
                      padding: '0.65rem 1.75rem',
                      backgroundColor: '#ffffff',
                      border: '1px solid #d1d5db',
                      borderRadius: '8px',
                      color: '#1f2937',
                      fontSize: '0.9rem',
                      fontWeight: 600,
                      cursor: loadingMore ? 'not-allowed' : 'pointer',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {loadingMore ? 'Loading more prospects...' : 'Load More Prospects ↓'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Initial Empty State Guide */}
      {!searching && !searchResult && (
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #e5e7eb',
            padding: '3rem 2rem',
            textAlign: 'center'
          }}
        >
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🔍</div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.5rem 0', color: '#111827' }}>
            Omnichannel Prospect Discovery
          </h2>
          <p style={{ color: '#4b5563', fontSize: '0.95rem', maxWidth: '600px', margin: '0 auto 1.5rem auto', lineHeight: 1.5 }}>
            Type any natural-language prospecting request above. LeadFlow automatically extracts the target business category
            and geographic location, retrieves normalized prospect records, and allows direct conversion into your Lead CRM.
          </p>
          <div style={{ display: 'inline-flex', gap: '1.5rem', color: '#6b7280', fontSize: '0.85rem' }}>
            <span>✓ Dynamic categories & locations</span>
            <span>✓ Zero industry lock-in</span>
            <span>✓ One-click CRM lead conversion</span>
          </div>
        </div>
      )}

      {/* DISCOVERY CSV EXPORT CONFIRMATION MODAL */}
      {exportModalOpen && searchResult && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="discovery-export-modal-title"
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
            if (e.target === e.currentTarget && !exporting) setExportModalOpen(false);
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              maxWidth: '480px',
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
                  backgroundColor: '#eff6ff',
                  color: '#1d4ed8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.25rem',
                  flexShrink: 0
                }}
              >
                📥
              </div>
              <div>
                <h3 id="discovery-export-modal-title" style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: '#111827' }}>
                  Export Discovered Prospects as CSV?
                </h3>
                <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.825rem', color: '#6b7280' }}>
                  Query: &ldquo;{searchResult.query}&rdquo;
                </p>
              </div>
            </div>

            <p style={{ fontSize: '0.875rem', color: '#4b5563', lineHeight: 1.5, marginBottom: '1rem' }}>
              You are about to export <strong>{searchResult.prospects.length}</strong> prospect{searchResult.prospects.length === 1 ? '' : 's'} currently displayed in your search results.
            </p>

            <div
              style={{
                backgroundColor: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '0.75rem 1rem',
                fontSize: '0.825rem',
                color: '#334155',
                marginBottom: '1.5rem',
                lineHeight: 1.4
              }}
            >
              📄 <strong>File download note:</strong> A CSV file formatted according to RFC 4180 containing candidate business names, categories, contact information, websites, and address data will be downloaded to your computer.
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                disabled={exporting}
                onClick={() => setExportModalOpen(false)}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '6px',
                  border: '1px solid #d1d5db',
                  backgroundColor: '#ffffff',
                  color: '#374151',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: exporting ? 'not-allowed' : 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={exporting}
                onClick={() => {
                  try {
                    setExporting(true);
                    const { filename, count } = exportProspectsToCsv(searchResult.prospects, searchResult.query);
                    setConversionMsg(`Exported ${count} prospect(s) to "${filename}".`);
                    setTimeout(() => setConversionMsg(null), 4000);
                  } catch (err: any) {
                    setError(err.message || 'Failed to export prospects to CSV.');
                  } finally {
                    setExporting(false);
                    setExportModalOpen(false);
                  }
                }}
                style={{
                  padding: '0.5rem 1.1rem',
                  borderRadius: '6px',
                  border: 'none',
                  backgroundColor: '#2563eb',
                  color: '#ffffff',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: exporting ? 'not-allowed' : 'pointer'
                }}
              >
                {exporting ? 'Exporting...' : `Confirm Export (${searchResult.prospects.length})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LeadDiscovery;
