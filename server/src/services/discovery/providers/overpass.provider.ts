import { IDiscoveryProvider } from '../discovery.provider';
import {
  DiscoverySearchRequest,
  DiscoverySearchResult,
  DiscoveredProspect,
  EntityType,
  SocialProfile
} from '../../../types/discovery.types';

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: {
    lat: number;
    lon: number;
  };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  version: number;
  generator: string;
  elements: OverpassElement[];
}

export interface CategoryTagMapping {
  categoryName: string;
  osmTags: string[];
}

export class OpenStreetMapOverpassProvider implements IDiscoveryProvider {
  public readonly name = 'openstreetmap_overpass';
  private static lastRequestTime = 0;
  private readonly baseUrl: string;
  private readonly userAgent: string;

  constructor(
    baseUrl = process.env.OVERPASS_BASE_URL || 'https://overpass-api.de/api/interpreter',
    userAgent = process.env.OSM_USER_AGENT || 'LeadFlow-Discovery-Platform/1.0 (contact@leadflow.io)'
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.userAgent = userAgent;
  }

  /**
   * Enforces polite spacing between consecutive Overpass outbound requests.
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - OpenStreetMapOverpassProvider.lastRequestTime;
    if (elapsed < 1500) {
      await new Promise((resolve) => setTimeout(resolve, 1500 - elapsed));
    }
    OpenStreetMapOverpassProvider.lastRequestTime = Date.now();
  }

  /**
   * Resolves natural-language query category into OpenStreetMap tags.
   */
  public resolveCategoryTags(rawQuery: string): CategoryTagMapping | null {
    const q = rawQuery.toLowerCase();

    // Florists / Flower shops
    if (/\b(flower|florist|flowers|bouquet)\b/.test(q)) {
      return { categoryName: 'Florist', osmTags: ['["shop"="florist"]'] };
    }

    // Fast food
    if (/\b(fast\s*food|burger|pizza|sandwich)\b/.test(q)) {
      return { categoryName: 'Fast Food', osmTags: ['["amenity"="fast_food"]'] };
    }

    // Restaurants
    if (/\b(restaurant|restaurants|dining|eatery|food|bistro)\b/.test(q)) {
      return {
        categoryName: 'Restaurant',
        osmTags: ['["amenity"="restaurant"]', '["amenity"="fast_food"]']
      };
    }

    // Cafes / Coffee
    if (/\b(cafe|cafes|coffee|tea|espresso)\b/.test(q)) {
      return { categoryName: 'Cafe', osmTags: ['["amenity"="cafe"]'] };

    }

    // Dentists / Dental clinics
    if (/\b(dentist|dentists|dental|orthodontist)\b/.test(q)) {
      return {
        categoryName: 'Dentist',
        osmTags: ['["amenity"="dentist"]', '["healthcare"="dentist"]']
      };
    }

    // Pharmacies / Chemists
    if (/\b(pharmacy|pharmacies|chemist|chemists|drugstore|medical\s*store)\b/.test(q)) {
      return {
        categoryName: 'Pharmacy',
        osmTags: ['["amenity"="pharmacy"]', '["shop"="chemist"]']
      };
    }

    // Doctors / Clinics / Hospitals
    if (/\b(doctor|doctors|clinic|clinics|physician|hospital|hospitals)\b/.test(q)) {
      return {
        categoryName: 'Doctor / Clinic',
        osmTags: ['["amenity"="doctors"]', '["amenity"="clinic"]', '["amenity"="hospital"]']
      };
    }

    // Bakeries
    if (/\b(bakery|bakeries|pastry|bakehouse)\b/.test(q)) {
      return { categoryName: 'Bakery', osmTags: ['["shop"="bakery"]'] };
    }

    // Hotels / Lodging
    if (/\b(hotel|hotels|resort|resorts|hostel|inn|motel|guest\s*house)\b/.test(q)) {
      return {
        categoryName: 'Hotel',
        osmTags: ['["tourism"="hotel"]', '["tourism"="guest_house"]', '["tourism"="motel"]']
      };
    }

    // Lawyers / Legal
    if (/\b(lawyer|lawyers|attorney|attorneys|law\s*firm|legal)\b/.test(q)) {
      return { categoryName: 'Lawyer / Legal', osmTags: ['["office"="lawyer"]'] };
    }

    // Software / IT Companies
    if (/\b(software|it\s*company|it\s*companies|tech\s*company|technology|web\s*development|programming)\b/.test(q)) {
      return {
        categoryName: 'Software / IT',
        osmTags: ['["office"="it"]', '["office"="company"]', '["office"="telecommunication"]']
      };
    }

    // Coaching / Institutes / Education
    if (/\b(coaching|institute|institutes|academy|tuition|training|school|college)\b/.test(q)) {
      return {
        categoryName: 'Education / Coaching',
        osmTags: ['["amenity"="school"]', '["amenity"="college"]', '["amenity"="training"]']
      };
    }

    // Book stores
    if (/\b(book\s*store|book\s*shop|books|stationery|bookstore)\b/.test(q)) {
      return { categoryName: 'Book Store', osmTags: ['["shop"="books"]', '["shop"="stationery"]'] };
    }

    // Supermarkets / Groceries
    if (/\b(supermarket|supermarkets|grocery|groceries|convenience\s*store)\b/.test(q)) {
      return {
        categoryName: 'Supermarket',
        osmTags: ['["shop"="supermarket"]', '["shop"="convenience"]']
      };
    }

    // Gyms / Fitness
    if (/\b(gym|gyms|fitness|workout|crossfit)\b/.test(q)) {
      return { categoryName: 'Fitness / Gym', osmTags: ['["leisure"="fitness_centre"]'] };
    }

    // Salons / Beauty / Barbers
    if (/\b(salon|salons|barber|barbers|hairdresser|spa|beauty\s*parlour)\b/.test(q)) {
      return {
        categoryName: 'Beauty Salon / Barber',
        osmTags: ['["shop"="hairdresser"]', '["shop"="beauty"]']
      };
    }


    return null;
  }

