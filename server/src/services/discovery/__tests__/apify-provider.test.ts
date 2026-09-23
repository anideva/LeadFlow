import assert from 'assert';
import { ApifyDiscoveryProvider } from '../providers/apify.provider';
import { DiscoveryProviderFactory } from '../discovery-provider.factory';
import { AppError } from '../../../utils/error.util';
import { DiscoveredProspect } from '../../../types/discovery.types';

async function runTests() {
  console.log('=== LEADFLOW APIFY DISCOVERY PROVIDER TEST SUITE ===\n');
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

  // Backup original global fetch
  const originalFetch = globalThis.fetch;

  // 1. Apify provider configuration
  await test('1. Apify provider configuration & instantiation', () => {
    const provider = new ApifyDiscoveryProvider('mock_token', 'mock_actor', true, 25, 10);
    assert.strictEqual(provider.name, 'apify');
  });

  // 2. Missing API token
  await test('2. Rejection when APIFY_API_TOKEN is missing', async () => {
    const provider = new ApifyDiscoveryProvider('', 'mock_actor', true, 20, 5);
    let caught: any = null;
    try {
      await provider.search({ query: 'flower shops in Guwahati' });
    } catch (err: any) {
      caught = err;
    }
    assert(caught instanceof AppError, 'Should throw AppError');
    assert.strictEqual(caught.statusCode, 500);
    assert(caught.message.includes('APIFY_API_TOKEN'), 'Error message must mention API token');
  });

  // 3. Missing Actor ID
  await test('3. Rejection when APIFY_ACTOR_ID is missing', async () => {
    const provider = new ApifyDiscoveryProvider('mock_token', '', true, 20, 5);
    let caught: any = null;
    try {
      await provider.search({ query: 'flower shops in Guwahati' });
    } catch (err: any) {
      caught = err;
    }
    assert(caught instanceof AppError, 'Should throw AppError');
    assert.strictEqual(caught.statusCode, 500);
    assert(caught.message.includes('APIFY_ACTOR_ID'), 'Error message must mention Actor ID');
  });

  // 4. Disabled provider
  await test('4. Disabled provider (APIFY_ENABLED=false) rejection', async () => {
    const provider = new ApifyDiscoveryProvider('mock_token', 'mock_actor', false, 20, 5);
    let caught: any = null;
    try {
      await provider.search({ query: 'flower shops in Guwahati' });
    } catch (err: any) {
      caught = err;
    }
    assert(caught instanceof AppError, 'Should throw AppError');
    assert.strictEqual(caught.statusCode, 403);
    assert(caught.message.includes('disabled'), 'Error message must state provider is disabled');
  });

  // 5. Actor input construction
  await test('5. Actor input construction maps query and limit correctly', async () => {
    let capturedRunUrl = '';
    let capturedBody: any = null;

    globalThis.fetch = (async (url: any, init: any) => {
      const urlStr = url.toString();
      if (init?.method === 'POST') {
        capturedRunUrl = urlStr;
        capturedBody = JSON.parse(init.body);
        return {
          ok: true,
          status: 201,
          json: async () => ({
            data: { id: 'run_123', status: 'SUCCEEDED', defaultDatasetId: 'dataset_123' }
          })
        } as any;
      }
      return {
        ok: true,
        status: 200,
        json: async () => []
      } as any;
    }) as any;

    try {
      ApifyDiscoveryProvider.resetSessionRunCount();
      const provider = new ApifyDiscoveryProvider('test_token', 'compass/crawler-google-places', true, 20, 5);
      await provider.search({ query: 'dentists in Guwahati', limit: 12, locationHint: 'Guwahati, India' });

      assert(capturedRunUrl.includes('compass~crawler-google-places') || capturedRunUrl.includes('compass%2Fcrawler-google-places'));
      assert(capturedBody !== null);

      assert.deepStrictEqual(capturedBody.searchStringsArray, ['dentists in Guwahati']);
      assert.deepStrictEqual(capturedBody.queries, ['dentists in Guwahati']);
      assert.strictEqual(capturedBody.locationQuery, 'Guwahati, India');
      assert.strictEqual(capturedBody.maxCrawledPlacesPerSearch, 12);
      assert.strictEqual(capturedBody.language, 'en');
    } finally {
      globalThis.fetch = originalFetch;
    }

  });

  // 6. Successful Actor response normalization
  await test('6. Successful Actor response normalization into DiscoveredProspect', () => {
    const provider = new ApifyDiscoveryProvider('mock_token', 'mock_actor', true);
    const mockActorItem = {
      title: 'Guwahati Dental Care',
      placeId: 'ChIJxxxxxx123',
      categoryName: 'Dentist',
      address: '123 G.S. Road, Guwahati, Assam 781005',
      street: '123 G.S. Road',
      city: 'Guwahati',
      state: 'Assam',
      countryCode: 'IN',
      postalCode: '781005',
      location: { lat: 26.18, lng: 91.75 },
      phone: '+91 361 2345678',
      email: 'contact@guwahatidental.com',
      website: 'https://guwahatidental.com',
      url: 'https://www.google.com/maps/place/?q=place_id:ChIJxxxxxx123',
      totalScore: 4.8,
      reviewsCount: 142
    };

    const prospect = provider.normalizeItem(mockActorItem, 'dentists in Guwahati');
    assert(prospect !== null);
    assert.strictEqual(prospect.id, 'apify_ChIJxxxxxx123');
    assert.strictEqual(prospect.externalId, 'apify_ChIJxxxxxx123');
    assert.strictEqual(prospect.name, 'Guwahati Dental Care');
    assert.strictEqual(prospect.category, 'Dentist');
    assert.strictEqual(prospect.entityType, 'business');
    assert.strictEqual(prospect.location.address, '123 G.S. Road, Guwahati, Assam 781005');
    assert.strictEqual(prospect.location.city, 'Guwahati');
    assert.strictEqual(prospect.latitude, 26.18);
    assert.strictEqual(prospect.longitude, 91.75);
    assert.strictEqual(prospect.phone, '+91 361 2345678');
    assert.strictEqual(prospect.email, 'contact@guwahatidental.com');
    assert.strictEqual(prospect.website, 'https://guwahatidental.com');
    assert.strictEqual(prospect.source, 'apify_google_maps');
    assert.strictEqual(prospect.sourceUrl, 'https://www.google.com/maps/place/?q=place_id:ChIJxxxxxx123');
    assert.strictEqual(prospect.confidenceScore, 0.95);
    assert.strictEqual(prospect.discoveryMetadata.placeId, 'ChIJxxxxxx123');
    assert.strictEqual(prospect.discoveryMetadata.reviewsCount, 142);
  });

  // 7. Missing optional contact fields
  await test('7. Missing optional contact fields are left undefined (zero fabrication)', () => {
    const provider = new ApifyDiscoveryProvider('mock_token', 'mock_actor', true);
    const bareItem = {
      title: 'Minimal Flower Stall',
      placeId: 'ChIJbare999'
      // No phone, email, website, coordinates
    };

    const prospect = provider.normalizeItem(bareItem, 'flower shops in Guwahati');
    assert(prospect !== null);
    assert.strictEqual(prospect.phone, undefined, 'Missing phone must remain undefined');
    assert.strictEqual(prospect.email, undefined, 'Missing email must remain undefined');
    assert.strictEqual(prospect.website, undefined, 'Missing website must remain undefined');
    assert.deepStrictEqual(prospect.socialProfiles, [], 'Missing social profiles must be empty array');
  });

  // 8. Empty Actor dataset
  await test('8. Empty Actor dataset returns 0 prospects gracefully', async () => {
    globalThis.fetch = (async (url: any, init: any) => {
      if (init?.method === 'POST') {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            data: { id: 'run_empty', status: 'SUCCEEDED', defaultDatasetId: 'dataset_empty' }
          })
        } as any;
      }
      return {
        ok: true,
        status: 200,
        json: async () => []
      } as any;
    }) as any;

    try {
      ApifyDiscoveryProvider.resetSessionRunCount();
      const provider = new ApifyDiscoveryProvider('token', 'actor', true);
      const res = await provider.search({ query: 'nonexistent shop in nowhere' });
      assert.strictEqual(res.total, 0);
      assert.deepStrictEqual(res.prospects, []);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 9. Actor failure
  await test('9. Actor run failure status handled cleanly with AppError', async () => {
    globalThis.fetch = (async () => ({
      ok: true,
      status: 201,
      json: async () => ({
        data: { id: 'run_fail', status: 'FAILED' }
      })
    })) as any;

    try {
      ApifyDiscoveryProvider.resetSessionRunCount();
      const provider = new ApifyDiscoveryProvider('token', 'actor', true);
      let caught: any = null;
      try {
        await provider.search({ query: 'flower shops in Guwahati' });
      } catch (err: any) {
        caught = err;
      }
      assert(caught instanceof AppError);
      assert.strictEqual(caught.statusCode, 502);
      assert(caught.message.includes('FAILED'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 10. Timeout
  await test('10. Timeout handling triggers 504 AppError', async () => {
    globalThis.fetch = (async (_url: any, init: any) => {
      // Simulate AbortController trigger
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    }) as any;

    try {
      ApifyDiscoveryProvider.resetSessionRunCount();
      const provider = new ApifyDiscoveryProvider('token', 'actor', true);
      let caught: any = null;
      try {
        await provider.search({ query: 'flower shops in Guwahati' });
      } catch (err: any) {
        caught = err;
      }
      assert(caught instanceof AppError);
      assert.strictEqual(caught.statusCode, 504);
      assert(caught.message.includes('timed out'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 11. Quota/payment error
  await test('11. Quota/payment error (402) halts cleanly without retrying', async () => {
    let callCount = 0;
    globalThis.fetch = (async () => {
      callCount++;
      return {
        ok: false,
        status: 402,
        statusText: 'Payment Required',
        text: async () => 'Monthly usage limit reached'
      };
    }) as any;

    try {
      ApifyDiscoveryProvider.resetSessionRunCount();
      const provider = new ApifyDiscoveryProvider('token', 'actor', true);
      let caught: any = null;
      try {
        await provider.search({ query: 'flower shops in Guwahati' });
      } catch (err: any) {
        caught = err;
      }
      assert(caught instanceof AppError);
      assert.strictEqual(caught.statusCode, 402);
      assert(caught.message.includes('quota'));
      assert.strictEqual(callCount, 1, 'Must NOT retry on quota/payment errors');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 12. Result limit
  await test('12. Result limit clamps output to APIFY_MAX_RESULTS', async () => {
    const twentyFiveItems = Array.from({ length: 25 }, (_, i) => ({
      title: `Dental Clinic ${i}`,
      placeId: `ChIJclinic_${i}`,
      address: `Address ${i}, Guwahati`,
      categoryName: 'Dentist'
    }));

    globalThis.fetch = (async (url: any, init: any) => {
      if (init?.method === 'POST') {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            data: { id: 'run_25', status: 'SUCCEEDED', defaultDatasetId: 'dataset_25' }
          })
        } as any;
      }
      return {
        ok: true,
        status: 200,
        json: async () => twentyFiveItems
      } as any;
    }) as any;

    try {
      ApifyDiscoveryProvider.resetSessionRunCount();
      // Configure maxResults = 15
      const provider = new ApifyDiscoveryProvider('token', 'actor', true, 15);
      const res = await provider.search({ query: 'dentists in Guwahati', limit: 25 });
      assert.strictEqual(res.prospects.length, 15, 'Must clamp output to configured maxResults 15');
      assert.strictEqual(res.total, 15);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 13. Session run limit
  await test('13. Session run limit halts further runs after reaching max runs', async () => {
    globalThis.fetch = (async (url: any, init: any) => {
      if (init?.method === 'POST') {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            data: { id: 'run_ok', status: 'SUCCEEDED', defaultDatasetId: 'dataset_ok' }
          })
        } as any;
      }
      return { ok: true, status: 200, json: async () => [] } as any;
    }) as any;

    try {
      ApifyDiscoveryProvider.resetSessionRunCount();
      // maxRunsPerSession = 2
      const provider = new ApifyDiscoveryProvider('token', 'actor', true, 20, 2);

      // Run 1 - succeeds
      await provider.search({ query: 'query 1' });
      assert.strictEqual(ApifyDiscoveryProvider.getSessionRunCount(), 1);

      // Run 2 - succeeds
      await provider.search({ query: 'query 2' });
      assert.strictEqual(ApifyDiscoveryProvider.getSessionRunCount(), 2);

      // Run 3 - must be blocked
      let caught: any = null;
      try {
        await provider.search({ query: 'query 3' });
      } catch (err: any) {
        caught = err;
      }
      assert(caught instanceof AppError, 'Should throw AppError on exceeding session runs');
      assert.strictEqual(caught.statusCode, 429);
      assert(caught.message.includes('experiment limit reached'), 'Should state session limit reached');
      assert.strictEqual(ApifyDiscoveryProvider.getSessionRunCount(), 2, 'Counter must not increment past limit');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 14. No automatic retry
  await test('14. Verification of single outbound request without retry on 401', async () => {
    let callCount = 0;
    globalThis.fetch = (async () => {
      callCount++;
      return {
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Invalid token'
      };
    }) as any;

    try {
      ApifyDiscoveryProvider.resetSessionRunCount();
      const provider = new ApifyDiscoveryProvider('invalid_token', 'actor', true);
      try {
        await provider.search({ query: 'query' });
      } catch {}
      assert.strictEqual(callCount, 1, 'Should never retry on 401');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 15. Existing providers remain unaffected
  await test('15. DiscoveryProviderFactory instantiates all providers correctly', () => {
    const devProvider = DiscoveryProviderFactory.createProvider('development');
    assert.strictEqual(devProvider.name, 'development_sandbox');

    const osmProvider = DiscoveryProviderFactory.createProvider('openstreetmap');
    assert.strictEqual(osmProvider.name, 'openstreetmap');

    const combinedProvider = DiscoveryProviderFactory.createProvider('osm_combined');
    assert.strictEqual(combinedProvider.name, 'osm_combined');

    const overpassProvider = DiscoveryProviderFactory.createProvider('overpass');
    assert.strictEqual(overpassProvider.name, 'openstreetmap_overpass');

    const apifyProvider = DiscoveryProviderFactory.createProvider('apify');
    assert.strictEqual(apifyProvider.name, 'apify');
  });

  // 16. Existing discovery regression tests
  await test('16. Deduplication logic merges duplicate Google Maps records', async () => {
    const duplicateItems = [
      {
        title: 'Bloom Flower Boutique',
        placeId: 'ChIJdup111',
        address: '10 GS Road, Guwahati',
        categoryName: 'Florist',
        phone: '+91 9999900001'
      },
      {
        title: 'Bloom Flower Boutique',
        placeId: 'ChIJdup111', // Exact duplicate placeId
        address: '10 GS Road, Guwahati',
        categoryName: 'Florist',
        phone: '+91 9999900001'
      },
      {
        title: 'Bloom Flower Boutique',
        placeId: 'ChIJdifferent_id', // Same name and address
        address: '10 GS Road, Guwahati',
        categoryName: 'Florist'
      }
    ];

    globalThis.fetch = (async (url: any, init: any) => {
      if (init?.method === 'POST') {
        return {
          ok: true,
          status: 201,
          json: async () => ({
            data: { id: 'run_dup', status: 'SUCCEEDED', defaultDatasetId: 'dataset_dup' }
          })
        } as any;
      }
      return { ok: true, status: 200, json: async () => duplicateItems } as any;
    }) as any;

    try {
      ApifyDiscoveryProvider.resetSessionRunCount();
      const provider = new ApifyDiscoveryProvider('token', 'actor', true);
      const res = await provider.search({ query: 'flower shops in Guwahati' });
      assert.strictEqual(res.prospects.length, 1, 'Should deduplicate 3 identical/fuzzy records into 1');
      assert.strictEqual(res.metadata?.duplicatesRemoved, 2);
    } finally {
      globalThis.fetch = originalFetch;
    }
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
