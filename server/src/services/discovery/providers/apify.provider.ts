import { IDiscoveryProvider } from '../discovery.provider';
import {
  DiscoverySearchRequest,
  DiscoverySearchResult,
  DiscoveredProspect,
  EntityType,
  SocialProfile
} from '../../../types/discovery.types';
import { AppError } from '../../../utils/error.util';

export class ApifyDiscoveryProvider implements IDiscoveryProvider {
  public readonly name = 'apify';

  // In-memory session run counter to protect free-tier allowance
  private static sessionRunCount = 0;

  private readonly token: string;
  private readonly actorId: string;
  private readonly enabled: boolean;
  private readonly maxResults: number;
  private readonly maxRunsPerSession: number;
  private readonly apiBaseUrl: string;

  constructor(
    token = process.env.APIFY_API_TOKEN || '',
    actorId = process.env.APIFY_ACTOR_ID || '',
    enabled = process.env.APIFY_ENABLED === 'true',
    maxResults = parseInt(process.env.APIFY_MAX_RESULTS || '20', 10),
    maxRunsPerSession = parseInt(process.env.APIFY_MAX_RUNS_PER_SESSION || '5', 10),
    apiBaseUrl = 'https://api.apify.com'
  ) {
    this.token = token.trim();
    this.actorId = actorId.trim();
    this.enabled = enabled;
    this.maxResults = isNaN(maxResults) || maxResults < 1 ? 20 : maxResults;
    this.maxRunsPerSession = isNaN(maxRunsPerSession) || maxRunsPerSession < 1 ? 5 : maxRunsPerSession;
    this.apiBaseUrl = apiBaseUrl.replace(/\/$/, '');
  }

  /**
   * Resets the local session run counter (primarily for testing and session resets).
   */
  public static resetSessionRunCount(): void {
    ApifyDiscoveryProvider.sessionRunCount = 0;
  }

  /**
   * Returns current session run count.
   */
  public static getSessionRunCount(): number {
    return ApifyDiscoveryProvider.sessionRunCount;
  }

  /**
   * Helper to normalize business name for comparison.
   */
  private normalizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/['’".,/\\()\-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Discovers prospects by executing the configured Apify Google Maps Actor.
   */
  public async search(request: DiscoverySearchRequest): Promise<DiscoverySearchResult> {
    const rawQuery = request.query.trim();

    // 1. Cost & safety check: Is provider enabled?
    if (!this.enabled) {
      throw new AppError(403, 'Apify discovery provider is disabled by configuration (APIFY_ENABLED=false).');
    }

    // 2. Secret check: Is token present?
    if (!this.token) {
      throw new AppError(500, 'Apify API token is not configured on the server (APIFY_API_TOKEN is empty).');
    }

    // 3. Actor configuration check
    if (!this.actorId) {
      throw new AppError(500, 'Apify Actor ID is not configured on the server (APIFY_ACTOR_ID is empty).');
    }

    // 4. Session run limit check (strictly protects free-tier quota)
    if (ApifyDiscoveryProvider.sessionRunCount >= this.maxRunsPerSession) {
      throw new AppError(
        429,
        'Apify discovery experiment limit reached. No further Apify searches will be started.'
      );
    }

    // 5. Calculate safe maximum result limit
    const requestedLimit = request.limit || 20;
    const effectiveLimit = Math.min(Math.max(requestedLimit, 1), this.maxResults);

    // Increment session run count before calling external API
    ApifyDiscoveryProvider.sessionRunCount++;

    // 6. Build mapped Actor input schema
    const actorInput = {
      searchStringsArray: [rawQuery],
      queries: [rawQuery],
      locationQuery: request.locationHint || '',
      maxCrawledPlacesPerSearch: effectiveLimit,
      language: 'en',
      maxImages: 0,
      skipClosedPlaces: false
    };

    // 7. Execute Actor run via official Apify API with 60-second AbortController timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    let rawElements: any[] = [];
    try {
      const formattedActorId = this.actorId.includes('/') ? this.actorId.replace('/', '~') : this.actorId;
      const runUrl = `${this.apiBaseUrl}/v2/acts/${encodeURIComponent(formattedActorId)}/runs?waitForFinish=60`;
      const runResponse = await fetch(runUrl, {

        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(actorInput),
        signal: controller.signal
      });

      // Handle specific HTTP error statuses without auto-retrying
      if (runResponse.status === 401) {
        throw new AppError(401, 'Apify authentication failed. Please check your APIFY_API_TOKEN.');
      }
      if (runResponse.status === 402) {
        throw new AppError(402, 'Apify usage limit or billing quota exceeded. Experiment halted.');
      }
      if (runResponse.status === 403) {
        throw new AppError(403, 'Apify access forbidden for the configured Actor or token.');
      }
      if (runResponse.status === 404) {
        throw new AppError(404, `Apify Actor "${this.actorId}" was not found. Please verify APIFY_ACTOR_ID.`);
      }
      if (runResponse.status === 429) {
        throw new AppError(429, 'Apify rate limit exceeded. Please wait before searching again.');
      }
      if (!runResponse.ok) {
        const errorText = await runResponse.text().catch(() => '');
        throw new AppError(
          runResponse.status,
          `Apify Actor run initiation failed (HTTP ${runResponse.status}): ${errorText.substring(0, 150)}`
        );
      }

      const runJson: any = await runResponse.json();
      const runData = runJson.data;
      if (!runData) {
        throw new AppError(502, 'Apify API returned an unexpected response structure without run data.');
      }

      const status = runData.status;
      if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
        throw new AppError(502, `Apify Actor run finished with unsuccessful status: ${status}.`);
      }

      const datasetId = runData.defaultDatasetId;
      if (!datasetId) {
        // Run completed but no dataset ID produced
        return {
          query: rawQuery,
          total: 0,
          prospects: [],
          provider: this.name,
          simulated: false,
          attribution: 'Google Maps data via Apify'
        };
      }

      // 8. Fetch dataset items
      const itemsUrl = `${this.apiBaseUrl}/v2/datasets/${encodeURIComponent(datasetId)}/items?limit=${effectiveLimit}&clean=true`;
      const itemsResponse = await fetch(itemsUrl, {
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Accept': 'application/json'
        },
        signal: controller.signal
      });

      if (!itemsResponse.ok) {
        throw new AppError(itemsResponse.status, 'Failed to retrieve dataset items from Apify.');
      }

      const parsedItems = await itemsResponse.json();
      if (Array.isArray(parsedItems)) {
        rawElements = parsedItems;
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new AppError(504, 'Apify Actor run timed out after 60 seconds.');
      }
      if (err instanceof AppError) {
        throw err;
      }
      throw new AppError(502, `Apify search failed: ${err.message || 'Unknown network error'}`);
    } finally {
      clearTimeout(timeoutId);
    }

