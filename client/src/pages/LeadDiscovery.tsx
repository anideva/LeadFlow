import React, { useState } from 'react';
import {
  searchProspects,
  convertProspectToLead,
  DiscoveredProspect,
  DiscoverySearchResult
} from '../api/discovery.api';

const EXAMPLE_QUERIES = [
  'Find flower shops in Jaipur',
  'Find dentists in Guwahati',
  'Find software companies in Bangalore',
  'Find book stores in Kolkata',
  'Find restaurants in Delhi'
];

type ConversionStatus = 'idle' | 'converting' | 'saved' | 'error';

export const LeadDiscovery: React.FC = () => {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchResult, setSearchResult] = useState<DiscoverySearchResult | null>(null);

  // Track CRM conversion state per prospect ID: 'idle' | 'converting' | 'saved' | 'error'
  const [conversionState, setConversionState] = useState<Record<string, ConversionStatus>>({});
  const [conversionMsg, setConversionMsg] = useState<string | null>(null);

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
            justifyContent: 'space-between'
          }}
        >
          <span>✓ {conversionMsg}</span>
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
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span
                style={{
                  fontSize: '0.75rem',
                  backgroundColor: '#fef3c7',
                  color: '#92400e',
                  padding: '0.2rem 0.5rem',
                  borderRadius: '4px',
                  fontWeight: 600
                }}
              >
                Provider: {searchResult.provider} {searchResult.simulated && '(Sandbox)'}
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
              {searchResult.prospects.map((prospect) => {
                const status = conversionState[prospect.id] || 'idle';

                return (
                  <div
                    key={prospect.id}
                    style={{
                      backgroundColor: '#ffffff',
                      borderRadius: '10px',
                      border: '1px solid #e5e7eb',
                      padding: '1.25rem',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                      transition: 'border-color 0.15s ease'
                    }}
                  >
                    <div>
                      {/* Top Badges */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
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
                          {prospect.source === 'development_sandbox' && (
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
                      {(prospect.location?.city || prospect.location?.address) && (
                        <div style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <span>📍</span>
                          <span>
                            {[prospect.location.address, prospect.location.city, prospect.location.country]
                              .filter(Boolean)
                              .join(', ')}
                          </span>
                        </div>
                      )}

                      {/* Contact Points */}
                      <div style={{ fontSize: '0.8rem', color: '#4b5563', borderTop: '1px solid #f3f4f6', paddingTop: '0.5rem', marginTop: '0.5rem' }}>
                        {prospect.phone && (
                          <div style={{ marginBottom: '0.25rem' }}>
                            <strong>Phone:</strong> {prospect.phone}
                          </div>
                        )}
                        {prospect.email && (
                          <div style={{ marginBottom: '0.25rem' }}>
                            <strong>Email:</strong> {prospect.email}
                          </div>
                        )}
                        {prospect.website && (
                          <div style={{ marginBottom: '0.25rem' }}>
                            <strong>Web:</strong>{' '}
                            <a
                              href={prospect.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: '#2563eb', textDecoration: 'none' }}
                            >
                              {prospect.website.replace(/^https?:\/\//, '')}
                            </a>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Card Actions */}
                    <div style={{ marginTop: '1.25rem', paddingTop: '0.75rem', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>
                        Source: {prospect.source === 'development_sandbox' ? 'Development Sandbox (Simulated)' : prospect.source}
                      </span>

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
                );
              })}
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
    </div>
  );
};

export default LeadDiscovery;
