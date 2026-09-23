import { IDiscoveryProvider } from '../discovery.provider';
import {
  DiscoverySearchRequest,
  DiscoverySearchResult,
  DiscoveredProspect
} from '../../../types/discovery.types';
import { OpenStreetMapDiscoveryProvider } from './openstreetmap.provider';
import { OpenStreetMapOverpassProvider } from './overpass.provider';

export class CompositeOSMDiscoveryProvider implements IDiscoveryProvider {
  public readonly name = 'osm_combined';

  private readonly nominatimProvider: OpenStreetMapDiscoveryProvider;
  private readonly overpassProvider: OpenStreetMapOverpassProvider;

  constructor(
    nominatimProvider = new OpenStreetMapDiscoveryProvider(),
    overpassProvider = new OpenStreetMapOverpassProvider()
  ) {
    this.nominatimProvider = nominatimProvider;
    this.overpassProvider = overpassProvider;
  }

  /**
   * Calculates Haversine distance in meters between two lat/lon points.
   */
  private calculateDistanceMeters(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371e3; // Earth radius in meters
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Normalizes a business name for comparison (strips punctuation and excess whitespace).
   */
  private normalizeNameForComparison(name: string): string {
    return name
      .toLowerCase()
      .replace(/['’".,/\\()\-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Merges two prospects representing the exact same entity, prioritizing non-empty values.
   */
  private mergeProspects(
    primary: DiscoveredProspect,
    secondary: DiscoveredProspect
  ): DiscoveredProspect {
    return {
      ...primary,
      // If primary lacks address fields but secondary has them
      location: {
        address: primary.location?.address || secondary.location?.address,
        city: primary.location?.city || secondary.location?.city,
        state: primary.location?.state || secondary.location?.state,
        country: primary.location?.country || secondary.location?.country,
        postalCode: primary.location?.postalCode || secondary.location?.postalCode
      },
      latitude: primary.latitude ?? secondary.latitude,
      longitude: primary.longitude ?? secondary.longitude,
      phone: primary.phone || secondary.phone,
      email: primary.email || secondary.email,
      website: primary.website || secondary.website,
      socialProfiles:
        primary.socialProfiles && primary.socialProfiles.length > 0
          ? primary.socialProfiles
          : secondary.socialProfiles || [],
      discoveryMetadata: {
        ...secondary.discoveryMetadata,
        ...primary.discoveryMetadata,
        combinedEngines: ['Nominatim', 'Overpass API']
      }
    };
  }

  /**
   * Searches and aggregates prospects across both OpenStreetMap Nominatim and Overpass API.
   */
  public async search(request: DiscoverySearchRequest): Promise<DiscoverySearchResult> {
    const rawQuery = request.query.trim();
    const limit = Math.min(Math.max(request.limit || 10, 1), 50);

    let nominatimProspects: DiscoveredProspect[] = [];
    let overpassProspects: DiscoveredProspect[] = [];

    // 1. Run Nominatim query
    try {
      const nomResult = await this.nominatimProvider.search({
        ...request,
        limit: Math.max(limit, 15)
      });
      nominatimProspects = nomResult.prospects || [];
    } catch (err: any) {
      console.warn('[Composite Provider] Nominatim query failed:', err.message);
    }

    // 2. Check if Overpass can resolve query category & location
    const canUseOverpass =
      typeof this.overpassProvider.resolveCategoryTags === 'function'
        ? Boolean(this.overpassProvider.resolveCategoryTags(rawQuery))
        : true;


    if (canUseOverpass) {
      try {
        const overpassResult = await this.overpassProvider.search({
          ...request,
          limit: Math.max(limit, 25)
        });
        overpassProspects = overpassResult.prospects || [];
      } catch (err: any) {
        console.warn('[Composite Provider] Overpass query failed:', err.message);
      }
    }

    // 3. Deterministic Deduplication by OSM ID
    const mergedMap = new Map<string, DiscoveredProspect>();
    let duplicatesRemoved = 0;

    // Seed with Nominatim prospects (which typically have clean formatted addresses)
    for (const p of nominatimProspects) {
      const key = p.externalId || p.id;
      mergedMap.set(key, p);
    }

    // Merge Overpass prospects
    for (const p of overpassProspects) {
      const key = p.externalId || p.id;
      if (mergedMap.has(key)) {
        duplicatesRemoved++;
        const existing = mergedMap.get(key)!;
        mergedMap.set(key, this.mergeProspects(existing, p));
      } else {
        mergedMap.set(key, p);
      }
    }

    let candidates = Array.from(mergedMap.values());

    // 4. Secondary Fuzzy Deduplication: Same normalized name + distance < 50 meters
    const deduplicatedList: DiscoveredProspect[] = [];
    for (const candidate of candidates) {
      const candNormName = this.normalizeNameForComparison(candidate.name);
      let isDuplicate = false;

      for (let i = 0; i < deduplicatedList.length; i++) {
        const existing = deduplicatedList[i];
        const existNormName = this.normalizeNameForComparison(existing.name);

        if (candNormName === existNormName && candNormName.length >= 3) {
          // If both have coordinates, verify spatial proximity (< 50 meters)
          if (
            candidate.latitude !== undefined &&
            candidate.longitude !== undefined &&
            existing.latitude !== undefined &&
            existing.longitude !== undefined
          ) {
            const dist = this.calculateDistanceMeters(
              candidate.latitude,
              candidate.longitude,
              existing.latitude,
              existing.longitude
            );
            if (dist <= 50) {
              // Merge into existing
              deduplicatedList[i] = this.mergeProspects(existing, candidate);
              duplicatesRemoved++;
              isDuplicate = true;
              break;
            }
          }
        }
      }

      if (!isDuplicate) {
        deduplicatedList.push(candidate);
      }
    }

    // 5. Clamp to requested limit
    const finalProspects = deduplicatedList.slice(0, limit);

    return {
      query: rawQuery,
      total: finalProspects.length,
      prospects: finalProspects,
      provider: this.name,
      simulated: false,
      attribution: 'Data © OpenStreetMap contributors, ODbL 1.0. https://www.openstreetmap.org/copyright',
      metadata: {
        source: 'Composite OpenStreetMap (Nominatim + Overpass)',
        nominatimRawCount: nominatimProspects.length,
        overpassRawCount: overpassProspects.length,
        duplicatesRemoved,
        totalUniqueFound: deduplicatedList.length,
        limit
      }
    };
  }
}
