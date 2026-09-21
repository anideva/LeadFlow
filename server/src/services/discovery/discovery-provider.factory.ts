import { IDiscoveryProvider } from './discovery.provider';
import { DevelopmentDiscoveryProvider } from './providers/development.provider';
import { OpenStreetMapDiscoveryProvider } from './providers/openstreetmap.provider';

export class DiscoveryProviderFactory {
  /**
   * Instantiates the discovery provider configured by environment variables.
   * Defaults safely to 'development' sandbox if DISCOVERY_PROVIDER is unset,
   * guaranteeing ₹0 personal spending and zero external credential requirements.
   */
  public static createProvider(providerName?: string): IDiscoveryProvider {
    const selected = (providerName || process.env.DISCOVERY_PROVIDER || 'development').trim().toLowerCase();

    switch (selected) {
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