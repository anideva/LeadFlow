import { IDiscoveryProvider } from './discovery.provider';
import { DevelopmentDiscoveryProvider } from './providers/development.provider';
import {
  DiscoverySearchRequest,
  DiscoverySearchResult,
  DiscoveredProspect
} from '../../types/discovery.types';
import { LeadService, CreateLeadDTO } from '../lead.service';
import { ILead } from '../../models/Lead.model';
import { AppError } from '../../utils/error.util';

export class DiscoveryService {
  private static providerInstance: IDiscoveryProvider = new DevelopmentDiscoveryProvider();

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
      locationHint: request.locationHint
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

    // Compose rich notes capturing discovered context and source provenance
    const isSandbox = prospect.source === 'development_sandbox';
    const notesLines: string[] = [
      isSandbox
        ? `[Simulated Prospect — Development Sandbox]`
        : `[Discovered via LeadFlow Discovery Engine]`,
      honorificTitle ? `Title / Honorific: ${honorificTitle}` : '',
      `Category: ${prospect.category || 'N/A'}`,
      `Source: ${prospect.source || 'Discovery'}`,
      prospect.location?.city ? `City: ${prospect.location.city}` : '',
      prospect.location?.address ? `Address: ${prospect.location.address}` : '',
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
