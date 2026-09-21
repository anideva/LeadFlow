import { IDiscoveryProvider } from '../discovery.provider';
import {
  DiscoverySearchRequest,
  DiscoverySearchResult,
  DiscoveredProspect,
  EntityType,
  SocialProfile
} from '../../../types/discovery.types';

interface NominatimAddress {
  road?: string;
  house_number?: string;
  neighbourhood?: string;
  suburb?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  county?: string;
  state?: string;
  country?: string;
  postcode?: string;
  amenity?: string;
  shop?: string;
  office?: string;
  [key: string]: string | undefined;
}

interface NominatimPlace {
  place_id: number;
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  category: string;
  type: string;
  place_rank: number;
  address?: NominatimAddress;
  extratags?: Record<string, string> | null;
}

export class OpenStreetMapDiscoveryProvider implements IDiscoveryProvider {
  public readonly name = 'openstreetmap';
  private static lastRequestTime = 0;
  private readonly baseUrl: string;
  private readonly userAgent: string;

  constructor(
    baseUrl = 'https://nominatim.openstreetmap.org',
    userAgent = process.env.OSM_USER_AGENT || 'LeadFlow-Discovery-Platform/1.0 (contact@leadflow.io)'
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.userAgent = userAgent;
  }

  /**
   * Enforces polite rate-limiting of at least 1,000ms between outbound requests
   * per OpenStreetMap Nominatim Acceptable Use Policy.
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - OpenStreetMapDiscoveryProvider.lastRequestTime;
    if (elapsed < 1000) {
      await new Promise((resolve) => setTimeout(resolve, 1000 - elapsed));
    }
    OpenStreetMapDiscoveryProvider.lastRequestTime = Date.now();
  }

  /**
   * Discovers real prospects from OpenStreetMap based on natural-language queries.
   */
  public async search(request: DiscoverySearchRequest): Promise<DiscoverySearchResult> {
    const rawQuery = request.query.trim();
    const limit = Math.min(Math.max(request.limit || 10, 1), 50);

    // Parse pagination cursor (format: 'offset:<number>')
    let offset = 0;
    if (request.cursor && request.cursor.startsWith('offset:')) {
      const parsedOffset = parseInt(request.cursor.split(':')[1], 10);
      if (!isNaN(parsedOffset) && parsedOffset >= 0) {
        offset = parsedOffset;
      }
    }

    // Execute primary query
    let places = await this.queryNominatim(rawQuery, limit, offset);

    // If zero results and query contains common filler words (e.g. "flower shops in Jaipur"),
    // attempt a secondary query with cleaned keywords (e.g. "flowers in Jaipur").
    if (places.length === 0) {
      const simplifiedQuery = this.simplifyQuery(rawQuery);
      if (simplifiedQuery && simplifiedQuery.toLowerCase() !== rawQuery.toLowerCase()) {
        places = await this.queryNominatim(simplifiedQuery, limit, offset);
      }
    }

    const prospects = places.map((place) => this.normalizePlace(place));

    // Determine next pagination cursor if we received a full page of results
    const nextCursor = places.length === limit ? `offset:${offset + limit}` : undefined;

    return {
      query: rawQuery,
      total: prospects.length,
      prospects,
      provider: this.name,
      simulated: false,
      nextCursor,
      attribution: 'Data © OpenStreetMap contributors, ODbL 1.0. http://osm.org/copyright',
      metadata: {
        source: 'OpenStreetMap Nominatim',
        offset,
        limit,
        attributionUrl: 'https://www.openstreetmap.org/copyright'
      }
    };
  }

