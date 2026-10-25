import { IDiscoveryProvider } from './discovery.provider';
import { DiscoveryProviderFactory } from './discovery-provider.factory';
import { IEnrichmentProvider } from './enrichment.provider';
import { EnrichmentProviderFactory } from './enrichment-provider.factory';
import {
  DiscoverySearchRequest,
  DiscoverySearchResult,
  DiscoveredProspect,
  EnrichProspectRequest,
  EnrichProspectResponse,
  ProspectEnrichmentResult,
  SocialProfile
} from '../../types/discovery.types';
import { LeadService, CreateLeadDTO } from '../lead.service';
import { Lead, ILead } from '../../models/Lead.model';
import { AppError } from '../../utils/error.util';
import { WorkspaceUsageService } from './workspace-usage.service';
import { WikidataEnrichmentProvider } from './providers/wikidata.provider';
import { WebKnowledgeSearchProvider } from './providers/web-knowledge.provider';

export class DiscoveryService {
  private static providerInstance: IDiscoveryProvider = DiscoveryProviderFactory.createProvider();
  private static enrichmentProviderInstance: IEnrichmentProvider = EnrichmentProviderFactory.createProvider();
  private static webKnowledgeProviderInstance: WebKnowledgeSearchProvider = new WebKnowledgeSearchProvider();

  /**
   * Sets or swaps the active discovery data provider (supports DI and testing).
   */
  public static setProvider(provider: IDiscoveryProvider): void {
    this.providerInstance = provider;
  }

  /**
   * Returns the currently active provider instance.
   */
  public static getProvider(): IDiscoveryProvider {
    return this.providerInstance;
  }

  /**
   * Sets or swaps the active enrichment provider (supports DI and testing).
   */
  public static setEnrichmentProvider(provider: IEnrichmentProvider): void {
    this.enrichmentProviderInstance = provider;
  }

  /**
   * Returns the currently active enrichment provider instance.
   */
  public static getEnrichmentProvider(): IEnrichmentProvider {
    return this.enrichmentProviderInstance;
  }

  /**
   * Sets or swaps the active web knowledge search provider (supports DI and testing).
   */
  public static setWebKnowledgeProvider(provider: WebKnowledgeSearchProvider): void {
    this.webKnowledgeProviderInstance = provider;
  }

  /**
   * Returns the currently active web knowledge provider instance.
   */
  public static getWebKnowledgeProvider(): WebKnowledgeSearchProvider {
    return this.webKnowledgeProviderInstance;
  }

