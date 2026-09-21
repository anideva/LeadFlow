import { ProspectEnrichmentResult } from '../../types/discovery.types';

export interface EnrichmentOptions {
  forceRefresh?: boolean;
  maxHops?: number;
  timeoutMs?: number;
}

/**
 * Common abstraction for prospect enrichment providers.
 * Supports public website scraping, future third-party APIs (Clearbit, Hunter, Apollo),
 * or local offline sandboxes without breaking application routes or UI.
 */
export interface IEnrichmentProvider {
  /**
   * Unique name of the enrichment provider (e.g. 'website_scraper', 'development_sandbox').
   */
  readonly name: string;

  /**
   * Enriches a prospect using its website or target identifier.
   */
  enrich(targetUrl: string, options?: EnrichmentOptions): Promise<ProspectEnrichmentResult>;
}