    // 9. Normalize into DiscoveredProspect and Deduplicate
    const normalizedProspects: DiscoveredProspect[] = [];
    const seenExternalIds = new Set<string>();
    let duplicatesRemoved = 0;

    for (const item of rawElements) {
      const prospect = this.normalizeItem(item, rawQuery);
      if (!prospect) continue;

      // Primary deduplication by stable external ID / placeId
      const externalId = prospect.externalId || prospect.id;
      if (seenExternalIds.has(externalId)) {
        duplicatesRemoved++;
        continue;
      }

      // Secondary deduplication by normalized name + address
      const candNormName = this.normalizeName(prospect.name);
      const candAddr = (prospect.location?.address || '').toLowerCase().trim();
      let isDuplicate = false;

      for (const existing of normalizedProspects) {
        const existNormName = this.normalizeName(existing.name);
        const existAddr = (existing.location?.address || '').toLowerCase().trim();

        if (candNormName === existNormName && candNormName.length >= 3) {
          if (candAddr && existAddr && (candAddr === existAddr || candAddr.includes(existAddr) || existAddr.includes(candAddr))) {
            isDuplicate = true;
            duplicatesRemoved++;
            break;
          }
        }
      }

      if (!isDuplicate) {
        seenExternalIds.add(externalId);
        normalizedProspects.push(prospect);
      }

      if (normalizedProspects.length >= effectiveLimit) {
        break;
      }
    }