  /**
   * Enriches a discovered prospect using its public website.
   * Preserves provenance and does not construct or synthesize missing data.
   */
  public static async enrich(
    _workspaceId: string,
    _userId: string,
    request: EnrichProspectRequest
  ): Promise<EnrichProspectResponse> {
    const prospect = request.prospect;
    if (!prospect) {
      throw new AppError(400, 'Prospect data is required to perform enrichment.');
    }

    const customWebsite = request.website?.trim();
    let websiteToScrape = customWebsite || prospect.website?.trim() || '';

    // If website URL was entered without protocol, prepend https://
    if (websiteToScrape && !websiteToScrape.startsWith('http://') && !websiteToScrape.startsWith('https://')) {
      websiteToScrape = `https://${websiteToScrape}`;
    }

    // Supplementary or primary enrichment via CC0 Wikidata if entity has a wikidata tag
    let wikiResult: any = null;
    if (prospect.discoveryMetadata?.wikidata) {
      try {
        const wikidataProvider = new WikidataEnrichmentProvider();
        wikiResult = await wikidataProvider.enrichByWikidataId(prospect.discoveryMetadata.wikidata);
        // If prospect had no website, but Wikidata provides an official website (P856), use it
        if (!websiteToScrape && wikiResult?.website) {
          websiteToScrape = wikiResult.website;
        }
      } catch {
        // Non-blocking
      }
    }

    // Supplementary single-business resolution via Google Places (Apify) if enabled and phone or website is missing
    let apifyPlaceResult: DiscoveredProspect | null = null;
    const isApifyConfigured =
      process.env.APIFY_ENABLED === 'true' &&
      Boolean(process.env.APIFY_API_TOKEN?.trim()) &&
      Boolean(process.env.APIFY_ACTOR_ID?.trim());

    if (isApifyConfigured && _workspaceId !== 'auto_discovery' && (!websiteToScrape || !prospect.phone)) {
      try {
        const apifyProvider = DiscoveryProviderFactory.createProvider('apify');
        const specificQuery = [prospect.name, prospect.location?.city].filter(Boolean).join(' ');
        const apifyRes = await apifyProvider.search({
          query: specificQuery,
          limit: 1
        });
        if (apifyRes.prospects && apifyRes.prospects.length > 0) {
          apifyPlaceResult = apifyRes.prospects[0];
          if (!websiteToScrape && apifyPlaceResult.website) {
            websiteToScrape = apifyPlaceResult.website;
          }
        }
      } catch {
        // Non-blocking fail-safe
      }
    }

    // Background web knowledge discovery search (e.g. Google Maps/Search, Bing, Justdial, public directory snippets)
    let webKnowledgeResult: any = null;
    if (!websiteToScrape && !apifyPlaceResult?.phone) {
      try {
        webKnowledgeResult = await this.webKnowledgeProviderInstance.searchBusiness(
          prospect.name,
          prospect.location?.city,
          prospect.category
        );
        // If an independent business website was found in search results, use it for deep scraping
        if (!websiteToScrape && webKnowledgeResult?.website && !webKnowledgeResult.website.includes('google.com') && !webKnowledgeResult.website.includes('justdial.com')) {
          websiteToScrape = webKnowledgeResult.website;
        }
      } catch {
        // Non-blocking
      }
    }

    if (
      !websiteToScrape &&
      !wikiResult &&
      !apifyPlaceResult &&
      (!webKnowledgeResult ||
        (webKnowledgeResult.phones.length === 0 &&
          !webKnowledgeResult.address &&
          webKnowledgeResult.socialProfiles.length === 0))
    ) {
      throw new AppError(
        400,
        'Unable to automatically locate contact information or official website for this business. You can provide a website URL or enter contact details manually.'
      );
    }

    let enrichment: ProspectEnrichmentResult;
    if (websiteToScrape) {
      try {
        enrichment = await this.enrichmentProviderInstance.enrich(
          websiteToScrape,
          request.options
        );

        // If website scraping returned 0 phone numbers, supplement from background web knowledge
        if (!webKnowledgeResult && enrichment.phones.length === 0) {
          try {
            webKnowledgeResult = await this.webKnowledgeProviderInstance.searchBusiness(
              prospect.name,
              prospect.location?.city,
              prospect.category
            );
          } catch {
            // Non-blocking
          }
        }
      } catch (scrapeErr) {
        // If scraping fails (site unreachable/offline), fallback to web knowledge data or Apify if available
        if (webKnowledgeResult || wikiResult || apifyPlaceResult) {
          enrichment = {
            businessName: apifyPlaceResult?.name,
            emails: [
              ...(apifyPlaceResult?.email ? [apifyPlaceResult.email] : []),
              ...(webKnowledgeResult?.emails || []),
              ...(wikiResult?.email ? [wikiResult.email] : [])
            ],
            phones: [
              ...(apifyPlaceResult?.phone ? [apifyPlaceResult.phone] : []),
              ...(webKnowledgeResult?.phones || []),
              ...(wikiResult?.phone ? [wikiResult.phone] : [])
            ],
            website: websiteToScrape || apifyPlaceResult?.website,
            contactPages: [],
            socialProfiles: [
              ...(apifyPlaceResult?.socialProfiles || []),
              ...(webKnowledgeResult?.socialProfiles || []),
              ...(wikiResult?.socialProfiles || [])
            ],
            address: apifyPlaceResult?.location?.address || webKnowledgeResult?.address,
            overview: webKnowledgeResult?.overview || wikiResult?.description,
            provenance: {},
            metadata: {
              provider: apifyPlaceResult ? 'apify_google_places' : webKnowledgeResult?.sourceName ? `web_search_${webKnowledgeResult.sourceName.toLowerCase().replace(/\s+/g, '_')}` : 'web_knowledge',
              targetUrl: websiteToScrape || apifyPlaceResult?.website || '',
              pagesScanned: [],
              durationMs: 0,
              cached: false
            }
          };
        } else {
          throw scrapeErr;
        }
      }
    } else {
      // Knowledge-based enrichment from Google Places, web search snippets, and Wikidata
      enrichment = {
        businessName: apifyPlaceResult?.name,
        emails: [
          ...(apifyPlaceResult?.email ? [apifyPlaceResult.email] : []),
          ...(webKnowledgeResult?.emails || []),
          ...(wikiResult?.email ? [wikiResult.email] : [])
        ],
        phones: [
          ...(apifyPlaceResult?.phone ? [apifyPlaceResult.phone] : []),
          ...(webKnowledgeResult?.phones || []),
          ...(wikiResult?.phone ? [wikiResult.phone] : [])
        ],
        website: apifyPlaceResult?.website || webKnowledgeResult?.website || wikiResult?.website || undefined,
        contactPages: [],
        socialProfiles: [
          ...(apifyPlaceResult?.socialProfiles || []),
          ...(webKnowledgeResult?.socialProfiles || []),
          ...(wikiResult?.socialProfiles || [])
        ],
        address: apifyPlaceResult?.location?.address || webKnowledgeResult?.address,
        overview: webKnowledgeResult?.overview || wikiResult?.description,
        provenance: {},
        metadata: {
          provider: apifyPlaceResult ? 'apify_google_places' : webKnowledgeResult?.sourceName ? `web_search_${webKnowledgeResult.sourceName.toLowerCase().replace(/\s+/g, '_')}` : (wikiResult ? 'wikidata' : 'web_knowledge'),
          targetUrl: apifyPlaceResult?.website || webKnowledgeResult?.sourceUrl || '',
          pagesScanned: webKnowledgeResult?.sourceUrl ? [webKnowledgeResult.sourceUrl] : [],
          durationMs: 0,
          cached: false
        }
      };
    }

    // Deep clone prospect to prevent unexpected mutations
    const enriched: DiscoveredProspect = JSON.parse(JSON.stringify(prospect));
    enriched.provenance = enriched.provenance || {};

    // Record initial discovery provenance for fields from discovery
    if (enriched.source) {
      enriched.provenance.name = { value: enriched.name, source: enriched.source };
      if (enriched.website) {
        enriched.provenance.website = { value: enriched.website, source: enriched.source };
      }
      if (enriched.phone && !enriched.provenance.phone) {
        enriched.provenance.phone = { value: enriched.phone, source: enriched.source };
      }
      if (enriched.email && !enriched.provenance.email) {
        enriched.provenance.email = { value: enriched.email, source: enriched.source };
      }
    }

    // Attach website to prospect if newly provided or discovered
    if (websiteToScrape) {
      enriched.website = websiteToScrape;
      enriched.provenance.website = {
        value: websiteToScrape,
        source: customWebsite ? 'user_provided' : (prospect.website ? enriched.source : 'wikidata'),
        extractedAt: new Date().toISOString()
      };
    }

    // Apply enriched email (prefer existing if already verified, or adopt newly discovered)
    if (enrichment.emails.length > 0) {
      if (!enriched.email) {
        enriched.email = enrichment.emails[0];
        enriched.provenance.email = {
          value: enrichment.emails[0],
          source: 'website',
          extractedAt: new Date().toISOString()
        };
      }
    }

    // Apply enriched phone
    if (enrichment.phones.length > 0) {
      if (!enriched.phone) {
        enriched.phone = enrichment.phones[0];
        enriched.provenance.phone = {
          value: enrichment.phones[0],
          source: 'website',
          extractedAt: new Date().toISOString()
        };
      }
    }

    // Merge social profiles
    if (enrichment.socialProfiles.length > 0) {
      const existingUrls = new Set((enriched.socialProfiles || []).map((s) => s.url.toLowerCase()));
      const mergedSocials: SocialProfile[] = [...(enriched.socialProfiles || [])];

      for (const sp of enrichment.socialProfiles) {
        if (!existingUrls.has(sp.url.toLowerCase())) {
          existingUrls.add(sp.url.toLowerCase());
          mergedSocials.push(sp);
        }
      }
      enriched.socialProfiles = mergedSocials;
      enriched.provenance.socialProfiles = {
        value: mergedSocials,
        source: 'website',
        extractedAt: new Date().toISOString()
      };
    }

    // Update overview / description if absent
    if (enrichment.overview && (!enriched.description || enriched.description.includes('listing in'))) {
      enriched.description = enrichment.overview;
      enriched.provenance.description = {
        value: enrichment.overview,
        source: 'website',
        extractedAt: new Date().toISOString()
      };
    }

    // Apply enriched address if prospect lacks street address
    if (enrichment.address && (!enriched.location?.address || enriched.location.address.trim().length === 0)) {
      enriched.location = enriched.location || {};
      enriched.location.address = enrichment.address;
      enriched.provenance.address = {
        value: enrichment.address,
        source: 'website',
        extractedAt: new Date().toISOString()
      };
    }

    // Apply clean business name if existing name is generic
    if (enrichment.businessName && (!enriched.name || enriched.name.toLowerCase() === 'local business')) {
      enriched.name = enrichment.businessName;
      enriched.provenance.name = {
        value: enrichment.businessName,
        source: 'website',
        extractedAt: new Date().toISOString()
      };
    }

    // Merge any supplementary Wikidata fields if available
    if (wikiResult) {
      if (!enriched.phone && wikiResult.phone) {
        enriched.phone = wikiResult.phone;
        enriched.provenance.phone = {
          value: wikiResult.phone,
          source: 'wikidata',
          extractedAt: new Date().toISOString()
        };
      }
      if (!enriched.email && wikiResult.email) {
        enriched.email = wikiResult.email;
        enriched.provenance.email = {
          value: wikiResult.email,
          source: 'wikidata',
          extractedAt: new Date().toISOString()
        };
      }
      if (wikiResult.socialProfiles && wikiResult.socialProfiles.length > 0) {
        const existingUrls = new Set((enriched.socialProfiles || []).map((s) => s.url.toLowerCase()));
        const currentSocials = [...(enriched.socialProfiles || [])];
        for (const sp of wikiResult.socialProfiles) {
          if (!existingUrls.has(sp.url.toLowerCase())) {
            existingUrls.add(sp.url.toLowerCase());
            currentSocials.push(sp);
          }
        }
        enriched.socialProfiles = currentSocials;
      }
    }

    // Merge any supplementary Web Knowledge fields if available
    if (webKnowledgeResult) {
      if (!enriched.phone && webKnowledgeResult.phones?.length > 0) {
        enriched.phone = webKnowledgeResult.phones[0];
        enriched.provenance.phone = {
          value: webKnowledgeResult.phones[0],
          source: webKnowledgeResult.sourceName || 'Web Search',
          sourceUrl: webKnowledgeResult.sourceUrl,
          extractedAt: new Date().toISOString()
        };
      } else if (enriched.phone && webKnowledgeResult.phones?.includes(enriched.phone)) {
        enriched.provenance.phone = {
          value: enriched.phone,
          source: webKnowledgeResult.sourceName || 'Web Search',
          sourceUrl: webKnowledgeResult.sourceUrl,
          extractedAt: new Date().toISOString()
        };
      }

      if (!enriched.email && webKnowledgeResult.emails?.length > 0) {
        enriched.email = webKnowledgeResult.emails[0];
        enriched.provenance.email = {
          value: webKnowledgeResult.emails[0],
          source: webKnowledgeResult.sourceName || 'Web Search',
          sourceUrl: webKnowledgeResult.sourceUrl,
          extractedAt: new Date().toISOString()
        };
      }

      if (webKnowledgeResult.address && (!enriched.location?.address || enriched.location.address.trim().length === 0)) {
        enriched.location = enriched.location || {};
        enriched.location.address = webKnowledgeResult.address;
        enriched.provenance.address = {
          value: webKnowledgeResult.address,
          source: webKnowledgeResult.sourceName || 'Web Search',
          sourceUrl: webKnowledgeResult.sourceUrl,
          extractedAt: new Date().toISOString()
        };
      } else if (webKnowledgeResult.address && enriched.location?.address === webKnowledgeResult.address) {
        enriched.provenance.address = {
          value: webKnowledgeResult.address,
          source: webKnowledgeResult.sourceName || 'Web Search',
          sourceUrl: webKnowledgeResult.sourceUrl,
          extractedAt: new Date().toISOString()
        };
      }

      if (webKnowledgeResult.website && !enriched.website) {
        enriched.website = webKnowledgeResult.website;
        enriched.provenance.website = {
          value: webKnowledgeResult.website,
          source: webKnowledgeResult.sourceName || 'Web Search',
          sourceUrl: webKnowledgeResult.sourceUrl,
          extractedAt: new Date().toISOString()
        };
      }

      if (webKnowledgeResult.socialProfiles && webKnowledgeResult.socialProfiles.length > 0) {
        const existingUrls = new Set((enriched.socialProfiles || []).map((s) => s.url.toLowerCase()));
        const currentSocials = [...(enriched.socialProfiles || [])];
        for (const sp of webKnowledgeResult.socialProfiles) {
          if (!existingUrls.has(sp.url.toLowerCase())) {
            existingUrls.add(sp.url.toLowerCase());
            currentSocials.push({
              ...sp,
              source: sp.source || webKnowledgeResult.sourceName || 'Web Search'
            });
          }
        }
        enriched.socialProfiles = currentSocials;
        enriched.provenance.socialProfiles = {
          value: currentSocials,
          source: webKnowledgeResult.sourceName || 'Web Search',
          sourceUrl: webKnowledgeResult.sourceUrl,
          extractedAt: new Date().toISOString()
        };
      }
    }

    // Merge any Google Places (Apify) fields if available
    if (apifyPlaceResult) {
      if (!enriched.phone && apifyPlaceResult.phone) {
        enriched.phone = apifyPlaceResult.phone;
        enriched.provenance.phone = {
          value: apifyPlaceResult.phone,
          source: 'Google Maps via Apify',
          extractedAt: new Date().toISOString()
        };
      }
      if (!enriched.location?.address && apifyPlaceResult.location?.address) {
        enriched.location = enriched.location || {};
        enriched.location.address = apifyPlaceResult.location.address;
        enriched.provenance.address = {
          value: apifyPlaceResult.location.address,
          source: 'Google Maps via Apify',
          extractedAt: new Date().toISOString()
        };
      }
      if (!enriched.website && apifyPlaceResult.website) {
        enriched.website = apifyPlaceResult.website;
        enriched.provenance.website = {
          value: apifyPlaceResult.website,
          source: 'Google Maps via Apify',
          extractedAt: new Date().toISOString()
        };
      }
      if (apifyPlaceResult.discoveryMetadata?.rating) {
        enriched.discoveryMetadata = {
          ...(enriched.discoveryMetadata || {}),
          rating: apifyPlaceResult.discoveryMetadata.rating,
          reviewCount: apifyPlaceResult.discoveryMetadata.reviewCount
        };
      }
    }

    enriched.isEnriched = true;
    enriched.enrichmentMetadata = {
      ...enrichment.metadata,
      discoveredEmails: enrichment.emails,
      discoveredPhones: enrichment.phones,
      contactPages: enrichment.contactPages
    };

    return {
      prospect: enriched,
      enrichment
    };
  }

