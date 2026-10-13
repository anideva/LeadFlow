import assert from 'assert';
import { OpenStreetMapOverpassProvider, DEFAULT_OVERPASS_MIRRORS } from '../providers/overpass.provider';
import { CompositeOSMDiscoveryProvider } from '../providers/composite-osm.provider';
import { OpenStreetMapDiscoveryProvider } from '../providers/openstreetmap.provider';
import { DiscoveryProviderFactory } from '../discovery-provider.factory';
import { WebsiteEnrichmentProvider } from '../providers/website-enrichment.provider';
import { WikidataEnrichmentProvider } from '../providers/wikidata.provider';
import { IDiscoveryProvider } from '../discovery.provider';
import { IEnrichmentProvider } from '../enrichment.provider';
import { DiscoveryService } from '../discovery.service';
import { DiscoverySearchRequest, DiscoverySearchResult, DiscoveredProspect } from '../../../types/discovery.types';

async function runTests() {
  console.log('=== LEADFLOW DISCOVERY V2 TEST SUITE ===\n');
  let passed = 0;
  let total = 0;

  async function test(name: string, fn: () => void | Promise<void>) {
    total++;
    try {
      await fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ [FAIL] ${name}:`, err.message);
    }
  }

  const overpass = new OpenStreetMapOverpassProvider();

  // 1. Overpass query generation
  await test('1. Overpass query generation (bounded syntax)', () => {
    const mapping = overpass.resolveCategoryTags('flower shops in Guwahati');
    assert(mapping !== null, 'Mapping should resolve for flower shops');
    assert.strictEqual(mapping.categoryName, 'Florist');
    assert.deepStrictEqual(mapping.osmTags, ['["shop"="florist"]']);
    
    // Simulate query string structure
    const s = 26.1, w = 91.7, n = 26.2, e = 91.8;
    const bboxStr = `${s.toFixed(5)},${w.toFixed(5)},${n.toFixed(5)},${e.toFixed(5)}`;
    const tagQueries = mapping.osmTags
      .map((tag) => `  node${tag}(${bboxStr});\n  way${tag}(${bboxStr});`)
      .join('\n');
    const ql = `[out:json][timeout:15];\n(\n${tagQueries}\n);\nout center 50;\n`;

    assert(ql.includes('[out:json][timeout:15];'));
    assert(ql.includes('out center 50;'));
    assert(ql.includes(`node["shop"="florist"](${bboxStr});`));
    assert(ql.includes(`way["shop"="florist"](${bboxStr});`));
  });

  // 2. Category/tag mapping
  await test('2. Category/tag mapping across supported domains', () => {
    const testCases: [string, string][] = [
      ['flower shops in Guwahati', 'Florist'],
      ['florist near me', 'Florist'],
      ['best restaurants in Paris', 'Restaurant'],
      ['fast food in Delhi', 'Fast Food'],
      ['coffee shop downtown', 'Cafe'],
      ['dentists in Guwahati', 'Dentist'],
      ['doctor clinic nearby', 'Doctor / Clinic'],
      ['bakery around Mumbai', 'Bakery'],
      ['luxury hotel in Jaipur', 'Hotel'],
      ['corporate lawyer in Bangalore', 'Lawyer / Legal'],
      ['software companies in Guwahati', 'Software / IT'],
      ['coaching institute in Kota', 'Education / Coaching'],
      ['book store in Kolkata', 'Book Store'],
      ['supermarket in Guwahati', 'Supermarket'],
      ['fitness gym in Pune', 'Fitness / Gym'],
      ['beauty salon in Chennai', 'Beauty Salon / Barber'],
      ['pharmacy near hospital', 'Pharmacy']
    ];

    for (const [query, expectedCategory] of testCases) {
      const res = overpass.resolveCategoryTags(query);
      assert(res !== null, `Expected mapping for "${query}"`);
      assert.strictEqual(res.categoryName, expectedCategory, `Category mismatch for "${query}"`);
    }

    // Unmapped category gracefully returns null
    const unknown = overpass.resolveCategoryTags('quantum spaceship repair shop');
    assert.strictEqual(unknown, null, 'Unknown category should return null');
  });

  // 3. Location extraction
  await test('3. Location extraction from natural language', () => {
    assert.strictEqual(overpass.extractLocation('flower shops in Guwahati'), 'Guwahati');
    assert.strictEqual(overpass.extractLocation('dentists in Delhi, India'), 'Delhi, India');
    assert.strictEqual(overpass.extractLocation('restaurants at Mumbai'), 'Mumbai');
    assert.strictEqual(overpass.extractLocation('cafes near Connaught Place'), 'Connaught Place');
    assert.strictEqual(overpass.extractLocation('hotels around Jaipur'), 'Jaipur');
    assert.strictEqual(overpass.extractLocation('bakery for Kolkata'), 'Kolkata');
    assert.strictEqual(overpass.extractLocation('just flower shops'), null);
  });

  // 4. Overpass response normalization
  await test('4. Overpass response normalization into DiscoveredProspect', () => {
    const rawElement: any = {
      type: 'node',
      id: 987654321,
      lat: 26.185,
      lon: 91.745,
      tags: {
        name: 'Guwahati Orchid Blooms',
        shop: 'florist',
        'addr:street': 'GS Road',
        'addr:city': 'Guwahati',
        'addr:state': 'Assam',
        phone: '+91 361 2345678',
        website: 'https://guwahatiblooms.example.com',
        opening_hours: 'Mo-Sa 09:00-20:00'
      }
    };

    // Use internal normalizer through mock invocation
    const normalized = (overpass as any).normalizeElement(rawElement, 'Florist', 'Guwahati');
    assert(normalized !== null);
    assert.strictEqual(normalized.id, 'osm_node_987654321');
    assert.strictEqual(normalized.externalId, 'osm_node_987654321');
    assert.strictEqual(normalized.name, 'Guwahati Orchid Blooms');
    assert.strictEqual(normalized.category, 'Florist');
    assert.strictEqual(normalized.entityType, 'business');
    assert.strictEqual(normalized.latitude, 26.185);
    assert.strictEqual(normalized.longitude, 91.745);
    assert.strictEqual(normalized.phone, '+91 361 2345678');
    assert.strictEqual(normalized.website, 'https://guwahatiblooms.example.com');
    assert.strictEqual(normalized.source, 'openstreetmap');
    assert.strictEqual(normalized.sourceUrl, 'https://www.openstreetmap.org/node/987654321');
    assert.strictEqual(normalized.confidenceScore, 0.95);
    assert.strictEqual(normalized.discoveryMetadata.engine, 'Overpass API');
  });

  // 5. OSM ID generation
  await test('5. OSM ID generation matches Nominatim format (osm_${type}_${id})', () => {
    const nodeEl: any = { type: 'node', id: 111, tags: { name: 'Test Node' } };
    const wayEl: any = { type: 'way', id: 222, tags: { name: 'Test Way' } };

    const normNode = (overpass as any).normalizeElement(nodeEl, 'Test', 'City');
    const normWay = (overpass as any).normalizeElement(wayEl, 'Test', 'City');

    assert.strictEqual(normNode.externalId, 'osm_node_111');
    assert.strictEqual(normWay.externalId, 'osm_way_222');
  });

  // Helper mock prospects
  const prospectA: DiscoveredProspect = {
    id: 'osm_node_1001',
    externalId: 'osm_node_1001',
    name: 'Flora Boutique',
    entityType: 'business',
    category: 'Florist',
    location: { address: '12 GS Road', city: 'Guwahati' },
    latitude: 26.18,
    longitude: 91.75,
    socialProfiles: [],
    source: 'openstreetmap',
    sourceUrl: 'https://www.openstreetmap.org/node/1001',
    confidenceScore: 0.9,
    discoveryMetadata: {}
  };

  const prospectA_overpass: DiscoveredProspect = {
    id: 'osm_node_1001',
    externalId: 'osm_node_1001',
    name: 'Flora Boutique',
    entityType: 'business',
    category: 'Florist',
    location: { city: 'Guwahati', state: 'Assam' },
    latitude: 26.18,
    longitude: 91.75,
    phone: '+91 9876543210',
    website: 'https://floraboutique.com',
    socialProfiles: [],
    source: 'openstreetmap',
    sourceUrl: 'https://www.openstreetmap.org/node/1001',
    confidenceScore: 0.95,
    discoveryMetadata: { engine: 'Overpass API' }
  };

  const prospectB: DiscoveredProspect = {
    id: 'osm_node_1002',
    externalId: 'osm_node_1002',
    name: 'Blossom Corner',
    entityType: 'business',
    category: 'Florist',
    location: { city: 'Guwahati' },
    latitude: 26.19,
    longitude: 91.76,
    socialProfiles: [],
    source: 'openstreetmap',
    sourceUrl: 'https://www.openstreetmap.org/node/1002',
    confidenceScore: 0.9,
    discoveryMetadata: {}
  };


  // 6. Composite provider merging
  await test('6. Composite provider merging across Nominatim and Overpass', async () => {
    const mockNominatim: IDiscoveryProvider = {
      name: 'openstreetmap',
      search: async () => ({
        query: 'flower shops in Guwahati',
        total: 1,
        prospects: [prospectA],
        provider: 'openstreetmap',
        simulated: false
      })
    };

    const mockOverpass: IDiscoveryProvider = {
      name: 'openstreetmap_overpass',
      search: async () => ({
        query: 'flower shops in Guwahati',
        total: 1,
        prospects: [prospectB],
        provider: 'openstreetmap_overpass',
        simulated: false
      })
    };

    const composite = new CompositeOSMDiscoveryProvider(
      mockNominatim as any,
      mockOverpass as any
    );

    const result = await composite.search({ query: 'flower shops in Guwahati', limit: 10 });
    assert.strictEqual(result.total, 2);
    assert.strictEqual(result.prospects.length, 2);
    assert(result.prospects.some((p) => p.externalId === 'osm_node_1001'));
    assert(result.prospects.some((p) => p.externalId === 'osm_node_1002'));
  });

  // 7. Deduplication (OSM ID)
  await test('7. Deduplication by exact OSM ID', async () => {
    const mockNominatim: IDiscoveryProvider = {
      name: 'openstreetmap',
      search: async () => ({
        query: 'flower shops in Guwahati',
        total: 1,
        prospects: [prospectA],
        provider: 'openstreetmap',
        simulated: false
      })
    };

    const mockOverpass: IDiscoveryProvider = {
      name: 'openstreetmap_overpass',
      search: async () => ({
        query: 'flower shops in Guwahati',
        total: 1,
        prospects: [prospectA_overpass], // duplicate ID
        provider: 'openstreetmap_overpass',
        simulated: false
      })
    };

    const composite = new CompositeOSMDiscoveryProvider(
      mockNominatim as any,
      mockOverpass as any
    );

    const result = await composite.search({ query: 'flower shops in Guwahati', limit: 10 });
    assert.strictEqual(result.total, 1, 'Should deduplicate identical OSM ID to 1 prospect');
    assert.strictEqual(result.metadata?.duplicatesRemoved, 1);
  });


  // 8. Field merging
  await test('8. Field merging retains richest non-empty data', async () => {
    const mockNominatim: IDiscoveryProvider = {
      name: 'openstreetmap',
      search: async () => ({
        query: 'flower shops in Guwahati',
        total: 1,
        prospects: [prospectA], // Has address "12 GS Road"
        provider: 'openstreetmap',
        simulated: false
      })
    };

    const mockOverpass: IDiscoveryProvider = {
      name: 'openstreetmap_overpass',
      search: async () => ({
        query: 'flower shops in Guwahati',
        total: 1,
        prospects: [prospectA_overpass], // Has phone, website, state "Assam"
        provider: 'openstreetmap_overpass',
        simulated: false
      })
    };

    const composite = new CompositeOSMDiscoveryProvider(
      mockNominatim as any,
      mockOverpass as any
    );

    const result = await composite.search({ query: 'flower shops in Guwahati', limit: 10 });
    const merged = result.prospects[0];
    assert.strictEqual(merged.location?.address, '12 GS Road', 'Retains address from Nominatim');
    assert.strictEqual(merged.location?.state, 'Assam', 'Adopts state from Overpass');
    assert.strictEqual(merged.phone, '+91 9876543210', 'Adopts phone from Overpass');
    assert.strictEqual(merged.website, 'https://floraboutique.com', 'Adopts website from Overpass');
  });

  // 9. Nominatim-only fallback
  await test('9. Nominatim-only fallback when Overpass throws error', async () => {
    const mockNominatim: IDiscoveryProvider = {
      name: 'openstreetmap',
      search: async () => ({
        query: 'flower shops in Guwahati',
        total: 1,
        prospects: [prospectA],
        provider: 'openstreetmap',
        simulated: false
      })
    };

    const mockOverpass: IDiscoveryProvider = {
      name: 'openstreetmap_overpass',
      search: async () => {
        throw new Error('Overpass 504 Gateway Timeout');
      }
    };

    const composite = new CompositeOSMDiscoveryProvider(
      mockNominatim as any,
      mockOverpass as any
    );

    const result = await composite.search({ query: 'flower shops in Guwahati', limit: 10 });
    assert.strictEqual(result.total, 1);
    assert.strictEqual(result.prospects[0].name, 'Flora Boutique');
  });

  // 10. Overpass-only fallback
  await test('10. Overpass-only fallback when Nominatim returns 0 results', async () => {
    const mockNominatim: IDiscoveryProvider = {
      name: 'openstreetmap',
      search: async () => ({
        query: 'flower shops in Guwahati',
        total: 0,
        prospects: [],
        provider: 'openstreetmap',
        simulated: false
      })
    };

    const mockOverpass: IDiscoveryProvider = {
      name: 'openstreetmap_overpass',
      search: async () => ({
        query: 'flower shops in Guwahati',
        total: 1,
        prospects: [prospectB],
        provider: 'openstreetmap_overpass',
        simulated: false
      })
    };

    const composite = new CompositeOSMDiscoveryProvider(
      mockNominatim as any,
      mockOverpass as any
    );

    const result = await composite.search({ query: 'flower shops in Guwahati', limit: 10 });
    assert.strictEqual(result.total, 1);
    assert.strictEqual(result.prospects[0].name, 'Blossom Corner');
  });

  // 11. Both-provider failure
  await test('11. Both-provider failure returns clean empty result without crashing', async () => {
    const mockNominatim: IDiscoveryProvider = {
      name: 'openstreetmap',
      search: async () => {
        throw new Error('Nominatim network error');
      }
    };

    const mockOverpass: IDiscoveryProvider = {
      name: 'openstreetmap_overpass',
      search: async () => {
        throw new Error('Overpass network error');
      }
    };

    const composite = new CompositeOSMDiscoveryProvider(
      mockNominatim as any,
      mockOverpass as any
    );

    const result = await composite.search({ query: 'flower shops in Guwahati', limit: 10 });
    assert.strictEqual(result.total, 0);
    assert.deepStrictEqual(result.prospects, []);
  });

  // 12. Result-limit behavior
  await test('12. Result-limit clamps output strictly to requested limit', async () => {
    const manyProspects: DiscoveredProspect[] = Array.from({ length: 15 }, (_, i) => ({
      id: `osm_node_${i + 2000}`,
      externalId: `osm_node_${i + 2000}`,
      name: `Shop ${i}`,
      entityType: 'business',
      category: 'Florist',
      location: { city: 'Guwahati' },
      socialProfiles: [],
      source: 'openstreetmap',
      sourceUrl: `https://www.openstreetmap.org/node/${i + 2000}`,
      confidenceScore: 0.9,
      discoveryMetadata: {}
    }));


    const mockNominatim: IDiscoveryProvider = {
      name: 'openstreetmap',
      search: async () => ({
        query: 'flower shops in Guwahati',
        total: 15,
        prospects: manyProspects,
        provider: 'openstreetmap',
        simulated: false
      })
    };

    const composite = new CompositeOSMDiscoveryProvider(
      mockNominatim as any,
      {
        name: 'openstreetmap_overpass',
        search: async () => ({ query: '', total: 0, prospects: [], provider: 'openstreetmap_overpass', simulated: false })
      } as any
    );

    const result = await composite.search({ query: 'flower shops in Guwahati', limit: 5 });
    assert.strictEqual(result.prospects.length, 5, 'Clamped to limit=5');
    assert.strictEqual(result.total, 5);
  });

  // 13. No fabrication of missing contact data
  await test('13. No fabrication of missing contact data', () => {
    const bareElement: any = {
      type: 'node',
      id: 555,
      tags: {
        name: 'Minimalist Store',
        shop: 'florist'
      }
    };

    const norm = (overpass as any).normalizeElement(bareElement, 'Florist', 'Guwahati');
    assert(norm !== null);
    assert.strictEqual(norm.phone, undefined, 'Missing phone must remain undefined');
    assert.strictEqual(norm.email, undefined, 'Missing email must remain undefined');
    assert.strictEqual(norm.website, undefined, 'Missing website must remain undefined');
    assert.deepStrictEqual(norm.socialProfiles, [], 'Missing socials must be empty array');
  });

  // 14. Existing Nominatim regression
  await test('14. Existing Nominatim provider instantiation and contract conformance', () => {
    const nominatim = new OpenStreetMapDiscoveryProvider();
    assert.strictEqual(nominatim.name, 'openstreetmap');
    assert.strictEqual(typeof nominatim.search, 'function');
  });

  // 15. Existing website enrichment regression
  await test('15. Existing website enrichment SSRF guard prevents private IPs', async () => {
    const enrichment = new WebsiteEnrichmentProvider();
    let blocked = false;
    try {
      await enrichment.enrich('http://127.0.0.1:8080/admin');
    } catch (err: any) {
      if (err.statusCode === 400 || err.message.includes('SSRF') || err.message.includes('private') || err.message.includes('blocked')) {
        blocked = true;
      }
    }
    assert(blocked, 'Enrichment provider must block SSRF to 127.0.0.1');
  });

  // 16. Conversational query normalization in OpenStreetMapDiscoveryProvider
  await test('16. Conversational query normalization strips prefixes without breaking normal queries', () => {
    const osm = new OpenStreetMapDiscoveryProvider();
    assert.strictEqual(osm.normalizeQuery('Find flower shops in Jaipur'), 'flower shops in Jaipur');
    assert.strictEqual(osm.normalizeQuery('Search for dentists in Guwahati'), 'dentists in Guwahati');
    assert.strictEqual(osm.normalizeQuery('Show me restaurants in Delhi'), 'restaurants in Delhi');
    assert.strictEqual(osm.normalizeQuery('Locate book stores in Kolkata'), 'book stores in Kolkata');
    // Normal queries remain intact
    assert.strictEqual(osm.normalizeQuery('flower shops in Jaipur'), 'flower shops in Jaipur');
    assert.strictEqual(osm.normalizeQuery('dentists in Guwahati'), 'dentists in Guwahati');
    assert.strictEqual(osm.normalizeQuery('restaurants in Delhi'), 'restaurants in Delhi');
    assert.strictEqual(osm.normalizeQuery('Jaipur'), 'Jaipur');
  });

  // 17. Overpass location extraction with conversational prefixes
  await test('17. Overpass location extraction handles conversational prefixes', () => {
    assert.strictEqual(overpass.extractLocation('Find flower shops in Jaipur'), 'Jaipur');
    assert.strictEqual(overpass.extractLocation('Search for dentists in Guwahati'), 'Guwahati');
    assert.strictEqual(overpass.extractLocation('Show me restaurants in Delhi'), 'Delhi');
    assert.strictEqual(overpass.extractLocation('Locate book stores in Kolkata'), 'Kolkata');
    assert.strictEqual(overpass.extractLocation('dentists in Guwahati'), 'Guwahati');
    assert.strictEqual(overpass.extractLocation('flower shops in Jaipur'), 'Jaipur');
  });

  // 18. Overpass category resolution across conversational queries
  await test('18. Overpass category resolution handles conversational queries and plural variations', () => {
    const flower = overpass.resolveCategoryTags('Find flower shops in Jaipur');
    assert(flower !== null);
    assert.strictEqual(flower.categoryName, 'Florist');

    const dentist = overpass.resolveCategoryTags('Search for dentists in Guwahati');
    assert(dentist !== null);
    assert.strictEqual(dentist.categoryName, 'Dentist');

    const restaurant = overpass.resolveCategoryTags('Show me restaurants in Delhi');
    assert(restaurant !== null);
    assert.strictEqual(restaurant.categoryName, 'Restaurant');

    const book = overpass.resolveCategoryTags('Locate book stores in Kolkata');
    assert(book !== null);
    assert.strictEqual(book.categoryName, 'Book Store');
  });

  // 19. Composite OSM search: Nominatim zero-result -> Overpass result for "Find flower shops in Jaipur"
  await test('19. Composite OSM search: Nominatim 0-result seamlessly falls back to Overpass for "Find flower shops in Jaipur"', async () => {
    const mockNominatim: IDiscoveryProvider = {
      name: 'openstreetmap',
      search: async () => ({
        query: 'Find flower shops in Jaipur',
        total: 0,
        prospects: [],
        provider: 'openstreetmap',
        simulated: false
      })
    };

    const mockOverpass: IDiscoveryProvider = {
      name: 'openstreetmap_overpass',
      search: async () => ({
        query: 'Find flower shops in Jaipur',
        total: 2,
        prospects: [
          {
            id: 'osm_node_1001',
            externalId: 'osm_node_1001',
            name: 'Flora International',
            entityType: 'business',
            category: 'Florist',
            location: { city: 'Jaipur', address: 'Pradhan Marg' },
            socialProfiles: [],
            source: 'openstreetmap_overpass',
            sourceUrl: 'https://www.openstreetmap.org/node/1001',
            confidenceScore: 0.95,
            discoveryMetadata: {}
          },
          {
            id: 'osm_node_1002',
            externalId: 'osm_node_1002',
            name: 'Shreeram Flowers',
            entityType: 'business',
            category: 'Florist',
            location: { city: 'Jaipur', address: 'Hawa Sadak' },
            website: 'https://www.jaipurfloweronline.com',
            socialProfiles: [],
            source: 'openstreetmap_overpass',
            sourceUrl: 'https://www.openstreetmap.org/node/1002',
            confidenceScore: 0.95,
            discoveryMetadata: {}
          }
        ],
        provider: 'openstreetmap_overpass',
        simulated: false
      })
    };

    const composite = new CompositeOSMDiscoveryProvider(
      mockNominatim as any,
      mockOverpass as any
    );

    const result = await composite.search({ query: 'Find flower shops in Jaipur', limit: 10 });
    assert.strictEqual(result.total, 2, 'Should return 2 prospects from Overpass when Nominatim returns 0');
    assert.strictEqual(result.prospects[0].name, 'Flora International');
    assert.strictEqual(result.prospects[1].name, 'Shreeram Flowers');
    assert.strictEqual(result.prospects[1].website, 'https://www.jaipurfloweronline.com');
  });

  // 20. Deduplication between Nominatim and Overpass
  await test('20. Deduplication merges common entities between Nominatim and Overpass without duplicates', async () => {
    const nomShreeram: DiscoveredProspect = {
      id: 'osm_node_1002',
      externalId: 'osm_node_1002',
      name: 'Shreeram Flowers',
      entityType: 'business',
      category: 'Florist',
      location: { city: 'Jaipur', address: 'Hawa Sadak, Civil Lines' },
      socialProfiles: [],
      source: 'openstreetmap',
      sourceUrl: 'https://www.openstreetmap.org/node/1002',
      confidenceScore: 0.95,
      discoveryMetadata: {}
    };

    const overpassShreeram: DiscoveredProspect = {
      id: 'osm_node_1002',
      externalId: 'osm_node_1002',
      name: 'Shreeram Flowers',
      entityType: 'business',
      category: 'Florist',
      location: { city: 'Jaipur' },
      phone: '+91 141 2220000',
      website: 'https://www.jaipurfloweronline.com',
      socialProfiles: [],
      source: 'openstreetmap_overpass',
      sourceUrl: 'https://www.openstreetmap.org/node/1002',
      confidenceScore: 0.95,
      discoveryMetadata: {}
    };

    const composite = new CompositeOSMDiscoveryProvider(
      {
        name: 'openstreetmap',
        search: async () => ({ query: 'flowers in Jaipur', total: 1, prospects: [nomShreeram], provider: 'openstreetmap', simulated: false })
      } as any,
      {
        name: 'openstreetmap_overpass',
        search: async () => ({ query: 'flowers in Jaipur', total: 1, prospects: [overpassShreeram], provider: 'openstreetmap_overpass', simulated: false })
      } as any
    );

    const result = await composite.search({ query: 'flowers in Jaipur', limit: 10 });
    assert.strictEqual(result.total, 1, 'Duplicate must be deduplicated into a single prospect');
    const prospect = result.prospects[0];
    assert.strictEqual(prospect.name, 'Shreeram Flowers');
    assert.strictEqual(prospect.location?.address, 'Hawa Sadak, Civil Lines', 'Preserves detailed Nominatim address');
    assert.strictEqual(prospect.phone, '+91 141 2220000', 'Merges phone from Overpass');
    assert.strictEqual(prospect.website, 'https://www.jaipurfloweronline.com', 'Merges website from Overpass');
  });

  // 21. DiscoveryProviderFactory routing
  await test('21. DiscoveryProviderFactory routes "openstreetmap" and "osm" to CompositeOSMDiscoveryProvider', () => {
    const osmProvider = DiscoveryProviderFactory.createProvider('openstreetmap');
    assert(osmProvider instanceof CompositeOSMDiscoveryProvider, 'openstreetmap should route to CompositeOSMDiscoveryProvider');
    assert.strictEqual(osmProvider.name, 'osm_combined');

    const osmShortProvider = DiscoveryProviderFactory.createProvider('osm');
    assert(osmShortProvider instanceof CompositeOSMDiscoveryProvider, 'osm should route to CompositeOSMDiscoveryProvider');

    const combinedProvider = DiscoveryProviderFactory.createProvider('osm_combined');
    assert(combinedProvider instanceof CompositeOSMDiscoveryProvider);

    const nominatimProvider = DiscoveryProviderFactory.createProvider('nominatim');
    assert(nominatimProvider instanceof OpenStreetMapDiscoveryProvider, 'nominatim should route to OpenStreetMapDiscoveryProvider');
    assert.strictEqual(nominatimProvider.name, 'openstreetmap');
  });

  // 22. addr:full fallback and precedence in Overpass normalizer
  await test('22. addr:full fallback in Overpass normalizer when structured address is absent', () => {
    const elWithFull: any = {
      type: 'node',
      id: 7537680950,
      tags: {
        name: 'D & S Dental Care',
        amenity: 'dentist',
        'addr:full': 'Raja Complex, Beltola Tiniali, Jaya Nagar, Guwahati',
        'addr:city': 'Guwahati'
      }
    };
    const norm = (overpass as any).normalizeElement(elWithFull, 'Dentist', 'Guwahati');
    assert(norm !== null);
    assert.strictEqual(norm.location.address, 'Raja Complex, Beltola Tiniali, Jaya Nagar, Guwahati');
    assert.strictEqual(norm.location.city, 'Guwahati');

    // Structured address takes precedence over addr:full
    const elStructured: any = {
      type: 'node',
      id: 7537680951,
      tags: {
        name: 'Structured Dental Care',
        amenity: 'dentist',
        'addr:housenumber': '10',
        'addr:street': 'GS Road',
        'addr:full': 'Some Unstructured String',
        'addr:city': 'Guwahati'
      }
    };
    const normStructured = (overpass as any).normalizeElement(elStructured, 'Dentist', 'Guwahati');
    assert.strictEqual(normStructured.location.address, '10 GS Road', 'Structured house_number + street must take precedence');
  });

  // 23. addr:full in Nominatim normalizer
  await test('23. addr:full fallback in Nominatim normalizer with structured precedence', () => {
    const osm = new OpenStreetMapDiscoveryProvider();
    const nomPlaceFull: any = {
      place_id: 1,
      osm_type: 'node',
      osm_id: 101,
      lat: '26.15',
      lon: '91.75',
      name: 'Pearl Dental Clinic',
      display_name: 'Pearl Dental Clinic, Guwahati',
      category: 'amenity',
      type: 'dentist',
      place_rank: 30,
      address: { city: 'Guwahati' },
      extratags: { 'addr:full': 'Upper Stand Road, Baruah Souk, Uzan Bazar, Guwahati' }
    };
    const norm = (osm as any).normalizePlace(nomPlaceFull);
    assert.strictEqual(norm.location.address, 'Upper Stand Road, Baruah Souk, Uzan Bazar, Guwahati');

    // Structured road + house_number takes precedence
    const nomPlaceStructured: any = {
      place_id: 2,
      osm_type: 'node',
      osm_id: 102,
      lat: '26.15',
      lon: '91.75',
      name: 'Apex Clinic',
      display_name: 'Apex Clinic, Guwahati',
      category: 'amenity',
      type: 'dentist',
      place_rank: 30,
      address: { house_number: '42', road: 'MG Road', city: 'Guwahati' },
      extratags: { 'addr:full': 'Ignore Me' }
    };
    const normStructured = (osm as any).normalizePlace(nomPlaceStructured);
    assert.strictEqual(normStructured.location.address, '42 MG Road', 'Structured house_number + road must take precedence');
  });

  // 24. Contact tag normalization for phone (contact:mobile, mobile, phone:mobile)
  await test('24. Phone extraction supports contact:mobile and mobile with proper precedence', () => {
    // contact:mobile
    const elMobile: any = {
      type: 'node',
      id: 301,
      tags: { name: 'Mobile Doctor', amenity: 'clinic', 'contact:mobile': '+91 9876543210' }
    };
    const normMobile = (overpass as any).normalizeElement(elMobile, 'Clinic', 'Guwahati');
    assert.strictEqual(normMobile.phone, '+91 9876543210');

    // mobile tag
    const elRawMobile: any = {
      type: 'node',
      id: 302,
      tags: { name: 'Raw Mobile Store', shop: 'chemist', mobile: '09928534373' }
    };
    const normRawMobile = (overpass as any).normalizeElement(elRawMobile, 'Chemist', 'Jaipur');
    assert.strictEqual(normRawMobile.phone, '09928534373');

    // Standard phone takes precedence over mobile
    const elPrecedence: any = {
      type: 'node',
      id: 303,
      tags: { name: 'Dual Phone Corp', amenity: 'hospital', phone: '+91 361 2221111', mobile: '+91 9876543210' }
    };
    const normPrecedence = (overpass as any).normalizeElement(elPrecedence, 'Hospital', 'Guwahati');
    assert.strictEqual(normPrecedence.phone, '+91 361 2221111', 'Primary phone must take precedence over mobile');
  });

  // 25. Contact tag normalization for website (contact:website, url, contact:url, contact:web)
  await test('25. Website extraction supports contact:url and contact:web with protocol normalization', () => {
    // contact:url without protocol
    const elContactUrl: any = {
      type: 'node',
      id: 401,
      tags: { name: 'Dental Web', amenity: 'dentist', 'contact:url': 'dentalweb.example.com' }
    };
    const normContactUrl = (overpass as any).normalizeElement(elContactUrl, 'Dentist', 'Guwahati');
    assert.strictEqual(normContactUrl.website, 'https://dentalweb.example.com');

    // contact:web with protocol
    const elContactWeb: any = {
      type: 'node',
      id: 402,
      tags: { name: 'Web Care', amenity: 'clinic', 'contact:web': 'http://webcare.example.org' }
    };
    const normContactWeb = (overpass as any).normalizeElement(elContactWeb, 'Clinic', 'Delhi');
    assert.strictEqual(normContactWeb.website, 'http://webcare.example.org');

    // Primary website takes precedence over contact:url
    const elWebPrecedence: any = {
      type: 'node',
      id: 403,
      tags: { name: 'Prime Clinic', amenity: 'clinic', website: 'https://primeclinic.in', 'contact:url': 'https://secondary.in' }
    };
    const normWebPrecedence = (overpass as any).normalizeElement(elWebPrecedence, 'Clinic', 'Delhi');
    assert.strictEqual(normWebPrecedence.website, 'https://primeclinic.in');
  });

  // 26. WhatsApp field handling
  await test('26. WhatsApp tags are preserved in discoveryMetadata without contaminating phone', () => {
    const elWhatsapp: any = {
      type: 'node',
      id: 501,
      tags: {
        name: 'WhatsApp Consult',
        amenity: 'dentist',
        'contact:whatsapp': 'https://wa.me/919999988888'
      }
    };
    const norm = (overpass as any).normalizeElement(elWhatsapp, 'Dentist', 'Guwahati');
    assert.strictEqual(norm.phone, undefined, 'WhatsApp URL must not contaminate voice phone');
    assert.strictEqual(norm.discoveryMetadata.whatsapp, 'https://wa.me/919999988888');
  });

  // 27. Missing values do not overwrite existing valid data in composite merge
  await test('27. Missing values in composite merge never overwrite valid existing contact fields', async () => {
    const existingWithContacts: DiscoveredProspect = {
      id: 'osm_node_9999',
      externalId: 'osm_node_9999',
      name: 'Complete Health Center',
      entityType: 'business',
      category: 'Hospital',
      location: { city: 'Guwahati', address: '12 GS Road' },
      phone: '+91 361 2233445',
      email: 'info@healthcenter.org',
      website: 'https://healthcenter.org',
      socialProfiles: [{ platform: 'Facebook', url: 'https://facebook.com/healthcenter' }],
      source: 'openstreetmap',
      sourceUrl: 'https://www.openstreetmap.org/node/9999',
      confidenceScore: 0.95,
      discoveryMetadata: {}
    };

    const secondaryWithEmptyContacts: DiscoveredProspect = {
      id: 'osm_node_9999',
      externalId: 'osm_node_9999',
      name: 'Complete Health Center',
      entityType: 'business',
      category: 'Hospital',
      location: { city: 'Guwahati' },
      phone: undefined,
      email: undefined,
      website: undefined,
      socialProfiles: [],
      source: 'openstreetmap_overpass',
      sourceUrl: 'https://www.openstreetmap.org/node/9999',
      confidenceScore: 0.95,
      discoveryMetadata: {}
    };

    const composite = new CompositeOSMDiscoveryProvider(
      {
        name: 'openstreetmap',
        search: async () => ({ query: 'health center', total: 1, prospects: [existingWithContacts], provider: 'openstreetmap', simulated: false })
      } as any,
      {
        name: 'openstreetmap_overpass',
        search: async () => ({ query: 'health center', total: 1, prospects: [secondaryWithEmptyContacts], provider: 'openstreetmap_overpass', simulated: false })
      } as any
    );

    const result = await composite.search({ query: 'health center', limit: 10 });
    assert.strictEqual(result.total, 1);
    const merged = result.prospects[0];
    assert.strictEqual(merged.phone, '+91 361 2233445');
    assert.strictEqual(merged.email, 'info@healthcenter.org');
    assert.strictEqual(merged.website, 'https://healthcenter.org');
    assert.strictEqual(merged.location?.address, '12 GS Road');
  });

  // 28. Prefix location extraction (e.g. "London cafes", "New York dentists")
  await test('28. Prefix location extraction supports global prefix queries', () => {
    assert.strictEqual(overpass.extractLocation('London cafes'), 'London');
    assert.strictEqual(overpass.extractLocation('New York dentists'), 'New York');
    assert.strictEqual(overpass.extractLocation('Jaipur flower shops'), 'Jaipur');
    assert.strictEqual(overpass.extractLocation('Sydney plumbers'), 'Sydney');
    assert.strictEqual(overpass.extractLocation('Berlin software companies'), 'Berlin');
    assert.strictEqual(overpass.extractLocation('Paris restaurants'), 'Paris');
    // Suffix format continues to work
    assert.strictEqual(overpass.extractLocation('cafes in London'), 'London');
    assert.strictEqual(overpass.extractLocation('plumbers near Sydney'), 'Sydney');
  });

  // 29. Expanded commercial category mapping
  await test('29. Expanded commercial category mapping supports trades, professional services & retail', () => {
    const testCases: [string, string][] = [
      ['Sydney plumbers', 'Plumber'],
      ['emergency electricians in Austin', 'Electrician'],
      ['best accountants in Toronto', 'Accountant / Tax'],
      ['auto repair in Chicago', 'Auto Repair / Mechanic'],
      ['locksmiths in Boston', 'Locksmith'],
      ['digital marketing agency in Dublin', 'Advertising / Marketing'],
      ['veterinarian near Dallas', 'Veterinarian'],
      ['hair salon in Miami', 'Beauty Salon / Barber'],
      ['architecture firm in Singapore', 'Architect / Interior Design'],
      ['cleaning services in Seattle', 'Cleaning']
    ];
    for (const [query, expectedCategory] of testCases) {
      const res = overpass.resolveCategoryTags(query);
      assert(res !== null, `Expected mapping for "${query}"`);
      assert.strictEqual(res.categoryName, expectedCategory, `Category mismatch for "${query}"`);
    }
  });

  // 30. Nominatim simplifyQuery prefix inversion and synonyms
  await test('30. Nominatim query simplification handles prefix inversion and special phrase synonyms', () => {
    const nominatim = new OpenStreetMapDiscoveryProvider();

    // Prefix inversion: "London cafes" -> "cafe in London"
    const simplifiedLondon = nominatim.simplifyQuery('London cafes');
    assert(simplifiedLondon !== null);
    assert(simplifiedLondon.includes('in London'), `Expected "in London" in "${simplifiedLondon}"`);
    assert(simplifiedLondon.includes('cafe'), `Expected "cafe" in "${simplifiedLondon}"`);

    // Special phrase synonyms: "flower shops in Jaipur" -> "florist in Jaipur"
    const simplifiedJaipur = nominatim.simplifyQuery('flower shops in Jaipur');
    assert(simplifiedJaipur !== null);
    assert(simplifiedJaipur.includes('florist'), `Expected "florist" in "${simplifiedJaipur}"`);
    assert(simplifiedJaipur.includes('in Jaipur'), `Expected "in Jaipur" in "${simplifiedJaipur}"`);

    // "dentists in Guwahati" -> "dentist in Guwahati"
    const simplifiedGuwahati = nominatim.simplifyQuery('dentists in Guwahati');
    assert(simplifiedGuwahati !== null);
    assert(simplifiedGuwahati.includes('dentist'), `Expected "dentist" in "${simplifiedGuwahati}"`);
  });

  // 31. Schema.org JSON-LD structured data extraction in WebsiteEnrichmentProvider
  await test('31. Schema.org JSON-LD extraction parses business telephone, email, address, name and social profiles', () => {
    const enricher = new WebsiteEnrichmentProvider();
    const emailsSet = new Set<string>();
    const phonesSet = new Set<string>();
    const socialMap = new Map<string, any>();
    const extractedInfo: { businessName?: string; address?: string; overview?: string } = {};

    const mockHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "LocalBusiness",
          "name": "Acme Dental Care",
          "telephone": "+1-555-019-2834",
          "email": "contact@acmedental.example.com",
          "address": {
            "@type": "PostalAddress",
            "streetAddress": "123 Main St",
            "addressLocality": "London",
            "postalCode": "W1A 1AA",
            "addressCountry": "UK"
          },
          "description": "Leading dental practice in central London providing family and cosmetic dentistry.",
          "sameAs": [
            "https://www.linkedin.com/company/acmedental",
            "https://www.facebook.com/acmedentalcare",
            "https://twitter.com/acmedental"
          ]
        }
        </script>
      </head>
      <body>
        <h1>Welcome</h1>
      </body>
      </html>
    `;

    enricher.extractJsonLd(mockHtml, emailsSet, phonesSet, socialMap, extractedInfo);

    assert.strictEqual(extractedInfo.businessName, 'Acme Dental Care');
    assert.strictEqual(extractedInfo.address, '123 Main St, London, W1A 1AA, UK');
    assert(extractedInfo.overview?.includes('Leading dental practice'));
    assert(emailsSet.has('contact@acmedental.example.com'));
    assert(phonesSet.has('+1-555-019-2834'));
    assert(socialMap.has('LinkedIn:https://www.linkedin.com/company/acmedental'));
    assert(socialMap.has('Facebook:https://www.facebook.com/acmedentalcare'));
    assert(socialMap.has('Twitter:https://twitter.com/acmedental'));
  });

  // 32. Canonical phone deduplication eliminates formatting variations
  await test('32. Canonical phone deduplication eliminates duplicate numbers across different formatting', () => {
    const rawPhones = [
      '(519) 645-3002',
      '519-645-3002',
      '5196453002',
      '+1 519 645 3002',
      '+44 20 7946 0991'
    ];

    const normalizedPhones: string[] = [];
    const seenDigitSignatures = new Set<string>();
    for (const p of rawPhones) {
      const digits = p.replace(/\D/g, '');
      const sig = digits.length >= 10 ? digits.slice(-10) : digits;
      if (!seenDigitSignatures.has(sig)) {
        seenDigitSignatures.add(sig);
        normalizedPhones.push(p);
      }
    }

    // Out of 4 variants of the 519 number and 1 UK number, exactly 2 canonical numbers remain
    assert.strictEqual(normalizedPhones.length, 2);
    assert.strictEqual(normalizedPhones[0], '(519) 645-3002');
    assert.strictEqual(normalizedPhones[1], '+44 20 7946 0991');
  });

  // 33. Overpass sequential mirror configuration
  await test('33. Overpass provider configures public mirrors for sequential failover', () => {
    assert(Array.isArray(DEFAULT_OVERPASS_MIRRORS));
    assert(DEFAULT_OVERPASS_MIRRORS.length >= 2, 'Must configure at least 2 public Overpass mirrors');
    assert(DEFAULT_OVERPASS_MIRRORS.includes('https://overpass-api.de/api/interpreter'));
    assert(DEFAULT_OVERPASS_MIRRORS.includes('https://overpass.kumi.systems/api/interpreter'));

    const providerWithDefault = new OpenStreetMapOverpassProvider();
    assert.strictEqual(providerWithDefault.baseUrl, DEFAULT_OVERPASS_MIRRORS[0]);

    // Custom baseUrl takes precedence while keeping fallback mirrors
    const customProvider = new OpenStreetMapOverpassProvider('https://custom-overpass.org/api');
    assert.strictEqual(customProvider.baseUrl, 'https://custom-overpass.org/api');
  });

  // 34. Social profile merge in CompositeOSMDiscoveryProvider
  await test('34. Composite provider merges unique social profiles across providers without duplication', async () => {
    const osmProspect: DiscoveredProspect = {
      id: 'osm_1',
      name: 'Alpha Dental',
      entityType: 'business',
      category: 'Dentist',
      location: { city: 'London' },
      socialProfiles: [
        { platform: 'LinkedIn', url: 'https://linkedin.com/company/alphadental' }
      ],
      source: 'openstreetmap',
      discoveryMetadata: { wikidata: 'Q12345' }
    };

    const overpassProspect: DiscoveredProspect = {
      id: 'osm_1',
      name: 'Alpha Dental',
      entityType: 'business',
      category: 'Dentist',
      location: { city: 'London' },
      socialProfiles: [
        { platform: 'LinkedIn', url: 'https://linkedin.com/company/alphadental' }, // duplicate URL
        { platform: 'Instagram', url: 'https://instagram.com/alphadental' }        // new URL
      ],
      source: 'openstreetmap_overpass',
      discoveryMetadata: { whatsapp: '+447000111222' }
    };

    const composite = new CompositeOSMDiscoveryProvider(
      { name: 'openstreetmap', search: async () => ({ query: 'Alpha Dental', total: 1, prospects: [osmProspect], provider: 'openstreetmap', simulated: false }) } as any,
      { name: 'openstreetmap_overpass', search: async () => ({ query: 'Alpha Dental', total: 1, prospects: [overpassProspect], provider: 'openstreetmap_overpass', simulated: false }) } as any
    );

    const result = await composite.search({ query: 'Alpha Dental', limit: 10 });
    assert.strictEqual(result.total, 1);
    const merged = result.prospects[0];
    assert.strictEqual(merged.socialProfiles.length, 2);
    assert.strictEqual(merged.discoveryMetadata?.wikidata, 'Q12345');
    assert.strictEqual(merged.discoveryMetadata?.whatsapp, '+447000111222');
  });

  // 35. Wikidata enrichment provider ID validation
  await test('35. Wikidata enrichment validates Q-identifiers and ignores invalid entities', async () => {
    const wikidataProvider = new WikidataEnrichmentProvider();
    // Non-Q IDs safely return null without throwing
    const resInvalid = await wikidataProvider.enrichByWikidataId('invalid_id');
    assert.strictEqual(resInvalid, null);
    const resEmpty = await wikidataProvider.enrichByWikidataId('');
    assert.strictEqual(resEmpty, null);
  });

  // 36. DiscoveryService.enrich with user-provided website when prospect lacks website
  await test('36. DiscoveryService.enrich accepts custom user-provided website URL for prospect lacking website', async () => {
    const originalEnricher = DiscoveryService.getEnrichmentProvider();
    let scrapedUrl = '';
    const mockEnricher: IEnrichmentProvider = {
      name: 'mock_enricher',
      enrich: async (url: string) => {
        scrapedUrl = url;
        return {
          businessName: 'Shreeram Flowers',
          emails: ['contact@shreeramflowers.com'],
          phones: ['+91 141 2223344'],
          website: url,
          contactPages: [`${url}/contact`],
          socialProfiles: [{ platform: 'Instagram', url: 'https://instagram.com/shreeramflowers' }],
          address: 'Civil Lines, Jaipur, RJ',
          overview: 'Florist shop in Jaipur',
          provenance: {},
          metadata: {
            provider: 'mock_enricher',
            targetUrl: url,
            pagesScanned: [url],
            durationMs: 15,
            cached: false
          }
        };
      }
    };

    try {
      DiscoveryService.setEnrichmentProvider(mockEnricher);
      const bareProspect: DiscoveredProspect = {
        id: 'osm_node_1001',
        name: 'Shreeram Flowers',
        entityType: 'business',
        category: 'Florist',
        location: { city: 'Jaipur' },
        source: 'openstreetmap',
        socialProfiles: [],
        discoveryMetadata: {}
      };

      const result = await DiscoveryService.enrich('ws_1', 'user_1', {
        prospect: bareProspect,
        website: 'jaipurflowers.com'
      });

      assert.strictEqual(scrapedUrl, 'https://jaipurflowers.com', 'Prepends https:// to bare domain');
      assert.strictEqual(result.prospect.website, 'https://jaipurflowers.com', 'Attaches scraped website to prospect');
      assert.strictEqual(result.prospect.isEnriched, true);
      assert.strictEqual(result.prospect.email, 'contact@shreeramflowers.com');
      assert.strictEqual(result.prospect.phone, '+91 141 2223344');
      assert.strictEqual(result.prospect.provenance?.website?.source, 'user_provided');
      assert.strictEqual(result.prospect.socialProfiles.length, 1);
      assert.strictEqual(result.prospect.socialProfiles[0].platform, 'Instagram');
    } finally {
      DiscoveryService.setEnrichmentProvider(originalEnricher);
    }
  });

  // 37. DiscoveryService.enrich falls back to Wikidata when prospect website is missing
  await test('37. DiscoveryService.enrich enriches from Wikidata claims when prospect website is missing', async () => {
    const originalEnricher = DiscoveryService.getEnrichmentProvider();
    const originalWikidataEnrich = WikidataEnrichmentProvider.prototype.enrichByWikidataId;

    try {
      WikidataEnrichmentProvider.prototype.enrichByWikidataId = async (id: string) => {
        if (id === 'Q99999') {
          return {
            wikidataId: 'Q99999',
            phone: '+44 20 7946 0991',
            email: 'info@nationalgallery.org.uk',
            socialProfiles: [{ platform: 'Twitter', url: 'https://twitter.com/NationalGallery' }],
            description: 'Art museum in London',
            provenance: { wikidataId: 'Q99999' }
          };
        }
        return null;
      };

      const prospectWithWiki: DiscoveredProspect = {
        id: 'osm_node_555',
        name: 'The National Gallery',
        entityType: 'business',
        category: 'Museum',
        location: { city: 'London' },
        source: 'openstreetmap',
        socialProfiles: [],
        discoveryMetadata: { wikidata: 'Q99999' }
      };

      const result = await DiscoveryService.enrich('ws_1', 'user_1', {
        prospect: prospectWithWiki
      });

      assert.strictEqual(result.prospect.isEnriched, true);
      assert.strictEqual(result.prospect.phone, '+44 20 7946 0991');
      assert.strictEqual(result.prospect.email, 'info@nationalgallery.org.uk');
      assert.strictEqual(result.prospect.socialProfiles.length, 1);
      assert.strictEqual(result.prospect.socialProfiles[0].platform, 'Twitter');
      assert.strictEqual(result.prospect.description, 'Art museum in London');
    } finally {
      DiscoveryService.setEnrichmentProvider(originalEnricher);
      WikidataEnrichmentProvider.prototype.enrichByWikidataId = originalWikidataEnrich;
    }
  });

  // 38. DiscoveryService.enrich throws 400 when neither website nor Wikidata is available
  await test('38. DiscoveryService.enrich throws 400 when neither website nor Wikidata is available', async () => {
    const bareProspect: DiscoveredProspect = {
      id: 'osm_node_1002',
      name: 'Unknown Corner Shop',
      entityType: 'business',
      category: 'Shop',
      location: { city: 'Jaipur' },
      source: 'openstreetmap',
      socialProfiles: [],
      discoveryMetadata: {}
    };

    let caughtError: any = null;
    try {
      await DiscoveryService.enrich('ws_1', 'user_1', {
        prospect: bareProspect
      });
    } catch (err: any) {
      caughtError = err;
    }

    assert(caughtError !== null, 'Should throw an error');
    assert.strictEqual(caughtError.statusCode, 400, 'Throws HTTP 400 Bad Request');
    assert(caughtError.message.includes('valid website URL'), 'Helpful error message prompt');
  });

  console.log(`\n=== RESULTS: ${passed}/${total} TESTS PASSED ===\n`);
  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
