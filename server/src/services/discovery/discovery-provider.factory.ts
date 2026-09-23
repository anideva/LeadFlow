import { IDiscoveryProvider } from './discovery.provider';
import { DevelopmentDiscoveryProvider } from './providers/development.provider';
import { OpenStreetMapDiscoveryProvider } from './providers/openstreetmap.provider';
import { OpenStreetMapOverpassProvider } from './providers/overpass.provider';
import { CompositeOSMDiscoveryProvider } from './providers/composite-osm.provider';
import { ApifyDiscoveryProvider } from './providers/apify.provider';

export class DiscoveryProviderFactory {
  /**
   * Instantiates the discovery provider configured by environment variables.
   * Defaults safely to 'development' sandbox if DISCOVERY_PROVIDER is unset,
   * guaranteeing ₹0 personal spending and zero external credential requirements.
   */
  public static createProvider(providerName?: string): IDiscoveryProvider {
    const selected = (providerName || process.env.DISCOVERY_PROVIDER || 'development').trim().toLowerCase();

    switch (selected) {
      case 'apify':
      case 'apify_google_maps':
        return new ApifyDiscoveryProvider();

      case 'osm_combined':
      case 'combined':
      case 'openstreetmap_combined':
        return new CompositeOSMDiscoveryProvider();


      case 'overpass':
      case 'openstreetmap_overpass':
        return new OpenStreetMapOverpassProvider();

      case 'openstreetmap':
      case 'osm':
        return new OpenStreetMapDiscoveryProvider();

      case 'development':
      case 'development_sandbox':
      case 'sandbox':
      default:
        return new DevelopmentDiscoveryProvider();
    }
  }
}