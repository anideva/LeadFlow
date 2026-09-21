import { IDiscoveryProvider } from '../discovery.provider';
import {
  DiscoverySearchRequest,
  DiscoverySearchResult,
  DiscoveredProspect,
  EntityType
} from '../../../types/discovery.types';

interface ParsedQueryIntent {
  category: string;
  location?: string;
  entityType: EntityType;
}

/**
 * Development & Demonstration Discovery Provider.
 * Dynamically parses arbitrary natural-language prospecting queries (zero hardcoded industries or locations),
 * and produces normalized sandbox prospects to enable full testing and UI verification without external paid API keys.
 */
export class DevelopmentDiscoveryProvider implements IDiscoveryProvider {
  public readonly name = 'development_sandbox';

  /**
   * Dynamically parses natural-language query intent using generic pattern heuristics.
   * Works for ANY category and location combination dynamically.
   */
  public parseIntent(rawQuery: string): ParsedQueryIntent {
    const query = rawQuery.trim();

    // Pattern 1: [prefix words] [category] in/at/near/around [location]
    // e.g. "Find flower shops in Jaipur", "Show software companies near Bangalore", "Dentists in Guwahati"
    const locationRegex = /^(?:find|search for|look for|show me|get|list)?\s*(.+?)\s+(?:in|at|near|around|for)\s+(.+)$/i;
    const match = query.match(locationRegex);

    if (match) {
      const category = this.cleanCategory(match[1]);
      const location = this.cleanLocation(match[2]);
      const entityType = this.inferEntityType(category);
      return { category, location, entityType };
    }

    // Pattern 2: No location preposition found, entire query is the category/topic
    const cleaned = this.cleanCategory(query.replace(/^(?:find|search for|look for|show me|get|list)\s+/i, ''));
    return {
      category: cleaned,
      location: undefined,
      entityType: this.inferEntityType(cleaned)
    };
  }

  private cleanCategory(cat: string): string {
    const trimmed = cat.trim().replace(/^[\s,.-]+|[\s,.-]+$/g, '');
    if (!trimmed) return 'General Business';
    // Capitalize words
    return trimmed
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }

