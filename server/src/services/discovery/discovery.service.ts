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
  SocialProfile
} from '../../types/discovery.types';
import { LeadService, CreateLeadDTO } from '../lead.service';
import { Lead, ILead } from '../../models/Lead.model';
import { AppError } from '../../utils/error.util';

export class DiscoveryService {
  private static providerInstance: IDiscoveryProvider = DiscoveryProviderFactory.createProvider();
  private static enrichmentProviderInstance: IEnrichmentProvider = EnrichmentProviderFactory.createProvider();

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
   * Enriches a discovered prospect using its public website.
   * Preserves provenance and does not construct or synthesize missing data.
   */
  public static async enrich(
    _workspaceId: string,
    _userId: string,
    request: EnrichProspectRequest
  ): Promise<EnrichProspectResponse> {
    const prospect = request.prospect;
    if (!prospect || !prospect.website || typeof prospect.website !== 'string') {
      throw new AppError(400, 'Prospect must have a valid website URL to perform enrichment.');
    }

    const enrichment = await this.enrichmentProviderInstance.enrich(
      prospect.website,
      request.options
    );

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
   * Executes a generic prospect search through the active discovery provider.
   */
  public static async search(
    _workspaceId: string,
    _userId: string,
    request: DiscoverySearchRequest
  ): Promise<DiscoverySearchResult> {
    if (!request.query || typeof request.query !== 'string' || request.query.trim().length === 0) {
      throw new AppError(400, 'Search query cannot be empty.');
    }

    return await this.providerInstance.search({
      query: request.query.trim(),
      limit: request.limit,
      locationHint: request.locationHint,
      cursor: request.cursor
    });
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
