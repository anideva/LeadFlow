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

export interface FieldProvenance {
  value: any;
  source: 'openstreetmap' | 'website' | 'manual' | string;
  sourceUrl?: string;
  extractedAt?: string;
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

export interface DiscoverySearchRequest {
  query: string;
  limit?: number;
  locationHint?: string;
  cursor?: string;
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
}

export interface ConvertProspectRequest {
  prospect: DiscoveredProspect;
}

export interface EnrichmentMetadata {
  provider: string;
  targetUrl: string;
  pagesScanned: string[];
  durationMs: number;
  cached?: boolean;
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
  metadata: EnrichmentMetadata;
}

export interface EnrichProspectRequest {
  prospect: DiscoveredProspect;
  options?: {
    forceRefresh?: boolean;
  };
}

export interface EnrichProspectResponse {
  prospect: DiscoveredProspect;
  enrichment: ProspectEnrichmentResult;
}
