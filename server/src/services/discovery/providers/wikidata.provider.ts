import { SocialProfile } from '../../../types/discovery.types';

export interface WikidataEnrichmentResult {
  wikidataId: string;
  website?: string;
  phone?: string;
  email?: string;
  socialProfiles: SocialProfile[];
  description?: string;
  provenance: Record<string, string>;
}

export class WikidataEnrichmentProvider {
  private static lastRequestTime = 0;
  private readonly baseUrl: string;
  private readonly userAgent: string;

  constructor(
    baseUrl = 'https://www.wikidata.org/wiki/Special:EntityData',
    userAgent = process.env.OSM_USER_AGENT || 'LeadFlow-Discovery-Platform/1.0 (contact@leadflow.io)'
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.userAgent = userAgent;
  }

  /**
   * Enforces polite spacing between consecutive Wikidata API calls.
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - WikidataEnrichmentProvider.lastRequestTime;
    if (elapsed < 1000) {
      await new Promise((resolve) => setTimeout(resolve, 1000 - elapsed));
    }
    WikidataEnrichmentProvider.lastRequestTime = Date.now();
  }

  /**
   * Enriches an entity using public CC0 Wikidata knowledge graph data.
   * Non-blocking: returns null on failure or absence of data without throwing.
   */
  public async enrichByWikidataId(rawId: string): Promise<WikidataEnrichmentResult | null> {
    const wikidataId = rawId.trim().toUpperCase();
    if (!/^Q\d+$/.test(wikidataId)) {
      return null;
    }

    await this.enforceRateLimit();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);

    try {
      const url = `${this.baseUrl}/${encodeURIComponent(wikidataId)}.json`;
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'application/json'
        },
        signal: controller.signal
      });

      if (!res.ok) {
        return null;
      }

      const data: any = await res.json();
      const entity = data?.entities?.[wikidataId];
      if (!entity || !entity.claims) {
        return null;
      }

      const claims = entity.claims;
      const provenance: Record<string, string> = {};

      // 1. Official website (P856)
      let website: string | undefined = undefined;
      const p856 = claims.P856?.[0]?.mainsnak?.datavalue?.value;
      if (typeof p856 === 'string' && p856.trim()) {
        const trimmed = p856.trim();
        website = trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`;
        provenance.website = 'wikidata';
      }

      // 2. Phone number (P1329)
      let phone: string | undefined = undefined;
      const p1329 = claims.P1329?.[0]?.mainsnak?.datavalue?.value;
      if (typeof p1329 === 'string' && p1329.trim()) {
        phone = p1329.trim();
        provenance.phone = 'wikidata';
      }

      // 3. Official email (P968)
      let email: string | undefined = undefined;
      const p968 = claims.P968?.[0]?.mainsnak?.datavalue?.value;
      if (typeof p968 === 'string' && p968.trim()) {
        const rawMail = p968.trim().toLowerCase().replace(/^mailto:/i, '');
        if (rawMail.includes('@')) {
          email = rawMail;
          provenance.email = 'wikidata';
        }
      }

      // 4. Social profiles (P2013: Facebook, P2002: Twitter, P2003: Instagram, P4264: LinkedIn)
      const socialProfiles: SocialProfile[] = [];

      const fb = claims.P2013?.[0]?.mainsnak?.datavalue?.value;
      if (typeof fb === 'string' && fb.trim()) {
        socialProfiles.push({ platform: 'Facebook', url: `https://www.facebook.com/${encodeURIComponent(fb.trim())}` });
      }

      const tw = claims.P2002?.[0]?.mainsnak?.datavalue?.value;
      if (typeof tw === 'string' && tw.trim()) {
        socialProfiles.push({ platform: 'Twitter', url: `https://twitter.com/${encodeURIComponent(tw.trim())}` });
      }

      const ig = claims.P2003?.[0]?.mainsnak?.datavalue?.value;
      if (typeof ig === 'string' && ig.trim()) {
        socialProfiles.push({ platform: 'Instagram', url: `https://www.instagram.com/${encodeURIComponent(ig.trim())}` });
      }

      const li = claims.P4264?.[0]?.mainsnak?.datavalue?.value || claims.P2035?.[0]?.mainsnak?.datavalue?.value;
      if (typeof li === 'string' && li.trim()) {
        socialProfiles.push({ platform: 'LinkedIn', url: `https://www.linkedin.com/company/${encodeURIComponent(li.trim())}` });
      }

      if (socialProfiles.length > 0) {
        provenance.socialProfiles = 'wikidata';
      }

      // 5. English description
      const desc = entity.descriptions?.en?.value;

      return {
        wikidataId,
        website,
        phone,
        email,
        socialProfiles,
        description: desc,
        provenance
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
