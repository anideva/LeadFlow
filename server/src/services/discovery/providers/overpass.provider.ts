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

export const DEFAULT_OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
];

export class OpenStreetMapOverpassProvider implements IDiscoveryProvider {
  public readonly name = 'openstreetmap_overpass';
  private static lastRequestTime = 0;
  private readonly mirrors: string[];
  private readonly userAgent: string;

  constructor(
    baseUrl?: string,
    userAgent = process.env.OSM_USER_AGENT || 'LeadFlow-Discovery-Platform/1.0 (contact@leadflow.io)'
  ) {
    const configuredBase = baseUrl || process.env.OVERPASS_BASE_URL;
    if (configuredBase && configuredBase.trim()) {
      const clean = configuredBase.trim().replace(/\/$/, '');
      this.mirrors = [clean, ...DEFAULT_OVERPASS_MIRRORS.filter((m) => m !== clean)];
    } else {
      this.mirrors = [...DEFAULT_OVERPASS_MIRRORS];
    }
    this.userAgent = userAgent;
  }

  public get baseUrl(): string {
    return this.mirrors[0];
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

    // 1. Florists / Flower shops
    if (/\b(flower|florist|flowers|bouquet|blossom|botanical)\b/.test(q)) {
      return { categoryName: 'Florist', osmTags: ['["shop"="florist"]'] };
    }

    // 2. Fast food
    if (/\b(fast\s*food|burger|burgers|pizza|pizzeria|sandwich|sandwiches|fried\s*chicken|tacos?|burritos?)\b/.test(q)) {
      return { categoryName: 'Fast Food', osmTags: ['["amenity"="fast_food"]'] };
    }

    // 3. Restaurants / Dining
    if (/\b(restaurant|restaurants|dining|eatery|eateries|bistro|diner|trattoria|steakhouse|seafood)\b/.test(q)) {
      return {
        categoryName: 'Restaurant',
        osmTags: ['["amenity"="restaurant"]', '["amenity"="fast_food"]']
      };
    }

    // 4. Cafes / Coffee / Tea
    if (/\b(cafe|cafes|coffee|tea|espresso|cappuccino|teahouse|coffeebar)\b/.test(q)) {
      return { categoryName: 'Cafe', osmTags: ['["amenity"="cafe"]'] };
    }

    // 5. Bars / Pubs / Nightlife
    if (/\b(bar|bars|pub|pubs|brewery|breweries|tavern|lounge|cocktail|wine\s*bar)\b/.test(q)) {
      return { categoryName: 'Bar / Pub', osmTags: ['["amenity"="bar"]', '["amenity"="pub"]'] };
    }

    // 6. Dentists / Dental clinics
    if (/\b(dentist|dentists|dental|orthodontist|orthodontists|teeth|endodontist|periodontist)\b/.test(q)) {
      return {
        categoryName: 'Dentist',
        osmTags: ['["amenity"="dentist"]', '["healthcare"="dentist"]']
      };
    }

    // 7. Pharmacies / Chemists
    if (/\b(pharmacy|pharmacies|chemist|chemists|drugstore|drugstores|medical\s*store|apothecary)\b/.test(q)) {
      return {
        categoryName: 'Pharmacy',
        osmTags: ['["amenity"="pharmacy"]', '["shop"="chemist"]']
      };
    }

    // 8. Doctors / Clinics / Physicians / Hospitals
    if (/\b(doctor|doctors|clinic|clinics|physician|physicians|hospital|hospitals|pediatrician|cardiologist|dermatologist)\b/.test(q)) {
      return {
        categoryName: 'Doctor / Clinic',
        osmTags: ['["amenity"="doctors"]', '["amenity"="clinic"]', '["amenity"="hospital"]', '["healthcare"="doctor"]', '["healthcare"="clinic"]']
      };
    }

    // 9. Bakeries / Pastry
    if (/\b(bakery|bakeries|pastry|pastries|bakehouse|patisserie|doughnut|donut|bagel)\b/.test(q)) {
      return { categoryName: 'Bakery', osmTags: ['["shop"="bakery"]'] };
    }

    // 10. Hotels / Lodging
    if (/\b(hotel|hotels|resort|resorts|hostel|hostels|inn|motel|motels|guest\s*house|b&b|bed\s*and\s*breakfast|lodge)\b/.test(q)) {
      return {
        categoryName: 'Hotel',
        osmTags: ['["tourism"="hotel"]', '["tourism"="guest_house"]', '["tourism"="motel"]', '["tourism"="hostel"]']
      };
    }

    // 11. Lawyers / Legal
    if (/\b(lawyer|lawyers|attorney|attorneys|law\s*firm|law\s*firms|legal|solicitor|barrister|notary|notaries)\b/.test(q)) {
      return { categoryName: 'Lawyer / Legal', osmTags: ['["office"="lawyer"]', '["office"="notary"]'] };
    }

    // 12. Accountants / CPAs / Tax advisors
    if (/\b(accountant|accountants|accounting|cpa|bookkeeper|bookkeeping|tax\s*advisor|tax\s*consultant|auditor|audit)\b/.test(q)) {
      return { categoryName: 'Accountant / Tax', osmTags: ['["office"="accountant"]', '["office"="tax_advisor"]'] };
    }

    // 13. Software / IT / Tech
    if (/\b(software|it\s*company|it\s*companies|tech\s*company|tech\s*companies|technology|web\s*development|programming|app\s*development)\b/.test(q)) {
      return {
        categoryName: 'Software / IT',
        osmTags: ['["office"="it"]', '["office"="company"]', '["office"="telecommunication"]']
      };
    }

    // 14. Plumbers / Plumbing
    if (/\b(plumber|plumbers|plumbing|drain\s*cleaning|pipe\s*repair)\b/.test(q)) {
      return { categoryName: 'Plumber', osmTags: ['["craft"="plumber"]'] };
    }

    // 15. Electricians / Electrical
    if (/\b(electrician|electricians|electrical|wiring)\b/.test(q)) {
      return { categoryName: 'Electrician', osmTags: ['["craft"="electrician"]'] };
    }

    // 16. Locksmiths
    if (/\b(locksmith|locksmiths|key\s*cutting|locks)\b/.test(q)) {
      return { categoryName: 'Locksmith', osmTags: ['["craft"="locksmith"]', '["shop"="locksmith"]'] };
    }

    // 17. HVAC / Air Conditioning / Heating
    if (/\b(hvac|air\s*conditioning|heating|furnace|ventilation)\b/.test(q)) {
      return { categoryName: 'HVAC / Heating & Cooling', osmTags: ['["craft"="hvac"]', '["craft"="plumber"]'] };
    }

    // 18. Carpenters / Woodworking
    if (/\b(carpenter|carpenters|carpentry|joiner|cabinet\s*maker)\b/.test(q)) {
      return { categoryName: 'Carpenter', osmTags: ['["craft"="carpenter"]'] };
    }

    // 19. Painters / Painting contractors
    if (/\b(painter|painters|painting\s*contractor|house\s*painter)\b/.test(q)) {
      return { categoryName: 'Painter', osmTags: ['["craft"="painter"]'] };
    }

    // 20. Roofers / Roofing
    if (/\b(roofer|roofers|roofing)\b/.test(q)) {
      return { categoryName: 'Roofer', osmTags: ['["craft"="roofer"]'] };
    }

    // 21. Real Estate / Realtors
    if (/\b(real\s*estate|realtor|realtors|estate\s*agent|estate\s*agents|property\s*management)\b/.test(q)) {
      return { categoryName: 'Real Estate', osmTags: ['["office"="estate_agent"]'] };
    }

    // 22. Insurance Agencies
    if (/\b(insurance|insurance\s*agent|insurance\s*agency|insurance\s*broker)\b/.test(q)) {
      return { categoryName: 'Insurance', osmTags: ['["office"="insurance"]'] };
    }

    // 23. Architects / Architecture
    if (/\b(architect|architects|architecture|interior\s*designer|interior\s*design)\b/.test(q)) {
      return { categoryName: 'Architect / Interior Design', osmTags: ['["office"="architect"]', '["office"="interior_decorator"]'] };
    }

    // 24. Car Repair / Mechanics / Auto Service
    if (/\b(auto\s*repair|car\s*repair|mechanic|mechanics|garage|tire\s*shop|tyre\s*shop|auto\s*service)\b/.test(q)) {
      return { categoryName: 'Auto Repair / Mechanic', osmTags: ['["shop"="car_repair"]'] };
    }

    // 25. Car Dealerships / Auto Sales
    if (/\b(car\s*dealership|car\s*dealer|auto\s*dealer|used\s*cars|car\s*sales)\b/.test(q)) {
      return { categoryName: 'Car Dealer', osmTags: ['["shop"="car"]'] };
    }

    // 26. Car Rental
    if (/\b(car\s*rental|rent\s*a\s*car|car\s*hire)\b/.test(q)) {
      return { categoryName: 'Car Rental', osmTags: ['["amenity"="car_rental"]'] };
    }

    // 27. Car Wash
    if (/\b(car\s*wash|auto\s*detailing|car\s*detailing)\b/.test(q)) {
      return { categoryName: 'Car Wash', osmTags: ['["amenity"="car_wash"]'] };
    }

    // 28. Veterinarians / Animal Hospitals / Pet Care
    if (/\b(vet|vets|veterinarian|veterinarians|animal\s*hospital|vet\s*clinic|pet\s*clinic)\b/.test(q)) {
      return { categoryName: 'Veterinarian', osmTags: ['["amenity"="veterinary"]'] };
    }

    // 29. Pet Shops / Grooming
    if (/\b(pet\s*shop|pet\s*store|pet\s*grooming|dog\s*grooming|pet\s*supplies)\b/.test(q)) {
      return { categoryName: 'Pet Shop / Grooming', osmTags: ['["shop"="pet"]', '["craft"="pet_grooming"]'] };
    }

    // 30. Opticians / Optometrists
    if (/\b(optician|opticians|optometrist|optometry|eyewear|glasses\s*shop)\b/.test(q)) {
      return { categoryName: 'Optician / Eyewear', osmTags: ['["shop"="optician"]'] };
    }

    // 31. Physical Therapy / Chiropractors
    if (/\b(physiotherapy|physical\s*therapy|physiotherapist|chiropractor|chiropractic)\b/.test(q)) {
      return { categoryName: 'Physical Therapy / Chiropractor', osmTags: ['["healthcare"="physiotherapist"]', '["healthcare"="chiropractor"]'] };
    }

    // 32. Gyms / Fitness / Yoga
    if (/\b(gym|gyms|fitness|workout|crossfit|yoga|pilates|fitness\s*center)\b/.test(q)) {
      return { categoryName: 'Fitness / Gym', osmTags: ['["leisure"="fitness_centre"]'] };
    }

    // 33. Spas / Massages
    if (/\b(spa|spas|massage|massages|wellness\s*center|sauna)\b/.test(q)) {
      return { categoryName: 'Spa / Massage', osmTags: ['["shop"="massage"]', '["leisure"="spa"]'] };
    }

    // 34. Salons / Barbers / Hairdressers
    if (/\b(salon|salons|barber|barbers|hairdresser|hairdressers|hair\s*stylist|beauty\s*parlou?r|nail\s*salon)\b/.test(q)) {
      return { categoryName: 'Beauty Salon / Barber', osmTags: ['["shop"="hairdresser"]', '["shop"="beauty"]'] };
    }

    // 35. Laundry / Dry Cleaning
    if (/\b(laundry|laundromat|dry\s*cleaner|dry\s*cleaners|dry\s*cleaning|laundrette)\b/.test(q)) {
      return { categoryName: 'Laundry / Dry Cleaning', osmTags: ['["shop"="dry_cleaning"]', '["shop"="laundry"]'] };
    }

    // 36. Photographers / Photo Studios
    if (/\b(photographer|photographers|photography|photo\s*studio)\b/.test(q)) {
      return { categoryName: 'Photographer', osmTags: ['["craft"="photographer"]', '["shop"="photo"]'] };
    }

    // 37. Book stores
    if (/\b(book\s*stores?|book\s*shops?|books|stationery|bookstores?)\b/.test(q)) {
      return { categoryName: 'Book Store', osmTags: ['["shop"="books"]', '["shop"="stationery"]'] };
    }

    // 38. Supermarkets / Groceries
    if (/\b(supermarket|supermarkets|grocery|groceries|convenience\s*stores?|market|grocery\s*store)\b/.test(q)) {
      return { categoryName: 'Supermarket', osmTags: ['["shop"="supermarket"]', '["shop"="convenience"]', '["shop"="greengrocer"]'] };
    }

    // 39. Clothing / Boutiques / Fashion
    if (/\b(clothing|clothes|boutique|boutiques|apparel|menswear|womenswear|fashion)\b/.test(q)) {
      return { categoryName: 'Clothing Store', osmTags: ['["shop"="clothes"]', '["shop"="boutique"]'] };
    }

    // 40. Electronics / Phone Repair / Computers
    if (/\b(electronics|computer\s*store|computer\s*repair|phone\s*repair|mobile\s*phone\s*shop|gadget\s*shop)\b/.test(q)) {
      return { categoryName: 'Electronics / Repair', osmTags: ['["shop"="electronics"]', '["shop"="computer"]', '["shop"="mobile_phone"]'] };
    }

    // 41. Jewelry / Watches
    if (/\b(jewelry|jewellery|jeweler|jeweller|watch\s*repair|watches)\b/.test(q)) {
      return { categoryName: 'Jewelry Store', osmTags: ['["shop"="jewelry"]'] };
    }

    // 42. Furniture / Home Decor
    if (/\b(furniture|home\s*decor|mattress\s*store|interior\s*decoration)\b/.test(q)) {
      return { categoryName: 'Furniture Store', osmTags: ['["shop"="furniture"]'] };
    }

    // 43. Hardware / Home Improvement
    if (/\b(hardware\s*store|home\s*improvement|diy|tools\s*store)\b/.test(q)) {
      return { categoryName: 'Hardware Store', osmTags: ['["shop"="hardware"]', '["shop"="doityourself"]'] };
    }

    // 44. Coaching / Institutes / Education
    if (/\b(coaching|institute|institutes|academy|tuition|training|school|college|driving\s*school)\b/.test(q)) {
      return { categoryName: 'Education / Coaching', osmTags: ['["amenity"="school"]', '["amenity"="college"]', '["amenity"="training"]', '["amenity"="driving_school"]'] };
    }

    // 45. Travel Agencies / Tour Operators
    if (/\b(travel\s*agency|travel\s*agent|tour\s*operator|tour\s*agency)\b/.test(q)) {
      return { categoryName: 'Travel Agency', osmTags: ['["shop"="travel_agency"]'] };
    }

    // 46. Advertising / Marketing / PR Agencies
    if (/\b(advertising\s*agency|marketing\s*agency|pr\s*agency|digital\s*marketing)\b/.test(q)) {
      return { categoryName: 'Advertising / Marketing', osmTags: ['["office"="advertising_agency"]', '["office"="marketing"]'] };
    }

    // 47. Cleaning Services
    if (/\b(cleaning\s*service|maid\s*service|commercial\s*cleaning|cleaners)\b/.test(q)) {
      return { categoryName: 'Cleaning Service', osmTags: ['["craft"="cleaning"]', '["office"="cleaning"]'] };
    }

    // 48. Dynamic category fallback:
    // Extract candidate keyword from query
    const conversationalPrefixRegex = /^(?:please\s+)?(?:find|search\s+for|search|show\s+me|show|locate|discover|look\s+for|get|list|display)\s+(?:all\s+)?(?:the\s+)?/i;
    const cleaned = q.replace(conversationalPrefixRegex, '').trim();
    const withoutSuffix = cleaned.replace(/\b(?:in|at|near|around|for)\s+([a-zA-Z\u00C0-\u024F0-9\s,.-]+)$/i, '').trim();
    const categorySuffixRegex = /\s+(?:all\s+)?(restaurants?|cafes?|coffee\s*shops?|dentists?|doctors?|clinics?|hospitals?|florists?|flowers?|flower\s+shops?|bakeries?|bakery|hotels?|lawyers?|law\s*firms?|attorneys?|software(?:\s+companies)?|plumbers?|electricians?|mechanics?|auto\s*repair|locksmiths?|gyms?|fitness|salons?|barbers?|spas?|pharmacies?|chemists?|supermarkets?|groceries?|grocery\s*stores?|book\s*stores?|book\s*shops?|schools?|colleges?|contractors?|accountants?|accounting\s+firms?|real\s+estate(?:\s+agents)?|cleaning(?:\s+services)?)$/i;
    const categoryTerm = withoutSuffix.match(categorySuffixRegex) ? withoutSuffix.match(categorySuffixRegex)![1] : withoutSuffix;
    const candidateKeyword = categoryTerm.replace(/\b(shops?|stores?|companies|company|offices?|businesses?|services?)\b/gi, '').trim();

    if (candidateKeyword.length >= 3 && /^[a-z0-9_-]+$/i.test(candidateKeyword)) {
      const sanitized = candidateKeyword.toLowerCase();
      const capName = sanitized.charAt(0).toUpperCase() + sanitized.slice(1);
      return {
        categoryName: capName,
        osmTags: [`["shop"="${sanitized}"]`, `["amenity"="${sanitized}"]`, `["craft"="${sanitized}"]`, `["office"="${sanitized}"]`]
      };
    }

    return null;
  }

