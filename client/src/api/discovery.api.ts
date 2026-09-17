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
  name: string;
  entityType: EntityType;
  category: string;
  description?: string;
  location: ProspectLocation;
  phone?: string;
  email?: string;
  website?: string;
  socialProfiles: SocialProfile[];
  source: string;
  sourceUrl?: string;
  confidenceScore?: number;
  discoveryMetadata: Record<string, any>;
}

export interface DiscoverySearchResult {
  query: string;
  total: number;
  prospects: DiscoveredProspect[];
  provider: string;
  simulated: boolean;
  metadata?: Record<string, any>;
}

/**
 * Searches for prospects using generic natural-language prospecting queries.
 */
export async function searchProspects(
  query: string,
  limit = 8
): Promise<DiscoverySearchResult> {
  const res = await fetch('/api/discovery/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ query, limit })
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to discover prospects');
  }

  return data.data;
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
