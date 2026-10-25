import https from 'https';
import { SocialProfile } from '../../../types/discovery.types';

export interface WebKnowledgeSearchResult {
  phones: string[];
  emails: string[];
  address?: string;
  website?: string;
  sourceName: string;
  sourceUrl?: string;
  socialProfiles: SocialProfile[];
  overview?: string;
}

interface CacheEntry {
  result: WebKnowledgeSearchResult;
  expiresAt: number;
}

/**
 * WebKnowledgeSearchProvider
 *
 * Compliant directory and public web knowledge resolver for LeadFlow.
 * Enforces strict TLS certificate verification (rejectUnauthorized: true).
 * Does NOT perform unauthorized scraping of consumer HTML search engines.
 * Manages an in-memory bounded cache with 30-minute TTL and FIFO eviction.
 */
export class WebKnowledgeSearchProvider {
  private readonly userAgent: string;

  // Bounded in-memory cache for public directory search results
  private static cache = new Map<string, CacheEntry>();
  public static readonly MAX_CACHE_ENTRIES = 500;
  public static readonly CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

  constructor(
    userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  ) {
    this.userAgent = userAgent;
  }

  /**
   * Returns the TLS configuration for outbound HTTPS requests.
   * Enforces strict TLS certificate verification in compliance with security guidelines.
   */
  public getTlsConfig(): { rejectUnauthorized: boolean } {
    return { rejectUnauthorized: true };
  }