  /**
   * Extracts location text from natural-language query.
   * Handles conversational search prefixes, suffix prepositions ("in Jaipur"),
   * and prefix location formats ("London cafes", "New York dentists").
   */
  public extractLocation(query: string): string | null {
    const trimmed = query.trim();
    const conversationalPrefixRegex = /^(?:please\s+)?(?:find|search\s+for|search|show\s+me|show|locate|discover|look\s+for|get|list|display)\s+(?:all\s+)?(?:the\s+)?/i;
    const cleaned = trimmed.replace(conversationalPrefixRegex, '').trim();

    // 1. Suffix location: e.g. "flower shops in Jaipur", "dentists in New York, NY"
    const suffixRegex = /\b(?:in|at|near|around|for)\s+([a-zA-Z\u00C0-\u024F0-9\s,.-]+)$/i;
    const suffixMatch = cleaned.match(suffixRegex);
    if (suffixMatch && suffixMatch[1]) {
      const loc = suffixMatch[1].trim().replace(/^[\s,.-]+|[\s,.-]+$/g, '');
      if (loc.length >= 2) return loc;
    }

    // 2. Prefix location: e.g. "London cafes", "New York dentists", "Jaipur flower shops"
    // When no preposition exists, check if query ends with common business category nouns
    const categorySuffixRegex = /\s+(?:all\s+)?(restaurants?|cafes?|coffee\s*shops?|dentists?|doctors?|clinics?|hospitals?|florists?|flowers?|flower\s+shops?|bakeries?|bakery|hotels?|lawyers?|law\s*firms?|attorneys?|software(?:\s+companies)?|plumbers?|electricians?|mechanics?|auto\s*repair|locksmiths?|gyms?|fitness|salons?|barbers?|spas?|pharmacies?|chemists?|supermarkets?|groceries?|grocery\s*stores?|book\s*stores?|book\s*shops?|schools?|colleges?|contractors?|accountants?|accounting\s+firms?|real\s+estate(?:\s+agents)?|cleaning(?:\s+services)?)$/i;
    const nonLocationStopwords = /^(?:just|only|some|all|the|any|top|best|good|local|nearby|cheap|affordable|our|great)$/i;
    if (categorySuffixRegex.test(cleaned)) {
      const locationPart = cleaned.replace(categorySuffixRegex, '').trim().replace(/^[\s,.-]+|[\s,.-]+$/g, '');
      if (locationPart.length >= 2 && !nonLocationStopwords.test(locationPart)) {
        return locationPart;
      }
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
    for (const mirror of this.mirrors) {
      await this.enforceRateLimit();

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 9000);

      try {
        const response = await fetch(mirror, {
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
          console.warn(`[Overpass Provider] Mirror ${mirror} returned HTTP ${response.status} ${response.statusText}, attempting next mirror if available...`);
          continue;
        }

        const text = await response.text();
        if (text.startsWith('<') || !text.includes('{')) {
          console.warn(`[Overpass Provider] Mirror ${mirror} returned non-JSON response, attempting next mirror if available...`);
          continue;
        }

        const data: OverpassResponse = JSON.parse(text);
        if (!Array.isArray(data.elements)) {
          continue;
        }

        return data.elements;
      } catch (err: any) {
        if (err.name === 'AbortError') {
          console.warn(`[Overpass Provider] Mirror ${mirror} timed out after 9 seconds, attempting next mirror if available...`);
        } else {
          console.warn(`[Overpass Provider] Mirror ${mirror} error: ${err.message}, attempting next mirror if available...`);
        }
      } finally {
        clearTimeout(timeoutId);
      }
    }

    console.warn('[Overpass Provider] All configured Overpass mirrors exhausted or unavailable.');
    return [];
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

    // Address extraction: prefer structured house_number + street; fall back to addr:full if unstructured; then suburb/neighbourhood
    const streetParts = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean);
    const rawFullAddress =
      tags['addr:full'] && typeof tags['addr:full'] === 'string' && tags['addr:full'].trim().length > 0
        ? tags['addr:full'].trim()
        : undefined;
    const streetAddress =
      streetParts.length > 0
        ? streetParts.join(' ')
        : rawFullAddress || tags['addr:suburb'] || tags['addr:neighbourhood'] || undefined;
    const city = tags['addr:city'] || defaultCity;
    const state = tags['addr:state'] || undefined;
    const country = tags['addr:country'] || undefined;
    const postalCode = tags['addr:postcode'] || undefined;

    // Real contacts from tags only (zero fabrication, preserving precedence)
    const rawPhone =
      tags.phone ||
      tags['contact:phone'] ||
      tags['contact:mobile'] ||
      tags.mobile ||
      tags['phone:mobile'] ||
      undefined;
    const phone =
      rawPhone && typeof rawPhone === 'string' && rawPhone.trim().length > 0 ? rawPhone.trim() : undefined;

    const rawEmail = tags.email || tags['contact:email'] || undefined;
    const email =
      rawEmail && typeof rawEmail === 'string' && rawEmail.trim().length > 0 ? rawEmail.trim() : undefined;

    const rawWebsite =
      tags.website ||
      tags['contact:website'] ||
      tags.url ||
      tags['contact:url'] ||
      tags['contact:web'] ||
      undefined;
    const trimmedWebsite =
      rawWebsite && typeof rawWebsite === 'string' && rawWebsite.trim().length > 0
        ? rawWebsite.trim()
        : undefined;
    const website = trimmedWebsite
      ? trimmedWebsite.startsWith('http://') || trimmedWebsite.startsWith('https://')
        ? trimmedWebsite
        : `https://${trimmedWebsite}`
      : undefined;

    // Handle WhatsApp separately where present; do not assume every WhatsApp tag is a standard telephone number
    const rawWhatsapp = tags['contact:whatsapp'] || tags.whatsapp || undefined;
    const whatsapp =
      rawWhatsapp && typeof rawWhatsapp === 'string' && rawWhatsapp.trim().length > 0
        ? rawWhatsapp.trim()
        : undefined;

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
        cuisine: tags.cuisine || undefined,
        whatsapp,
        wikidata: tags.wikidata || undefined
      }
    };
  }
}
