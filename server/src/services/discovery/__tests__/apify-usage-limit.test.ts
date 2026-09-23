/**
 * LEADFLOW APIFY WORKSPACE USAGE & COST PROTECTION TEST SUITE
 * 
 * Tests:
 * 1. Workspace usage tracking increments on successful Apify search
 * 2. Workspace reaching limit is blocked with HTTP 429 and APIFY_WORKSPACE_DAILY_LIMIT_EXCEEDED
 * 3. NO automatic fallback to OSM when daily workspace limit is exceeded (stays Apify, returns 429)
 * 4. Different workspaces have independent daily limits
 * 5. Reset on new day works naturally
 * 6. Free/OSM discovery is NOT affected by Apify workspace limits
 * 7. Concurrency protection: simultaneous requests at count=9 (limit=10) allow only ONE to succeed
 * 8. Refund on transient timeout (504 / AbortError)
 * 9. Refund on transient network failure (502 / network error)
 * 10. External Apify quota exhaustion (402) triggers refund AND graceful OSM fallback
 * 11. No refund on successful 0-result search
 * 12. Refund never decrements below zero ($gt: 0 safeguard)
 * 13. Fail-safe protection when database is unavailable (503 USAGE_TRACKING_UNAVAILABLE)
 * 14. DiscoveryService.getConfig returns workspace usage status
 * 15. Authenticated session isolation: workspaceId derived strictly from session
 */

import { DiscoveryService } from '../discovery.service';
import { WorkspaceUsageService } from '../workspace-usage.service';
import { ApifyDiscoveryProvider } from '../providers/apify.provider';
import { AppError } from '../../../utils/error.util';
import { IDiscoveryProvider } from '../discovery.provider';
import { DiscoverySearchRequest, DiscoverySearchResult } from '../../../types/discovery.types';

// In-memory mock storage for Mongoose WorkspaceUsage model
interface MockUsageDoc {
  workspaceId: string;
  date: string;
  apifySearchCount: number;
  lastApifySearchAt?: Date;
}

class MockWorkspaceUsageModel {
  public store = new Map<string, MockUsageDoc>();
  public shouldSimulateDbFailure = false;

  private makeKey(workspaceId: string, date: string): string {
    return `${workspaceId}:::${date}`;
  }

  public clear(): void {
    this.store.clear();
    this.shouldSimulateDbFailure = false;
  }

  public async updateOne(query: any, update: any, options?: any): Promise<any> {
    if (this.shouldSimulateDbFailure) {
      throw new Error('Database connection lost');
    }
    const key = this.makeKey(query.workspaceId, query.date);
    if (!this.store.has(key)) {
      if (options?.upsert) {
        this.store.set(key, {
          workspaceId: query.workspaceId,
          date: query.date,
          apifySearchCount: update.$setOnInsert?.apifySearchCount ?? 0
        });
      }
    }
    return { acknowledged: true };
  }

  public async findOneAndUpdate(query: any, update: any, options?: any): Promise<any> {
    if (this.shouldSimulateDbFailure) {
      throw new Error('Database connection lost');
    }
    const key = this.makeKey(query.workspaceId, query.date);
    const existing = this.store.get(key);

    if (!existing) {
      return null;
    }

    // Check $lt condition if present
    if (query.apifySearchCount && query.apifySearchCount.$lt !== undefined) {
      if (existing.apifySearchCount >= query.apifySearchCount.$lt) {
        return null;
      }
    }

    // Check $gt condition if present
    if (query.apifySearchCount && query.apifySearchCount.$gt !== undefined) {
      if (existing.apifySearchCount <= query.apifySearchCount.$gt) {
        return null;
      }
    }

    // Apply update
    if (update.$inc?.apifySearchCount) {
      existing.apifySearchCount += update.$inc.apifySearchCount;
    }
    if (update.$set?.lastApifySearchAt) {
      existing.lastApifySearchAt = update.$set.lastApifySearchAt;
    }

    this.store.set(key, existing);
    return { ...existing };
  }