  /**
   * Returns discovery configuration flags to frontend without leaking credentials.
   */
  public static async getConfig(workspaceId?: string): Promise<{
    apifyEnabled: boolean;
    defaultProvider: string;
    usage?: { count: number; limit: number; remaining: number; date: string };
  }> {
    const apifyEnabled =
      process.env.APIFY_ENABLED === 'true' &&
      Boolean(process.env.APIFY_API_TOKEN?.trim()) &&
      Boolean(process.env.APIFY_ACTOR_ID?.trim());

    let usage = undefined;
    if (workspaceId && apifyEnabled) {
      usage = await WorkspaceUsageService.getDailyUsage(workspaceId);
    }

    return {
      apifyEnabled,
      defaultProvider: apifyEnabled ? 'apify' : (process.env.DISCOVERY_PROVIDER || 'osm_combined'),
      usage
    };
  }

  /**
   * Executes a generic prospect search through the active discovery provider.
   */
  public static async search(
    workspaceId: string,
    _userId: string,
    request: DiscoverySearchRequest
  ): Promise<DiscoverySearchResult> {
    if (!request.query || typeof request.query !== 'string' || request.query.trim().length === 0) {
      throw new AppError(400, 'Search query cannot be empty.');
    }

    // If request explicitly specifies Apify or defaults to Apify when enabled:
    const isApifyRequested =
      (request.provider && request.provider.toLowerCase().startsWith('apify')) ||
      (!request.provider && (process.env.DISCOVERY_PROVIDER === 'apify' || process.env.APIFY_ENABLED === 'true'));

    if (isApifyRequested) {
      // 1. Tier 1: Check & reserve daily quota in MongoDB atomically
      const reservation = await WorkspaceUsageService.reserveDailyRun(workspaceId);
      if (!reservation.allowed) {
        throw new AppError(
          429,
          `Daily Apify discovery limit reached (${reservation.maxLimit} searches/day for this workspace). You can manually select Current Free Discovery.`,
          'APIFY_WORKSPACE_DAILY_LIMIT_EXCEEDED'
        );
      }

      try {
        const apifyProvider = DiscoveryProviderFactory.createProvider('apify');
        const searchResult = await apifyProvider.search({
          query: request.query.trim(),
          limit: request.limit,
          locationHint: request.locationHint,
          cursor: request.cursor,
          provider: request.provider
        });

        // Attach workspace quota metadata
        searchResult.metadata = {
          ...searchResult.metadata,
          workspaceUsage: {
            count: reservation.currentCount,
            limit: reservation.maxLimit,
            remaining: Math.max(0, reservation.maxLimit - reservation.currentCount),
            date: reservation.date
          }
        };

        // Automatically enrich discovered prospects with website emails, social profiles, etc.
        if (request.autoEnrich !== false && searchResult.prospects && searchResult.prospects.length > 0) {
          searchResult.prospects = await this.autoEnrichProspects(searchResult.prospects);
        }

        return searchResult;
      } catch (err: any) {
        // Quota refund logic:
        // Refund ONLY for transient network/timeout failures or upstream external quota limits
        // where no successful Apify results could be obtained.
        const isTransientNetworkOrTimeout =
          err.statusCode === 504 ||
          err.name === 'AbortError' ||
          err.statusCode === 502 ||
          err.statusCode === 503 ||
          (typeof err.message === 'string' &&
            (err.message.toLowerCase().includes('network') ||
             err.message.toLowerCase().includes('timeout') ||
             err.message.toLowerCase().includes('timed out') ||
             err.message.toLowerCase().includes('econnrefused') ||
             err.message.toLowerCase().includes('econnreset') ||
             err.message.toLowerCase().includes('enotfound') ||
             err.message.toLowerCase().includes('fetch failed')));

        const isExternalApifyQuotaExhausted =
          err.statusCode === 402 ||
          (err.statusCode === 429 && err.code !== 'APIFY_WORKSPACE_DAILY_LIMIT_EXCEEDED') ||
          (typeof err.message === 'string' &&
            (err.message.toLowerCase().includes('quota') ||
             err.message.toLowerCase().includes('billing') ||
             err.message.toLowerCase().includes('credits') ||
             err.message.toLowerCase().includes('exhausted')));

        // Refund reserved quota count on transient network/timeout or upstream quota exhaustion
        if (isTransientNetworkOrTimeout || isExternalApifyQuotaExhausted) {
          await WorkspaceUsageService.refundDailyRun(workspaceId, reservation.date).catch((refErr) => {
            console.error('[Discovery Service] Failed to refund daily Apify run:', refErr);
          });
        }

        // If external Apify monthly quota is exhausted, gracefully fall back to Free OpenStreetMap
        if (isExternalApifyQuotaExhausted) {
          console.warn('[Discovery Service] Apify quota exhausted/limited. Gracefully falling back to Free OpenStreetMap:', err.message);

          const fallbackResult = await this.providerInstance.search({
            query: request.query.trim(),
            limit: request.limit,
            locationHint: request.locationHint,
            cursor: request.cursor
          });

          if (request.autoEnrich !== false && fallbackResult.prospects && fallbackResult.prospects.length > 0) {
            fallbackResult.prospects = await this.autoEnrichProspects(fallbackResult.prospects);
          }

          return {
            ...fallbackResult,
            warning:
              'Apify monthly free tier quota is exhausted. Automatically switched to Free OpenStreetMap discovery. You can continue prospecting with the free method while waiting for your Apify quota to renew.',
            apifyQuotaExhausted: true,
            fallbackUsed: true
          };
        }

        throw err;
      }
    }

    // Default provider execution (e.g. osm_combined or explicitly selected non-apify provider)
    const providerToUse =
      request.provider && request.provider !== 'osm_combined'
        ? DiscoveryProviderFactory.createProvider(request.provider)
        : this.providerInstance;

    const searchResult = await providerToUse.search({
      query: request.query.trim(),
      limit: request.limit,
      locationHint: request.locationHint,
      cursor: request.cursor,
      provider: request.provider
    });

    // Automatically enrich discovered prospects with phone numbers, social profiles, and websites
    if (request.autoEnrich !== false && searchResult.prospects && searchResult.prospects.length > 0) {
      searchResult.prospects = await this.autoEnrichProspects(searchResult.prospects);
    }

    return searchResult;
  }