  /**
   * Executes HTTP request to Nominatim search endpoint with timeout and rate limiting.
   */
  private async queryNominatim(query: string, limit: number, offset: number): Promise<NominatimPlace[]> {
    await this.enforceRateLimit();

    const url = new URL(`${this.baseUrl}/search`);
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('extratags', '1');
    url.searchParams.set('namedetails', '1');
    url.searchParams.set('limit', String(limit));
    if (offset > 0) {
      url.searchParams.set('offset', String(offset));
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'application/json'
        },
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(`OpenStreetMap Nominatim API error: HTTP ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      if (!Array.isArray(data)) {
        return [];
      }

      return data as NominatimPlace[];
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error('OpenStreetMap discovery request timed out after 10 seconds.');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Simplifies search query if Nominatim returns 0 matches for conversational phrases.
   * e.g. "flower shops in Jaipur" -> "flowers in Jaipur"
   * e.g. "software companies in Bangalore" -> "software in Bangalore"
   */
  private simplifyQuery(q: string): string | null {
    const cleaned = q
      .replace(/\bflower\s+shops?\b/gi, 'flowers')
      .replace(/\b(shops?|stores?|companies|company|offices?|businesses?|firm|agencies)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned.length >= 3 ? cleaned : null;
  }

  /**
   * Normalizes a raw Nominatim place into LeadFlow's generic DiscoveredProspect.
   * Does NOT fabricate or guess missing emails or phone numbers.
   */
  private normalizePlace(item: NominatimPlace): DiscoveredProspect {
    const addr = item.address || {};
    const tags = item.extratags || {};

    // 1. Determine clean commercial/professional name
    const rawName = item.name || addr.amenity || addr.shop || addr.office || item.display_name.split(',')[0];
    const name = (rawName || 'Local Business').trim();

    // 2. Infer EntityType
    let entityType: EntityType = 'business';
    const lowerType = (item.type || '').toLowerCase();
    const lowerName = name.toLowerCase();
    const businessKeywords = /\b(associates|center|centre|chambers|clinic|company|corporation|dental|dentistry|dept|department|firm|group|hospital|inc|institute|law|legal|llc|llp|ltd|office|partners|practice|services|studio)\b/i;

    if (['dentist', 'doctor', 'physician', 'therapist'].includes(lowerType)) {
      if (lowerName.startsWith('dr') || (!businessKeywords.test(lowerName) && !lowerName.includes('clinic') && !lowerName.includes('center') && !lowerName.includes('centre'))) {
        entityType = 'person';
      }
    } else if (['lawyer', 'accountant'].includes(lowerType)) {
      if (!businessKeywords.test(lowerName)) {
        entityType = 'person';
      }
    }

    // 3. Normalized Category
    const categoryRaw = item.type || item.category || 'General';
    const category = categoryRaw
      .replace(/_/g, ' ')
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');

    // 4. Address Details
    const streetParts = [addr.house_number, addr.road].filter(Boolean);
    const streetAddress = streetParts.length > 0 ? streetParts.join(' ') : addr.neighbourhood || addr.suburb || undefined;
    const city = addr.city || addr.town || addr.village || addr.municipality || addr.county || undefined;
    const state = addr.state || undefined;
    const country = addr.country || undefined;
    const postalCode = addr.postcode || undefined;

    // 5. Contact Details (strictly real, never fabricated)
    const phone = tags.phone || tags['contact:phone'] || tags['phone:mobile'] || undefined;
    const email = tags.email || tags['contact:email'] || undefined;
    const rawWebsite = tags.website || tags['contact:website'] || tags['url'] || undefined;
    const website = rawWebsite && rawWebsite.startsWith('http') ? rawWebsite : rawWebsite ? `https://${rawWebsite}` : undefined;

    // 6. Social Profiles (strictly real, if present in extratags)
    const socialProfiles: SocialProfile[] = [];
    if (tags['contact:facebook'] || tags['facebook']) {
      socialProfiles.push({ platform: 'Facebook', url: tags['contact:facebook'] || tags['facebook']! });
    }
    if (tags['contact:instagram'] || tags['instagram']) {
      socialProfiles.push({ platform: 'Instagram', url: tags['contact:instagram'] || tags['instagram']! });
    }
    if (tags['contact:linkedin'] || tags['linkedin']) {
      socialProfiles.push({ platform: 'LinkedIn', url: tags['contact:linkedin'] || tags['linkedin']! });
    }
    if (tags['contact:twitter'] || tags['twitter']) {
      socialProfiles.push({ platform: 'Twitter', url: tags['contact:twitter'] || tags['twitter']! });
    }

    const osmType = item.osm_type || 'node';
    const osmId = item.osm_id;
    const externalId = `osm_${osmType}_${osmId}`;

    return {
      id: externalId,
      externalId,
      name,
      entityType,
      category,
      description: `OpenStreetMap verified ${category.toLowerCase()} listing in ${city || country || 'local area'}.`,
      location: {
        address: streetAddress,
        city,
        state,
        country,
        postalCode
      },
      latitude: !isNaN(Number(item.lat)) ? Number(item.lat) : undefined,
      longitude: !isNaN(Number(item.lon)) ? Number(item.lon) : undefined,
      phone,
      email,
      website,
      socialProfiles,
      source: 'openstreetmap',
      sourceUrl: `https://www.openstreetmap.org/${osmType}/${osmId}`,
      confidenceScore: 0.95,
      discoveryMetadata: {
        place_id: item.place_id,
        osm_type: osmType,
        osm_id: osmId,
        place_rank: item.place_rank,
        category: item.category,
        type: item.type,
        opening_hours: tags.opening_hours || undefined,
        cuisine: tags.cuisine || undefined
      }
    };
  }
}