  public findOne(query: any): any {
    if (this.shouldSimulateDbFailure) {
      return {
        lean: () => Promise.reject(new Error('Database connection lost'))
      };
    }
    const key = this.makeKey(query.workspaceId, query.date);
    const doc = this.store.get(key);
    return {
      lean: () => Promise.resolve(doc ? { ...doc } : null)
    };
  }
}

// Mock OSM provider for fallback testing
class MockOsmProvider implements IDiscoveryProvider {
  public readonly name = 'osm_combined';
  public searchCallCount = 0;

  public async search(request: DiscoverySearchRequest): Promise<DiscoverySearchResult> {
    this.searchCallCount++;
    return {
      query: request.query,
      total: 1,
      prospects: [
        {
          id: 'osm_node_123',
          name: 'Free Discovery Bakery',
          entityType: 'business',
          category: 'Bakery',
          location: { city: 'Jaipur', country: 'India' },
          source: 'openstreetmap',
          discoveryMetadata: {},
          socialProfiles: []
        }
      ],
      provider: this.name,
      simulated: false
    };
  }
}

// Global test setup and mocks
const mockModel = new MockWorkspaceUsageModel();
const mockOsm = new MockOsmProvider();

const originalFetch = globalThis.fetch;
let mockFetchHandler: (url: string, init?: any) => Promise<Response>;

function mockFetch(handler: (url: string, init?: any) => Promise<Response>) {
  mockFetchHandler = handler;
  globalThis.fetch = (async (url: any, init: any) => {
    return mockFetchHandler(String(url), init);
  }) as any;
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
}

