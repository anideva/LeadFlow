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

export interface DiscoverySearchRequest {
  query: string;
  limit?: number;
  locationHint?: string;
}

export interface DiscoverySearchResult {
  query: string;
  total: number;
  prospects: DiscoveredProspect[];
  provider: string;
  simulated: boolean;
  metadata?: Record<string, any>;
}

export interface ConvertProspectRequest {
  prospect: DiscoveredProspect;
}