  /**
   * Extracts location text from natural-language query.
   * e.g. "flower shops in Guwahati" -> "Guwahati"
   */
  public extractLocation(query: string): string | null {
    const trimmed = query.trim();
    const locationRegex = /\b(?:in|at|near|around|for)\s+([a-zA-Z\s,.-]+)$/i;
    const match = trimmed.match(locationRegex);
    if (match && match[1]) {
      const loc = match[1].trim().replace(/^[\s,.-]+|[\s,.-]+$/g, '');
      if (loc.length >= 2) return loc;
    }
    return null;
  }

  /**
   * Geocodes location using Nominatim to derive a safe coordinate bounding box.
   * Returns [minLat, minLon, maxLat, maxLon] or null.
   */
  public async geocodeBoundingBox(
    location: string
  ): Promise<{ bbox: [number, number, number, number]; displayName?: string } | null> {
    try {
      const nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 7000);

      const res = await fetch(nomUrl, {
        headers: { 'User-Agent': this.userAgent, 'Accept': 'application/json' },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!res.ok) return null;
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) return null;

      const place = data[0];
      if (Array.isArray(place.boundingbox) && place.boundingbox.length === 4) {
        // Nominatim returns [south, north, west, east] as strings
        const south = parseFloat(place.boundingbox[0]);
        const north = parseFloat(place.boundingbox[1]);
        const west = parseFloat(place.boundingbox[2]);
        const east = parseFloat(place.boundingbox[3]);

        if (!isNaN(south) && !isNaN(north) && !isNaN(west) && !isNaN(east)) {
          return {
            bbox: [south, west, north, east],
            displayName: place.display_name
          };
        }
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Discovers real prospects from OpenStreetMap Overpass API using bounded queries.
   */
  public async search(request: DiscoverySearchRequest): Promise<DiscoverySearchResult> {
    const rawQuery = request.query.trim();
    const limit = Math.min(Math.max(request.limit || 10, 1), 50);

    const mapping = this.resolveCategoryTags(rawQuery);
    if (!mapping) {
      // Overpass requires concrete OSM tag definitions; return 0 prospects to allow composite fallback
      return {
        query: rawQuery,
        total: 0,
        prospects: [],
        provider: this.name,
        simulated: false,
        attribution: 'Data © OpenStreetMap contributors, ODbL 1.0. https://www.openstreetmap.org/copyright'
      };
    }

    const locationName = request.locationHint || this.extractLocation(rawQuery);
    if (!locationName) {
      return {
        query: rawQuery,
        total: 0,
        prospects: [],
        provider: this.name,
        simulated: false,
        attribution: 'Data © OpenStreetMap contributors, ODbL 1.0. https://www.openstreetmap.org/copyright'
      };
    }

    const geocoded = await this.geocodeBoundingBox(locationName);
    if (!geocoded) {
      return {
        query: rawQuery,
        total: 0,
        prospects: [],
        provider: this.name,
        simulated: false,
        attribution: 'Data © OpenStreetMap contributors, ODbL 1.0. https://www.openstreetmap.org/copyright'
      };
    }

    const [s, w, n, e] = geocoded.bbox;
    // Overpass bounding box syntax: (south, west, north, east)
    const bboxStr = `${s.toFixed(5)},${w.toFixed(5)},${n.toFixed(5)},${e.toFixed(5)}`;

    // Build bounded Overpass QL
    const tagQueries = mapping.osmTags
      .map((tag) => `  node${tag}(${bboxStr});\n  way${tag}(${bboxStr});`)
      .join('\n');

    const ql = `[out:json][timeout:15];
(
${tagQueries}
);
out center 50;
`;

    const elements = await this.queryOverpass(ql);
    const prospects: DiscoveredProspect[] = [];

    for (const el of elements) {
      const p = this.normalizeElement(el, mapping.categoryName, locationName);
      if (p) {
        prospects.push(p);
      }
      if (prospects.length >= limit) break;
    }

    return {
      query: rawQuery,
      total: prospects.length,
      prospects,
      provider: this.name,
      simulated: false,
      attribution: 'Data © OpenStreetMap contributors, ODbL 1.0. https://www.openstreetmap.org/copyright',
      metadata: {
        source: 'OpenStreetMap Overpass API',
        resolvedCategory: mapping.categoryName,
        resolvedLocation: locationName,
        bbox: geocoded.bbox,
        limit
      }
    };
  }

  /**
   * Executes HTTP request to Overpass interpreter endpoint.
   * Handles timeouts, rate limits, and non-JSON/XML responses gracefully without throwing uncaught errors.
   */
  private async queryOverpass(ql: string): Promise<OverpassElement[]> {
    await this.enforceRateLimit();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'User-Agent': this.userAgent,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: 'data=' + encodeURIComponent(ql),
        signal: controller.signal
      });

      if (!response.ok) {
        // 429 Too Many Requests, 504 Gateway Timeout, etc.
        console.warn(`[Overpass Provider] HTTP error: ${response.status} ${response.statusText}`);
        return [];
      }

      const text = await response.text();
      // If server returned HTML/XML rate-limit or error page instead of JSON
      if (text.startsWith('<') || !text.includes('{')) {
        console.warn('[Overpass Provider] Server returned non-JSON response.');
        return [];
      }

      const data: OverpassResponse = JSON.parse(text);
      if (!Array.isArray(data.elements)) {
        return [];
      }

      return data.elements;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.warn('[Overpass Provider] Query timed out after 15 seconds.');
      } else {
        console.warn('[Overpass Provider] Query error:', err.message);
      }
      return [];
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Normalizes raw Overpass node or way into generic DiscoveredProspect.
   */
  private normalizeElement(
    el: OverpassElement,
    fallbackCategory: string,
    defaultCity: string
  ): DiscoveredProspect | null {
    const tags = el.tags || {};
    const rawName = tags.name || tags['name:en'] || tags.operator || tags.brand;

    // Discard unnamed geographical objects
    if (!rawName || typeof rawName !== 'string' || rawName.trim().length === 0) {
      return null;
    }

    const name = rawName.trim();
    const osmType = el.type;
    const osmId = el.id;
    const externalId = `osm_${osmType}_${osmId}`;

    const lat = el.lat || el.center?.lat;
    const lon = el.lon || el.center?.lon;

    // Determine clean category
    const categoryRaw = tags.amenity || tags.shop || tags.office || tags.tourism || tags.healthcare || fallbackCategory;
    const category = categoryRaw
      .replace(/_/g, ' ')
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');

    // Infer entity type
    let entityType: EntityType = 'business';
    const lowerCategory = category.toLowerCase();
    const lowerName = name.toLowerCase();
    if (['dentist', 'doctor', 'physician', 'lawyer'].some((t) => lowerCategory.includes(t))) {
      if (lowerName.startsWith('dr') || (!lowerName.includes('clinic') && !lowerName.includes('hospital') && !lowerName.includes('associates'))) {
        entityType = 'person';
      }
    }

    // Address extraction
    const streetParts = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean);
    const streetAddress = streetParts.length > 0 ? streetParts.join(' ') : tags['addr:suburb'] || tags['addr:neighbourhood'] || undefined;
    const city = tags['addr:city'] || defaultCity;
    const state = tags['addr:state'] || undefined;
    const country = tags['addr:country'] || undefined;
    const postalCode = tags['addr:postcode'] || undefined;