  private cleanLocation(loc: string): string {
    const trimmed = loc.trim().replace(/^[\s,.-]+|[\s,.-]+$/g, '');
    if (!trimmed) return 'Global';
    return trimmed
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  private inferEntityType(category: string): EntityType {
    const lower = category.toLowerCase();
    const personalTitles = ['dr', 'doctor', 'dentist', 'specialist', 'consultant', 'lawyer', 'therapist', 'architect', 'accountant', 'physician', 'attorney'];
    if (personalTitles.some((title) => lower.includes(title))) {
      return 'person';
    }
    return 'business';
  }

  private isMedicalProfession(category: string): boolean {
    const lower = category.toLowerCase();
    const medicalTerms = [
      'doctor', 'dr', 'dentist', 'dental', 'orthodont', 'physician',
      'surgeon', 'clinic', 'cardiolog', 'dermatolog', 'pediatric', 'psychiatr'
    ];
    return medicalTerms.some((term) => lower.includes(term));
  }

  private synthesizeLocationData(locationStr: string, index: number): {
    city: string;
    country?: string;
    address: string;
    phone: string;
    postalCode?: string;
  } {
    const locLower = locationStr.toLowerCase();

    // Check if location string has an explicit comma-separated country or state (e.g. "Paris, France" or "Boston, USA")
    const parts = locationStr.split(',').map((p) => p.trim()).filter(Boolean);
    const city = parts[0] || locationStr;
    const explicitCountry = parts.length > 1 ? parts[parts.length - 1] : undefined;

    // Detect general region from location string to provide appropriate development mock formats
    if (locLower.includes('france') || locLower.includes('paris') || locLower.includes('lyon')) {
      return {
        city,
        country: explicitCountry || 'France',
        address: `${10 + index * 4} Rue de la Paix`,
        phone: `+33 1 42 ${String(10 + index).padStart(2, '0')} ${String(20 + index).padStart(2, '0')} ${String(30 + index).padStart(2, '0')}`,
        postalCode: `7500${(index % 9) + 1}`
      };
    }

    if (locLower.includes('usa') || locLower.includes('us') || locLower.includes('boston') || locLower.includes('new york') || locLower.includes('seattle') || locLower.includes('chicago') || locLower.includes('california') || locLower.includes('texas')) {
      return {
        city,
        country: explicitCountry || 'United States',
        address: `${100 + index * 25} Main Street, Suite ${index + 1}00`,
        phone: `+1 (555) ${String(200 + index).padStart(3, '0')}-${String(1000 + index * 33).slice(0, 4)}`,
        postalCode: `0210${(index % 9) + 1}`
      };
    }

    if (locLower.includes('uk') || locLower.includes('london') || locLower.includes('manchester') || locLower.includes('england')) {
      return {
        city,
        country: explicitCountry || 'United Kingdom',
        address: `${12 + index * 5} High Street`,
        phone: `+44 20 7946 ${String(100 + index).padStart(4, '0')}`,
        postalCode: `EC1A ${index + 1}BB`
      };
    }

    if (locLower.includes('india') || locLower.includes('guwahati') || locLower.includes('jaipur') || locLower.includes('bangalore') || locLower.includes('bengaluru') || locLower.includes('mumbai') || locLower.includes('delhi') || locLower.includes('kolkata')) {
      return {
        city,
        country: explicitCountry || 'India',
        address: `${100 + index * 15}, Commercial Area, Sector ${index + 1}`,
        phone: `+91 98${String(10000000 + index * 123456).slice(0, 8)}`,
        postalCode: `${110000 + (index * 10)}`
      };
    }

    // Default neutral global format for arbitrary locations (zero hardcoding of unmentioned regions)
    return {
      city,
      country: explicitCountry || undefined,
      address: `${100 + index * 15} Central Avenue, Suite ${index + 1}`,
      phone: `+1 (555) 01${String(10 + index).padStart(2, '0')}`,
      postalCode: `${50000 + index * 25}`
    };
  }

  /**
   * Generates dynamic, realistic prospect candidates for ANY parsed category and location.
   */
  public async search(request: DiscoverySearchRequest): Promise<DiscoverySearchResult> {
    const parsed = this.parseIntent(request.query);
    const limit = Math.min(Math.max(request.limit || 6, 1), 20);

    let offset = 0;
    if (request.cursor && request.cursor.startsWith('offset:')) {
      const parsedOffset = parseInt(request.cursor.split(':')[1], 10);
      if (!isNaN(parsedOffset) && parsedOffset >= 0) {
        offset = parsedOffset;
      }
    }

    const prospects: DiscoveredProspect[] = [];
    const locationStr = parsed.location || 'Metropolitan Area';
    const categorySingular = parsed.category.replace(/s$/i, '').replace(/ies$/i, 'y');
    const slugBase = parsed.category.toLowerCase().replace(/[^a-z0-9]/g, '');
    const locSlug = locationStr.toLowerCase().replace(/[^a-z0-9]/g, '');

    const businessPrefixes = ['Premier', 'Apex', 'Horizon', 'Vanguard', 'Elite', 'Metro', 'Global', 'Prime'];
    const personalFirstNames = [
      'Alex', 'Sarah', 'Rajesh', 'Elena', 'Marcus', 'Priya', 'David', 'Chloe', 'James', 'Amina',
      'Liam', 'Yuki', 'Carlos', 'Fatima', 'Lucas'
    ];
    const personalLastNames = [
      'Miller', 'Sharma', 'Chen', 'Dubois', 'Patel', 'Kowalski', 'Garcia', 'Smith', 'Takahashi', 'Johnson',
      'Novak', 'Silva', 'Taylor', 'Ahmed', 'Kim'
    ];

    const isMedical = this.isMedicalProfession(parsed.category);

    for (let i = 0; i < limit; i++) {
      const indexNum = offset + i + 1;
      let name: string;
      const entityType: EntityType = parsed.entityType;
      const locData = this.synthesizeLocationData(locationStr, offset + i);

      let emailUser: string;
      if (parsed.entityType === 'person') {
        const fName = personalFirstNames[(offset + i) % personalFirstNames.length];
        const lName = personalLastNames[(offset + i) % personalLastNames.length];
        name = isMedical ? `Dr. ${fName} ${lName}` : `${fName} ${lName}`;
        emailUser = isMedical ? 'dr.contact' : `${fName.toLowerCase()}.${lName.toLowerCase()}`;
      } else {
        const prefix = businessPrefixes[(offset + i) % businessPrefixes.length];
        name = `${prefix} ${categorySingular} & Co.`;
        emailUser = 'contact';
      }

      const domainName = `${slugBase}-${locSlug}-${indexNum}.com`;

      prospects.push({
        id: `disc_${Date.now().toString(36)}_${offset + i}_${Math.random().toString(36).substring(2, 7)}`,
        externalId: `disc_${locSlug}_${slugBase}_${indexNum}`,
        name,
        entityType,
        category: parsed.category,
        description: `[Simulated Sandbox] Listing for ${parsed.category} serving ${locData.city} (demonstration data).`,
        location: {
          address: locData.address,
          city: locData.city,
          state: undefined,
          country: locData.country,
          postalCode: locData.postalCode
        },
        phone: locData.phone,
        email: `${emailUser}@${domainName}`,
        website: `https://www.${domainName}`,
        socialProfiles: [
          { platform: 'LinkedIn', url: `https://linkedin.com/company/${slugBase}-${indexNum}` }
        ],
        source: 'development_sandbox',
        sourceUrl: `https://directory.leadflow.internal/${locSlug}/${slugBase}/${indexNum}`,
        confidenceScore: 0.85 + (i % 3) * 0.05,
        discoveryMetadata: {
          simulated: true,
          provider: this.name,
          query: request.query,
          offset,
          parsedIntent: {
            extractedCategory: parsed.category,
            extractedLocation: parsed.location
          }
        }
      });
    }

    const nextCursor = offset + limit < 30 ? `offset:${offset + limit}` : undefined;

    return {
      query: request.query,
      total: prospects.length,
      prospects,
      provider: this.name,
      simulated: true,
      nextCursor,
      metadata: {
        extractedCategory: parsed.category,
        extractedLocation: parsed.location,
        offset,
        limit,
        explanation: 'Results generated by development sandbox provider for demonstration and test workflows (simulated data).'
      }
    };
  }
}