    return {
      query: rawQuery,
      total: normalizedProspects.length,
      prospects: normalizedProspects,
      provider: this.name,
      simulated: false,
      attribution: 'Google Maps data via Apify Actor',
      metadata: {
        actorId: this.actorId,
        rawCount: rawElements.length,
        duplicatesRemoved,
        sessionRunCount: ApifyDiscoveryProvider.sessionRunCount,
        maxRunsPerSession: this.maxRunsPerSession,
        limit: effectiveLimit
      }
    };
  }

  /**
   * Normalizes a raw Apify Google Maps item into LeadFlow's DiscoveredProspect format.
   * Strictly preserves real data; NEVER fabricates missing contact fields.
   */
  public normalizeItem(item: any, fallbackQuery: string): DiscoveredProspect | null {
    if (!item || typeof item !== 'object') return null;

    const rawName = item.title || item.name;
    if (!rawName || typeof rawName !== 'string' || rawName.trim().length === 0) {
      return null;
    }
    const name = rawName.trim();

    // Generate stable external identifier
    const placeId = item.placeId || item.cid || item.id;
    const externalId = placeId ? `apify_${placeId}` : `apify_${Buffer.from(name + (item.address || '')).toString('base64').substring(0, 24)}`;

    // Category
    const rawCategory = item.categoryName || item.category || item.subTitle || 'Local Business';
    const category = typeof rawCategory === 'string'
      ? rawCategory.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
      : 'Local Business';

    // Infer Entity Type
    let entityType: EntityType = 'business';
    const lowerCategory = category.toLowerCase();
    const lowerName = name.toLowerCase();
    const businessKeywords = /\b(associates|care|center|centre|chambers|clinic|company|corporation|dental|dentistry|dept|department|firm|group|hospital|inc|institute|law|legal|llc|llp|ltd|office|partners|practice|services|studio)\b/i;

    if (['dentist', 'doctor', 'physician', 'therapist'].some((k) => lowerCategory.includes(k))) {
      if (lowerName.startsWith('dr') || !businessKeywords.test(lowerName)) {
        entityType = 'person';
      }
    } else if (['lawyer', 'attorney', 'accountant'].some((k) => lowerCategory.includes(k))) {
      if (!businessKeywords.test(lowerName)) {
        entityType = 'person';
      }
    }


    // Address
    const address = item.address || item.street || undefined;
    const city = item.city || undefined;
    const state = item.state || undefined;
    const country = item.countryCode || item.country || undefined;
    const postalCode = item.postalCode || undefined;

    // Coordinates
    let lat: number | undefined = undefined;
    let lon: number | undefined = undefined;
    if (item.location && typeof item.location === 'object') {
      if (typeof item.location.lat === 'number') lat = item.location.lat;
      if (typeof item.location.lng === 'number') lon = item.location.lng;
    } else {
      if (typeof item.latitude === 'number') lat = item.latitude;
      if (typeof item.longitude === 'number') lon = item.longitude;
    }

    // Contact Information (strict authenticity - NEVER fabricate)
    const phone = item.phone || item.phoneUnformatted || undefined;
    const email = item.email && typeof item.email === 'string' && item.email.includes('@') ? item.email.trim() : undefined;
    
    // Website (filter out raw Google Maps URLs that are not actual business websites)
    let website: string | undefined = undefined;
    const rawWeb = item.website || item.url;
    if (rawWeb && typeof rawWeb === 'string') {
      const trimmed = rawWeb.trim();
      if (!trimmed.includes('google.com/maps') && !trimmed.includes('goo.gl/maps')) {
        website = trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`;
      }
    }

    // Social Profiles
    const socialProfiles: SocialProfile[] = [];
    if (item.socialProfiles && Array.isArray(item.socialProfiles)) {
      for (const sp of item.socialProfiles) {
        if (sp && sp.platform && sp.url) {
          socialProfiles.push({ platform: sp.platform, url: sp.url });
        }
      }
    }
    // Also check direct social fields from certain actors
    const socialFields: [string, string][] = [
      ['facebook', 'Facebook'],
      ['instagram', 'Instagram'],
      ['linkedin', 'LinkedIn'],
      ['twitter', 'Twitter']
    ];
    for (const [key, platform] of socialFields) {
      if (item[key] && typeof item[key] === 'string' && !socialProfiles.some((s) => s.platform === platform)) {
        socialProfiles.push({ platform, url: item[key].trim() });
      }
    }

    // Google Maps URL as sourceUrl
    const sourceUrl = item.url && item.url.includes('google.com') ? item.url : (placeId ? `https://www.google.com/maps/place/?q=place_id:${placeId}` : undefined);

    return {
      id: externalId,
      externalId,
      name,
      entityType,
      category,
      description: item.description || `Google Maps business listing for ${name} (${category}).`,
      location: {
        address,
        city,
        state,
        country,
        postalCode
      },
      latitude: lat,
      longitude: lon,
      phone,
      email,
      website,
      socialProfiles,
      source: 'apify_google_maps',
      sourceUrl,
      confidenceScore: 0.95,
      discoveryMetadata: {
        actorId: this.actorId,
        placeId,
        totalScore: item.totalScore || item.rating || undefined,
        reviewsCount: item.reviewsCount || undefined,
        openingHours: item.openingHours || undefined,
        isAdvertisement: item.isAdvertisement || false
      }
    };
  }
}