// Standard mock Apify response
function standardApifySuccessResponse() {
  return async (url: string) => {
    if (url.includes('/runs?')) {
      return new Response(
        JSON.stringify({
          data: {
            id: 'run_test_123',
            status: 'SUCCEEDED',
            defaultDatasetId: 'dataset_test_123'
          }
        }),
        { status: 201, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url.includes('/items?')) {
      return new Response(
        JSON.stringify([
          {
            title: 'Mock Business 1',
            placeId: 'ChIJ123',
            categoryName: 'Florist',
            city: 'Jaipur',
            country: 'India',
            phone: '+91 141 1234567'
          }
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response('Not found', { status: 404 });
  };
}

async function runTestSuite() {
  console.log('\n=== LEADFLOW APIFY WORKSPACE USAGE & COST PROTECTION TEST SUITE ===\n');
  let passed = 0;
  let total = 0;

  // Configure environment variables for tests
  process.env.APIFY_ENABLED = 'true';
  process.env.APIFY_API_TOKEN = 'apify_mock_token_123';
  process.env.APIFY_ACTOR_ID = 'compass/crawler-google-places';
  process.env.APIFY_MAX_RESULTS = '20';
  process.env.APIFY_MAX_RUNS_PER_SESSION = '50';
  process.env.APIFY_MAX_RUNS_PER_WORKSPACE_PER_DAY = '10';

  WorkspaceUsageService.setModel(mockModel as any);
  DiscoveryService.setProvider(mockOsm);

  async function assertTest(name: string, fn: () => Promise<void>) {
    total++;
    try {
      mockModel.clear();
      mockOsm.searchCallCount = 0;
      ApifyDiscoveryProvider.resetSessionRunCount();
      await fn();
      console.log(`  ✓ [PASS] ${total}. ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ [FAIL] ${total}. ${name}`);
      console.error(`    Error: ${err.message}`);
      if (err.stack) {
        console.error(`    ${err.stack.split('\n').slice(1, 4).join('\n    ')}`);
      }
    }
  }

  // 1. Successful search increments workspace usage count
  await assertTest('Workspace usage tracking increments on successful Apify search', async () => {
    mockFetch(standardApifySuccessResponse());
    const wsId = 'ws_alpha';

    const initialUsage = await WorkspaceUsageService.getDailyUsage(wsId);
    if (initialUsage.count !== 0) throw new Error(`Initial count should be 0, got ${initialUsage.count}`);

    const res = await DiscoveryService.search(wsId, 'user_1', {
      query: 'Florists in Jaipur',
      provider: 'apify'
    });

    if (res.total !== 1) throw new Error(`Expected 1 result, got ${res.total}`);
    const postUsage = await WorkspaceUsageService.getDailyUsage(wsId);
    if (postUsage.count !== 1) throw new Error(`Expected count=1, got ${postUsage.count}`);
    if (postUsage.remaining !== 9) throw new Error(`Expected remaining=9, got ${postUsage.remaining}`);
    if (res.metadata?.workspaceUsage?.remaining !== 9) {
      throw new Error(`Expected metadata remaining=9, got ${res.metadata?.workspaceUsage?.remaining}`);
    }
  });

  // 2. Workspace reaching limit is blocked with HTTP 429
  await assertTest('Workspace reaching limit is blocked with HTTP 429 and APIFY_WORKSPACE_DAILY_LIMIT_EXCEEDED', async () => {
    mockFetch(standardApifySuccessResponse());
    const wsId = 'ws_limit_test';

    // Simulate 10 successful searches to exhaust quota
    for (let i = 0; i < 10; i++) {
      await DiscoveryService.search(wsId, 'user_1', { query: 'Query', provider: 'apify' });
    }

    const usageAt10 = await WorkspaceUsageService.getDailyUsage(wsId);
    if (usageAt10.count !== 10 || usageAt10.remaining !== 0) {
      throw new Error(`Expected count=10 remaining=0, got count=${usageAt10.count} remaining=${usageAt10.remaining}`);
    }

    // 11th search must be rejected with 429
    let errorCaught: any = null;
    try {
      await DiscoveryService.search(wsId, 'user_1', { query: 'Query 11', provider: 'apify' });
    } catch (err: any) {
      errorCaught = err;
    }

    if (!errorCaught) throw new Error('Expected 11th search to throw, but it succeeded');
    if (errorCaught.statusCode !== 429) throw new Error(`Expected statusCode 429, got ${errorCaught.statusCode}`);
    if (errorCaught.code !== 'APIFY_WORKSPACE_DAILY_LIMIT_EXCEEDED') {
      throw new Error(`Expected code APIFY_WORKSPACE_DAILY_LIMIT_EXCEEDED, got ${errorCaught.code}`);
    }
  });

  // 3. DO NOT automatically fallback to OSM when daily workspace limit is exceeded
  await assertTest('NO automatic fallback to OSM when daily workspace limit is exceeded (strictly throws 429)', async () => {
    mockFetch(standardApifySuccessResponse());
    const wsId = 'ws_no_autoswitch';

    // Pre-seed workspace usage to limit
    const today = WorkspaceUsageService.getTodayUtcString();
    mockModel.store.set(`${wsId}:::${today}`, {
      workspaceId: wsId,
      date: today,
      apifySearchCount: 10
    });

    let errorCaught: any = null;
    try {
      await DiscoveryService.search(wsId, 'user_1', { query: 'Test', provider: 'apify' });
    } catch (err: any) {
      errorCaught = err;
    }

    if (!errorCaught || errorCaught.code !== 'APIFY_WORKSPACE_DAILY_LIMIT_EXCEEDED') {
      throw new Error('Expected APIFY_WORKSPACE_DAILY_LIMIT_EXCEEDED error');
    }
    // Verify that fallback OSM was NOT called
    if (mockOsm.searchCallCount !== 0) {
      throw new Error(`Expected 0 OSM fallback calls, got ${mockOsm.searchCallCount}`);
    }
  });

  // 4. Independent limits for different workspaces
  await assertTest('Different workspaces have independent daily limits', async () => {
    mockFetch(standardApifySuccessResponse());
    const wsA = 'ws_tenant_A';
    const wsB = 'ws_tenant_B';

    // Exhaust wsA
    for (let i = 0; i < 10; i++) {
      await DiscoveryService.search(wsA, 'user_A', { query: 'Query', provider: 'apify' });
    }

    // wsA is blocked
    await assertThrows(
      () => DiscoveryService.search(wsA, 'user_A', { query: 'Query', provider: 'apify' }),
      429,
      'APIFY_WORKSPACE_DAILY_LIMIT_EXCEEDED'
    );

    // wsB is still at 0 and succeeds
    const resB = await DiscoveryService.search(wsB, 'user_B', { query: 'Query for B', provider: 'apify' });
    if (resB.total !== 1) throw new Error('wsB search should succeed');

    const usageB = await WorkspaceUsageService.getDailyUsage(wsB);
    if (usageB.count !== 1 || usageB.remaining !== 9) {
      throw new Error(`wsB should have count=1 remaining=9, got ${usageB.count}/${usageB.remaining}`);
    }
  });

  // 5. Reset on new day works naturally
  await assertTest('Reset on new day works naturally via date indexing', async () => {
    mockFetch(standardApifySuccessResponse());
    const wsId = 'ws_date_test';
    const yesterdayDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const yesterday = WorkspaceUsageService.getTodayUtcString(yesterdayDate);
    const today = WorkspaceUsageService.getTodayUtcString();

    // Pre-fill yesterday's usage to limit 10
    mockModel.store.set(`${wsId}:::${yesterday}`, {
      workspaceId: wsId,
      date: yesterday,
      apifySearchCount: 10
    });


    // Today is a fresh day; should succeed
    const res = await DiscoveryService.search(wsId, 'user_1', { query: 'New day search', provider: 'apify' });
    if (res.total !== 1) throw new Error('Today search should succeed');

    const todayUsage = await WorkspaceUsageService.getDailyUsage(wsId, today);
    if (todayUsage.count !== 1) throw new Error(`Today count should be 1, got ${todayUsage.count}`);

    const yesterdayUsage = await WorkspaceUsageService.getDailyUsage(wsId, yesterday);
    if (yesterdayUsage.count !== 10) throw new Error(`Yesterday count should remain 10, got ${yesterdayUsage.count}`);
  });

  // 6. Free/OSM discovery is NOT affected by Apify workspace limits
  await assertTest('Free/OSM discovery is completely unrestricted and unaffected by Apify limits', async () => {
    const wsId = 'ws_exhausted_apify';
    const today = WorkspaceUsageService.getTodayUtcString();

    // Max out Apify usage
    mockModel.store.set(`${wsId}:::${today}`, {
      workspaceId: wsId,
      date: today,
      apifySearchCount: 10
    });

    // Run Free OSM search
    const freeResult = await DiscoveryService.search(wsId, 'user_1', {
      query: 'Bakeries in Jaipur',
      provider: 'osm_combined'
    });

    if (freeResult.total !== 1) throw new Error('Free discovery should return results');
    if (freeResult.provider !== 'osm_combined') throw new Error(`Expected osm_combined, got ${freeResult.provider}`);
    if (mockOsm.searchCallCount !== 1) throw new Error('OSM provider should be called once');

    // Apify count should still be 10 (not modified by OSM search)
    const usage = await WorkspaceUsageService.getDailyUsage(wsId);
    if (usage.count !== 10) throw new Error(`Apify count should remain 10, got ${usage.count}`);
  });

  // 7. Concurrency protection
  await assertTest('Concurrency protection: simultaneous requests at count=9 (limit=10) allow only ONE to succeed', async () => {
    mockFetch(standardApifySuccessResponse());
    const wsId = 'ws_concurrent';
    const today = WorkspaceUsageService.getTodayUtcString();

    // Seed usage at count=9
    mockModel.store.set(`${wsId}:::${today}`, {
      workspaceId: wsId,
      date: today,
      apifySearchCount: 9
    });

    // Fire 5 concurrent requests simultaneously
    const promises = Array.from({ length: 5 }, (_, i) =>
      DiscoveryService.search(wsId, `user_${i}`, { query: `Concurrent ${i}`, provider: 'apify' })
        .then(() => ({ success: true, err: null as any }))
        .catch((err) => ({ success: false, err }))
    );

    const outcomes = await Promise.all(promises);
    const successful = outcomes.filter((o) => o.success);
    const rejected = outcomes.filter((o) => !o.success);

    if (successful.length !== 1) {
      throw new Error(`Expected exactly 1 success under concurrency, got ${successful.length}`);
    }
    if (rejected.length !== 4) {
      throw new Error(`Expected exactly 4 rejections, got ${rejected.length}`);
    }
    for (const r of rejected) {
      if (r.err?.code !== 'APIFY_WORKSPACE_DAILY_LIMIT_EXCEEDED') {
        throw new Error(`Expected APIFY_WORKSPACE_DAILY_LIMIT_EXCEEDED, got ${r.err?.code}`);
      }
    }


    const finalUsage = await WorkspaceUsageService.getDailyUsage(wsId);
    if (finalUsage.count !== 10) {
      throw new Error(`Expected final count=10, got ${finalUsage.count}`);
    }
  });

  // 8. Refund on transient timeout (504 / AbortError)
  await assertTest('Refund quota on transient timeout (504 / AbortError)', async () => {
    mockFetch(async (url) => {
      if (url.includes('/runs?')) {
        const abortErr = new Error('The operation was aborted');
        abortErr.name = 'AbortError';
        throw abortErr;
      }
      return new Response('Not found', { status: 404 });
    });

    const wsId = 'ws_timeout_test';

    let caughtError = null;
    try {
      await DiscoveryService.search(wsId, 'user_1', { query: 'Timeout test', provider: 'apify' });
    } catch (err) {
      caughtError = err;
    }

    if (!caughtError) throw new Error('Expected timeout error');
    // Check that usage was refunded back to 0
    const usage = await WorkspaceUsageService.getDailyUsage(wsId);
    if (usage.count !== 0) {
      throw new Error(`Expected count refunded to 0, but got ${usage.count}`);
    }
  });

  // 9. Refund on transient network failure
  await assertTest('Refund quota on transient network failure (502 / network error)', async () => {
    mockFetch(async (url) => {
      if (url.includes('/runs?')) {
        throw new Error('fetch failed: ECONNRESET');
      }
      return new Response('Not found', { status: 404 });
    });

    const wsId = 'ws_net_fail_test';

    let caughtError = null;
    try {
      await DiscoveryService.search(wsId, 'user_1', { query: 'Network test', provider: 'apify' });
    } catch (err) {
      caughtError = err;
    }

    if (!caughtError) throw new Error('Expected network error');
    const usage = await WorkspaceUsageService.getDailyUsage(wsId);
    if (usage.count !== 0) {
      throw new Error(`Expected count refunded to 0, but got ${usage.count}`);
    }
  });

  // 10. External Apify quota exhaustion (402) triggers refund AND graceful OSM fallback
  await assertTest('External Apify quota exhaustion (402) triggers refund AND graceful OSM fallback', async () => {
    mockFetch(async (url) => {
      if (url.includes('/runs?')) {
        return new Response(JSON.stringify({ error: 'Monthly credit quota depleted' }), { status: 402 });
      }
      return new Response('Not found', { status: 404 });
    });

    const wsId = 'ws_402_test';

    const result = await DiscoveryService.search(wsId, 'user_1', { query: 'Quota test', provider: 'apify' });

    // Quota was refunded so workspace didn't lose its daily count
    const usage = await WorkspaceUsageService.getDailyUsage(wsId);
    if (usage.count !== 0) {
      throw new Error(`Expected count refunded to 0 on 402 fallback, got ${usage.count}`);
    }

    // Gracefully fell back to OSM
    if (!result.fallbackUsed || !result.apifyQuotaExhausted) {
      throw new Error('Expected fallbackUsed and apifyQuotaExhausted flags to be true');
    }
    if (mockOsm.searchCallCount !== 1) {
      throw new Error('Expected fallback to call OSM provider');
    }
  });

  // 11. No refund on successful 0-result search
  await assertTest('No refund on successful search that legitimately returned 0 results', async () => {
    mockFetch(async (url) => {
      if (url.includes('/runs?')) {
        return new Response(
          JSON.stringify({
            data: { id: 'run_zero', status: 'SUCCEEDED', defaultDatasetId: 'dataset_zero' }
          }),
          { status: 201 }
        );
      }
      if (url.includes('/items?')) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      return new Response('Not found', { status: 404 });
    });

    const wsId = 'ws_zero_results';
    const result = await DiscoveryService.search(wsId, 'user_1', { query: 'Exotic term', provider: 'apify' });

    if (result.total !== 0) throw new Error('Expected 0 results');
    // Search legitimately ran on Apify, so run count is consumed (count=1)
    const usage = await WorkspaceUsageService.getDailyUsage(wsId);
    if (usage.count !== 1) {
      throw new Error(`Expected count to remain 1 for completed search, got ${usage.count}`);
    }
  });

  // 12. Refund never decrements below zero ($gt: 0 safeguard)
  await assertTest('Refund never decrements count below zero ($gt: 0 safeguard)', async () => {
    const wsId = 'ws_floor_test';
    const today = WorkspaceUsageService.getTodayUtcString();

    // Start with 0 count
    const res1 = await WorkspaceUsageService.refundDailyRun(wsId, today);
    if (res1) throw new Error('Refunding on count 0 should return false');

    const usage = await WorkspaceUsageService.getDailyUsage(wsId, today);
    if (usage.count !== 0) throw new Error(`Count must not be negative: ${usage.count}`);
  });

  // 13. Fail-safe protection when database is unavailable
  await assertTest('Fail-safe protection when database is unavailable (blocks search with 503)', async () => {
    const wsId = 'ws_db_down';
    mockModel.shouldSimulateDbFailure = true;

    let errorCaught: any = null;
    try {
      await DiscoveryService.search(wsId, 'user_1', { query: 'Search during outage', provider: 'apify' });
    } catch (err) {
      errorCaught = err;
    }

    if (!errorCaught) throw new Error('Expected 503 error when DB is unavailable');
    if (errorCaught.statusCode !== 503) throw new Error(`Expected 503, got ${errorCaught.statusCode}`);
    if (errorCaught.code !== 'USAGE_TRACKING_UNAVAILABLE') {
      throw new Error(`Expected USAGE_TRACKING_UNAVAILABLE, got ${errorCaught.code}`);
    }
  });

  // 14. DiscoveryService.getConfig returns workspace usage status
  await assertTest('DiscoveryService.getConfig returns workspace usage status', async () => {
    const wsId = 'ws_config_test';
    const today = WorkspaceUsageService.getTodayUtcString();

    mockModel.store.set(`${wsId}:::${today}`, {
      workspaceId: wsId,
      date: today,
      apifySearchCount: 3
    });

    const config = await DiscoveryService.getConfig(wsId);
    if (!config.apifyEnabled) throw new Error('Expected apifyEnabled to be true');
    if (!config.usage) throw new Error('Expected usage to be defined in config');
    if (config.usage.count !== 3) throw new Error(`Expected usage count=3, got ${config.usage.count}`);
    if (config.usage.remaining !== 7) throw new Error(`Expected remaining=7, got ${config.usage.remaining}`);
    if (config.usage.limit !== 10) throw new Error(`Expected limit=10, got ${config.usage.limit}`);
  });

  // 15. Authenticated session isolation: workspaceId derived strictly from session
  await assertTest('Authenticated session isolation: search rejects empty workspaceId', async () => {
    let errorCaught: any = null;
    try {
      await DiscoveryService.search('', 'user_1', { query: 'Test', provider: 'apify' });
    } catch (err) {
      errorCaught = err;
    }
    if (!errorCaught || errorCaught.statusCode !== 400) {
      throw new Error('Expected 400 when workspaceId is missing from session');
    }
  });

  restoreFetch();
  WorkspaceUsageService.resetModel();

  console.log(`\n=== RESULTS: ${passed}/${total} TESTS PASSED ===\n`);
  if (passed !== total) {
    process.exit(1);
  }
}

async function assertThrows(fn: () => Promise<any>, expectedStatus: number, expectedCode?: string) {
  try {
    await fn();
    throw new Error(`Expected function to throw ${expectedStatus}, but it resolved successfully.`);
  } catch (err: any) {
    if (err.statusCode !== expectedStatus) {
      throw new Error(`Expected status ${expectedStatus}, got ${err.statusCode} (${err.message})`);
    }
    if (expectedCode && err.code !== expectedCode) {
      throw new Error(`Expected code ${expectedCode}, got ${err.code}`);
    }
  }
}

runTestSuite().catch((e) => {
  console.error('Test suite failed to run:', e);
  process.exit(1);
});
