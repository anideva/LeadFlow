import { IEnrichmentProvider } from './enrichment.provider';
import { WebsiteEnrichmentProvider } from './providers/website-enrichment.provider';

export class EnrichmentProviderFactory {
  /**
   * Instantiates the configured enrichment provider.
   * Defaults safely to 'website' scraper, guaranteeing zero API keys
   * and ₹0 personal cost.
   */
  public static createProvider(providerName?: string): IEnrichmentProvider {
    const selected = (providerName || process.env.ENRICHMENT_PROVIDER || 'website').trim().toLowerCase();

    switch (selected) {
      case 'website':
      case 'website_scraper':
      case 'web':
      default:
        return new WebsiteEnrichmentProvider();
    }
  }
}
