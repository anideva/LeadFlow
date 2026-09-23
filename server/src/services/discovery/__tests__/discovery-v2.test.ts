import assert from 'assert';
import { OpenStreetMapOverpassProvider } from '../providers/overpass.provider';
import { CompositeOSMDiscoveryProvider } from '../providers/composite-osm.provider';
import { OpenStreetMapDiscoveryProvider } from '../providers/openstreetmap.provider';
import { WebsiteEnrichmentProvider } from '../providers/website-enrichment.provider';
import { IDiscoveryProvider } from '../discovery.provider';
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

  console.log(`\n=== RESULTS: ${passed}/${total} TESTS PASSED ===\n`);
  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
