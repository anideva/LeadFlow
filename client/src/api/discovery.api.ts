export type EntityType = 'person' | 'business' | 'organization' | 'unspecified';

export interface SocialProfile {
  platform: string;
  url: string;
}

export interface ProspectLocation {
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
}

export interface DiscoveredProspect {
  id: string;
  externalId?: string;
  name: string;
  entityType: EntityType;
  category: string;
  description?: string;
  location: ProspectLocation;
  latitude?: number;
  longitude?: number;
  phone?: string;
  email?: string;
  website?: string;
  socialProfiles: SocialProfile[];
  source: string;
  sourceUrl?: string;
  confidenceScore?: number;
  discoveryMetadata: Record<string, any>;
  provenance?: Record<string, { value: any; source: string; extractedAt?: string }>;
  isEnriched?: boolean;
  enrichmentMetadata?: Record<string, any>;
}

export interface DiscoverySearchResult {
  query: string;
  total: number;
  prospects: DiscoveredProspect[];
  provider: string;
  simulated: boolean;
  nextCursor?: string;
  attribution?: string;
  metadata?: Record<string, any>;
  warning?: string;
  apifyQuotaExhausted?: boolean;
  fallbackUsed?: boolean;
}


export interface ProspectEnrichmentResult {
  businessName?: string;
  emails: string[];
  phones: string[];
  website?: string;
  contactPages: string[];
  socialProfiles: SocialProfile[];
  address?: string;
  overview?: string;
  provenance: Record<string, string>;
  metadata: {
    provider: string;
    targetUrl: string;
    pagesScanned: string[];
    durationMs: number;
    cached?: boolean;
  };
}

export interface DiscoveryUsage {
  count: number;
  limit: number;
  remaining: number;
  date: string;
}

export interface DiscoveryConfig {
  apifyEnabled: boolean;
  defaultProvider: string;
  usage?: DiscoveryUsage;
}

/**
 * Retrieves server discovery feature flags and provider configuration.
 */
export async function getDiscoveryConfig(): Promise<DiscoveryConfig> {
  const res = await fetch('/api/discovery/config', {
    headers: { 'Accept': 'application/json' },
    credentials: 'include'
  });
  const data = await res.json();
  if (!res.ok) {
    return { apifyEnabled: false, defaultProvider: 'osm_combined' };
  }
  return data.data;
}

/**
 * Searches for prospects using generic natural-language prospecting queries.
 */
export async function searchProspects(
  query: string,
  limit = 8,
  cursor?: string,
  provider?: string
): Promise<DiscoverySearchResult> {
  const res = await fetch('/api/discovery/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ query, limit, cursor, provider })
  });

  const data = await res.json();
  if (!res.ok) {
    const error: any = new Error(data.error || 'Failed to discover prospects');
    error.statusCode = res.status;
    error.code = data.code;
    throw error;
  }

  return data.data;
}



/**
 * Enriches a discovered prospect using its official public website.
 */
export async function enrichProspect(
  prospect: DiscoveredProspect,
  forceRefresh = false
): Promise<{ prospect: DiscoveredProspect; enrichment: ProspectEnrichmentResult }> {
  const res = await fetch('/api/discovery/enrich', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      prospect,
      options: { forceRefresh }
    })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to enrich prospect from website');
  }

  return {
    prospect: data.data,
    enrichment: data.enrichment
  };
}

/**
 * Converts a discovered prospect directly into a LeadFlow CRM lead.
 */
export async function convertProspectToLead(
  prospect: DiscoveredProspect
): Promise<{ success: boolean; data: any; message: string }> {
  const res = await fetch('/api/discovery/convert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ prospect })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to convert prospect to lead');
  }

  return data;
}