  /**
   * Retrieves an item from the bounded cache if present and not expired.
   */
  public static getCached(key: string): WebKnowledgeSearchResult | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.result;
  }

  /**
   * Stores an item in the bounded cache with eviction if maximum size is reached.
   * Preserves tenant isolation: cache keys are strictly public entity keys (name::city).
   */
  public static setCached(key: string, result: WebKnowledgeSearchResult): void {
    if (this.cache.size >= this.MAX_CACHE_ENTRIES) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, {
      result,
      expiresAt: Date.now() + this.CACHE_TTL_MS
    });
  }

  /**
   * Clears all cached knowledge entries (useful for test isolation).
   */
  public static clearCache(): void {
    this.cache.clear();
  }

  /**
   * Returns the current number of cached knowledge entries.
   */
  public static getCacheSize(): number {
    return this.cache.size;
  }

  /**
   * Sanitizes and validates a candidate phone number string.
   * Rejects PIN codes, database IDs, timestamps, and repetitive sequences.
   */
  public cleanAndValidatePhone(raw: string): string | null {
    if (!raw || typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    const digits = trimmed.replace(/\D/g, '');

    // Skip PIN / postal codes (5 or 6 digits)
    if (digits.length === 5 || digits.length === 6) return null;

    // Skip tracking IDs / timestamps (13+ digits without + prefix)
    if (digits.length > 12 && !trimmed.startsWith('+')) return null;

    // Skip Facebook page/user numeric IDs (e.g. 100063818627208)
    if (digits.startsWith('1000') && digits.length >= 12) return null;

    // Skip dummy or repetitive digits (e.g. 0000000000, 1111111111)
    if (/^(\d)\1{5,}$/.test(digits)) return null;

    // Indian mobile & landline: 10 digits starting with 6,7,8,9
    if (digits.length === 10 && /^[6-9]/.test(digits)) {
      return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
    }
    // Indian mobile with leading 0 (e.g. 098640 28348)
    if (digits.length === 11 && digits.startsWith('0') && /^[6-9]/.test(digits.slice(1))) {
      const mob = digits.slice(1);
      return `+91 ${mob.slice(0, 5)} ${mob.slice(5)}`;
    }
    // Indian mobile with leading 91
    if (digits.length === 12 && digits.startsWith('91') && /^[6-9]/.test(digits.slice(2))) {
      const mob = digits.slice(2);
      return `+91 ${mob.slice(0, 5)} ${mob.slice(5)}`;
    }

    // US/Canada: 10 digits (area code starts with 2-9)
    if (digits.length === 10 && /^[2-9]/.test(digits)) {
      return `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    // US/Canada with leading 1
    if (digits.length === 11 && digits.startsWith('1')) {
      return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }

    // UK phone numbers: 11 digits starting with 0
    if (digits.length === 11 && digits.startsWith('0')) {
      return `+44 ${digits.slice(1, 5)} ${digits.slice(5)}`;
    }
    if (digits.length === 12 && digits.startsWith('44')) {
      return `+44 ${digits.slice(2, 6)} ${digits.slice(6)}`;
    }

    // Generic international numbers starting with +
    if (trimmed.startsWith('+') && digits.length >= 8 && digits.length <= 15) {
      return trimmed;
    }

    return null;
  }

  /**
   * Identifies the human-readable source label from a candidate URL.
   */
  public identifySourceLabel(url: string): string {
    const lower = url.toLowerCase();
    if (lower.includes('google.com/maps') || lower.includes('maps.app.goo.gl')) return 'Google Maps';
    if (lower.includes('google.com')) return 'Google Search';
    if (lower.includes('justdial.com')) return 'Justdial';
    if (lower.includes('lybrate.com')) return 'Lybrate';
    if (lower.includes('practo.com')) return 'Practo';
    if (lower.includes('facebook.com')) return 'Facebook';
    if (lower.includes('instagram.com')) return 'Instagram';
    if (lower.includes('linkedin.com')) return 'LinkedIn';
    if (lower.includes('yelp.com')) return 'Yelp';
    if (lower.includes('yellowpages.com')) return 'YellowPages';
    return 'Web Search';
  }

  /**
   * Validates and cleans a public business email.
   */
  public cleanAndValidateEmail(raw: string): string | null {
    if (!raw || typeof raw !== 'string') return null;
    const clean = raw.toLowerCase().trim().replace(/^mailto:/i, '');
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(clean)) return null;
    if (clean.endsWith('.png') || clean.endsWith('.jpg') || clean.endsWith('.jpeg')) return null;
    return clean;
  }

  /**
   * Extracts clean, public social media profile links from candidate URLs.
   * Filters out OAuth, share/intent links, and tracking parameters.
   */
  public extractSocialProfile(url: string): SocialProfile | null {
    if (!url || typeof url !== 'string') return null;
    const lowerUrl = url.toLowerCase();

    if (
      lowerUrl.includes('facebook.com/') &&
      !lowerUrl.includes('sharer') &&
      !lowerUrl.includes('/login') &&
      !lowerUrl.includes('/share')
    ) {
      return { platform: 'Facebook', url, source: 'Facebook' };
    }
    if (
      lowerUrl.includes('instagram.com/') &&
      !lowerUrl.includes('/p/') &&
      !lowerUrl.includes('/explore/')
    ) {
      return { platform: 'Instagram', url, source: 'Instagram' };
    }
    if (
      lowerUrl.includes('linkedin.com/') &&
      !lowerUrl.includes('/share') &&
      !lowerUrl.includes('/login')
    ) {
      return { platform: 'LinkedIn', url, source: 'LinkedIn' };
    }
    if (
      (lowerUrl.includes('twitter.com/') || lowerUrl.includes('x.com/')) &&
      !lowerUrl.includes('/intent/') &&
      !lowerUrl.includes('/share')
    ) {
      return { platform: 'Twitter', url, source: 'Twitter' };
    }
    if (
      lowerUrl.includes('youtube.com/') &&
      !lowerUrl.includes('/watch')
    ) {
      return { platform: 'YouTube', url, source: 'YouTube' };
    }

    return null;
  }

  /**
   * Internal HTTPS request helper with strict TLS verification.
   * Rejects invalid or untrusted certificates (rejectUnauthorized: true).
   */
  private fetchJson(url: string, headers: Record<string, string> = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      try {
        const parsed = new URL(url);
        const req = https.request(
          {
            protocol: parsed.protocol,
            hostname: parsed.hostname,
            path: parsed.pathname + parsed.search,
            method: 'GET',
            headers: {
              'User-Agent': this.userAgent,
              'Accept': 'application/json',
              ...headers
            },
            rejectUnauthorized: true, // Strict certificate validation
            timeout: 5000
          },
          (res) => {
            if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
              resolve(null);
              return;
            }
            let data = '';
            res.on('data', (chunk) => {
              data += chunk;
              if (data.length > 2 * 1024 * 1024) {
                req.destroy();
                resolve(null);
              }
            });
            res.on('end', () => {
              try {
                resolve(JSON.parse(data));
              } catch {
                resolve(null);
              }
            });
          }
        );

        req.on('error', (err) => reject(err));
        req.on('timeout', () => {
          req.destroy();
          resolve(null);
        });
        req.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Searches public business knowledge.
   *
   * In compliance with LeadFlow security and terms of service guidelines:
   * 1. Checks bounded in-memory cache first (30m TTL).
   * 2. If an authorized search API key is configured (e.g. Google Custom Search JSON API),
   *    queries the authorized API via strict HTTPS (rejectUnauthorized: true).
   * 3. Does NOT scrape DuckDuckGo or Bing consumer HTML pages.
   * 4. When no authorized API is configured, returns null cleanly without throwing or discarding leads.
   */
  public async searchBusiness(
    businessName: string,
    city?: string,
    category?: string
  ): Promise<WebKnowledgeSearchResult | null> {
    if (!businessName || !businessName.trim()) return null;

    const normalizedKey = `${businessName.toLowerCase().trim()}::${(city || '').toLowerCase().trim()}`;
    const cached = WebKnowledgeSearchProvider.getCached(normalizedKey);
    if (cached) {
      return cached;
    }

    // Check for authorized Google Custom Search JSON API credentials
    const googleApiKey = process.env.GOOGLE_SEARCH_API_KEY?.trim();
    const googleCx = process.env.GOOGLE_SEARCH_CX?.trim();

    if (googleApiKey && googleCx) {
      try {
        const queryParts = [businessName.trim(), city?.trim(), category?.trim()].filter(Boolean);
        const query = encodeURIComponent(queryParts.join(' '));
        const apiUrl = `https://www.googleapis.com/customsearch/v1?key=${encodeURIComponent(googleApiKey)}&cx=${encodeURIComponent(googleCx)}&q=${query}`;

        const data = await this.fetchJson(apiUrl);
        if (data && Array.isArray(data.items)) {
          const phones: string[] = [];
          const emails: string[] = [];
          const socialProfiles: SocialProfile[] = [];
          let candidateWebsite: string | undefined = undefined;
          let topSnippet: string | undefined = undefined;

          for (const item of data.items) {
            if (!topSnippet && item.snippet) {
              topSnippet = item.snippet;
            }

            // Extract candidate website
            if (!candidateWebsite && item.link) {
              const social = this.extractSocialProfile(item.link);
              if (social) {
                if (!socialProfiles.some((s) => s.platform === social.platform)) {
                  socialProfiles.push(social);
                }
              } else {
                candidateWebsite = item.link;
              }
            }

            // Extract phones from snippet
            if (item.snippet) {
              const phoneMatches = item.snippet.match(/(?:(?:\+|0{0,2})\d{1,3}[-.\s]?)?(?:\(?\d{2,5}\)?[-.\s]?)?\d{3,5}[-.\s]?\d{4,5}/g) || [];
              for (const pm of phoneMatches) {
                const clean = this.cleanAndValidatePhone(pm);
                if (clean && !phones.includes(clean)) {
                  phones.push(clean);
                }
              }

              // Extract emails from snippet
              const emailMatches = item.snippet.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
              for (const em of emailMatches) {
                const cleanEm = this.cleanAndValidateEmail(em);
                if (cleanEm && !emails.includes(cleanEm)) {
                  emails.push(cleanEm);
                }
              }
            }
          }

          const result: WebKnowledgeSearchResult = {
            phones,
            emails,
            website: candidateWebsite,
            sourceName: 'Google Custom Search',
            sourceUrl: candidateWebsite,
            socialProfiles,
            overview: topSnippet
          };

          WebKnowledgeSearchProvider.setCached(normalizedKey, result);
          return result;
        }
      } catch {
        // Fail-safe: authorized API failure returns null without throwing
        return null;
      }
    }

    // Default zero-cost compliant behavior:
    // In the absence of an authorized API key, LeadFlow does not perform unauthorized consumer HTML scraping.
    // Return null cleanly; existing permitted providers (Apify, OSM, WebsiteEnrichment, Wikidata) handle discovery.
    return null;
  }
}