  /**
   * Automatically enriches prospects with contact phone numbers, social media profiles
   * (Instagram, Facebook, etc.), and official websites in the background.
   * Runs with bounded concurrency, preserving multi-tenant safety and error resilience.
   */
  public static async autoEnrichProspects(prospects: DiscoveredProspect[]): Promise<DiscoveredProspect[]> {
    if (!prospects || prospects.length === 0) return prospects;

    const toEnrich = prospects.slice(0, 10);
    const remainder = prospects.slice(10);

    const enrichedList: DiscoveredProspect[] = [];

    // Process in polite batches of 2 to avoid public endpoint rate limits
    const BATCH_SIZE = 2;
    for (let i = 0; i < toEnrich.length; i += BATCH_SIZE) {
      const batch = toEnrich.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (prospect) => {
          // If already enriched with both phone and social profiles, keep as is
          if (prospect.isEnriched && prospect.phone && (prospect.socialProfiles?.length || 0) > 0) {
            return prospect;
          }

          try {
            const enrichRes = await this.enrich('auto_discovery', 'system', {
              prospect,
              options: { timeoutMs: 5000 }
            });
            return enrichRes.prospect;
          } catch {
            return prospect;
          }
        })
      );
      enrichedList.push(...batchResults);
    }

    return [...enrichedList, ...remainder];
  }




  /**
   * Converts a discovered prospect into a persistent LeadFlow CRM lead.
   * Leverages existing LeadService.createLead to maintain multi-tenant isolation,
   * audit fields, and event-driven workflow automation triggers.
   */
  public static async convertToLead(
    workspaceId: string,
    userId: string,
    prospect: DiscoveredProspect
  ): Promise<ILead> {
    if (!prospect || !prospect.name || typeof prospect.name !== 'string' || prospect.name.trim().length === 0) {
      throw new AppError(400, 'Invalid prospect payload: name is required for CRM lead conversion.');
    }

    const trimmedName = prospect.name.trim();
    let firstName = trimmedName;
    let lastName: string | undefined = undefined;
    let company: string | undefined = undefined;
    let honorificTitle: string | undefined = undefined;

    if (prospect.entityType === 'person') {
      // Detect and strip common honorific titles (e.g. Dr., Mr., Ms., Mrs., Prof., etc.)
      const honorificRegex = /^(dr|mr|ms|mrs|prof|mx|attorney|atty)\b\.?\s*/i;
      const honorificMatch = trimmedName.match(honorificRegex);

      let cleanName = trimmedName;
      if (honorificMatch) {
        const rawTitle = honorificMatch[1];
        honorificTitle = rawTitle.charAt(0).toUpperCase() + rawTitle.slice(1).toLowerCase();
        if (['dr', 'mr', 'ms', 'mrs', 'prof', 'atty'].includes(rawTitle.toLowerCase())) {
          honorificTitle += '.';
        }
        cleanName = trimmedName.replace(honorificRegex, '').trim();
      }

      const parts = cleanName.split(/\s+/).filter(Boolean);
      firstName = parts[0] || 'Unknown';
      lastName = parts.slice(1).join(' ') || undefined;
      company = prospect.category || undefined;
    } else {
      company = trimmedName;
    }

    // Deduplication check: prevent converting the same external provider entity or same email twice in this workspace
    if (prospect.externalId) {
      const existing = await Lead.findOne({
        workspaceId,
        isArchived: false,
        notes: { $regex: `External ID: ${prospect.externalId}` }
      });
      if (existing) {
        throw new AppError(409, `A lead for this prospect (ID: ${prospect.externalId}) already exists in this workspace.`);
      }
    }

    if (prospect.email?.trim()) {
      const existingByEmail = await Lead.findOne({
        workspaceId,
        isArchived: false,
        email: prospect.email.trim().toLowerCase()
      });
      if (existingByEmail) {
        throw new AppError(409, `A lead with email "${prospect.email.trim()}" already exists in this workspace.`);
      }
    }

    // Compose rich notes capturing discovered context and source provenance
    const isSandbox = prospect.source === 'development_sandbox';
    const notesLines: string[] = [
      isSandbox
        ? `[Simulated Prospect — Development Sandbox]`
        : `[Discovered via LeadFlow Discovery Engine — ${prospect.source.toUpperCase()}]`,
      prospect.isEnriched ? `[Enriched via Public Website — ${prospect.website || 'Official Website'}]` : '',
      prospect.externalId ? `External ID: ${prospect.externalId}` : '',
      honorificTitle ? `Title / Honorific: ${honorificTitle}` : '',
      `Category: ${prospect.category || 'N/A'}`,
      `Source: ${prospect.source || 'Discovery'}`,
      prospect.provenance?.email?.source === 'website' ? `Email Source: Public Website (${prospect.email})` : '',
      prospect.provenance?.phone?.source === 'website' ? `Phone Source: Public Website (${prospect.phone})` : '',
      prospect.sourceUrl ? `Source URL: ${prospect.sourceUrl}` : '',
      prospect.location?.city ? `City: ${prospect.location.city}` : '',
      prospect.location?.address ? `Address: ${prospect.location.address}` : '',
      prospect.latitude && prospect.longitude ? `Coordinates: ${prospect.latitude}, ${prospect.longitude}` : '',
      prospect.website ? `Website: ${prospect.website}` : '',
      prospect.description ? `Overview: ${prospect.description}` : ''
    ].filter(Boolean);

    const createLeadDTO: CreateLeadDTO = {
      firstName,
      lastName,
      company,
      email: prospect.email?.trim() || undefined,
      phone: prospect.phone?.trim() || undefined,
      source: 'discovery',
      status: 'new',
      priority: 'medium',
      notes: notesLines.join('\n')
    };

    return await LeadService.createLead(workspaceId, userId, createLeadDTO);
  }
}
