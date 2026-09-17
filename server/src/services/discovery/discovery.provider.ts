import { DiscoverySearchRequest, DiscoverySearchResult } from '../../types/discovery.types';

/**
 * Common contract for all lead discovery data providers.
 * Allows seamless integration of real providers (Google Places, OpenStreetMap,
 * Apollo, SerpApi, etc.) or mock/development providers without changing application logic.
 */
export interface IDiscoveryProvider {
  /**
   * Unique identifier name for this provider instance (e.g. 'development_sandbox', 'osm_nominatim')
   */
  readonly name: string;

  /**
   * Discovers normalized prospects based on generic natural-language or structured search parameters.
   */
  search(request: DiscoverySearchRequest): Promise<DiscoverySearchResult>;
}