    // Real contacts from tags only (zero fabrication)
    const phone = tags.phone || tags['contact:phone'] || tags['phone:mobile'] || undefined;
    const email = tags.email || tags['contact:email'] || undefined;
    const rawWebsite = tags.website || tags['contact:website'] || tags.url || undefined;
    const website = rawWebsite && rawWebsite.startsWith('http') ? rawWebsite : rawWebsite ? `https://${rawWebsite}` : undefined;

    // Social profiles from tags
    const socialProfiles: SocialProfile[] = [];
    if (tags['contact:facebook'] || tags.facebook) {
      socialProfiles.push({ platform: 'Facebook', url: tags['contact:facebook'] || tags.facebook! });
    }
    if (tags['contact:instagram'] || tags.instagram) {
      socialProfiles.push({ platform: 'Instagram', url: tags['contact:instagram'] || tags.instagram! });
    }
    if (tags['contact:linkedin'] || tags.linkedin) {
      socialProfiles.push({ platform: 'LinkedIn', url: tags['contact:linkedin'] || tags.linkedin! });
    }
    if (tags['contact:twitter'] || tags.twitter) {
      socialProfiles.push({ platform: 'Twitter', url: tags['contact:twitter'] || tags.twitter! });
    }

    return {
      id: externalId,
      externalId,
      name,
      entityType,
      category,
      description: `OpenStreetMap verified ${category.toLowerCase()} listing in ${city}.`,
      location: {
        address: streetAddress,
        city,
        state,
        country,
        postalCode
      },
      latitude: lat !== undefined && !isNaN(Number(lat)) ? Number(lat) : undefined,
      longitude: lon !== undefined && !isNaN(Number(lon)) ? Number(lon) : undefined,
      phone,
      email,
      website,
      socialProfiles,
      source: 'openstreetmap',
      sourceUrl: `https://www.openstreetmap.org/${osmType}/${osmId}`,
      confidenceScore: 0.95,
      discoveryMetadata: {
        osm_type: osmType,
        osm_id: osmId,
        engine: 'Overpass API',
        opening_hours: tags.opening_hours || undefined,
        cuisine: tags.cuisine || undefined
      }
    };
  }
}
