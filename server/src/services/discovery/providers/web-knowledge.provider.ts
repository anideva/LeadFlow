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

export class WebKnowledgeSearchProvider {
  private readonly userAgent: string;
  private static cache = new Map<string, CacheEntry>();
  private static readonly CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

  constructor(
    userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
  ) {
    this.userAgent = userAgent;
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
   * Internal HTTP request engine with relaxed TLS verification and resilient fallback.
   */
  private fetchHtml(hostname: string, path: string, method: 'GET' | 'POST', body?: string): Promise<string | null> {
    return new Promise((resolve) => {
      try {
        const headers: Record<string, string> = {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'same-origin',
          'Sec-Fetch-User': '?1',
          'Upgrade-Insecure-Requests': '1'
        };

        if (method === 'POST' && body) {
          headers['Content-Type'] = 'application/x-www-form-urlencoded';
          headers['Content-Length'] = String(Buffer.byteLength(body));
          headers['Origin'] = `https://${hostname}`;
          headers['Referer'] = `https://${hostname}/`;
        }

        const req = https.request(
          {
            hostname,
            path,
            method,
            headers,
            rejectUnauthorized: false,
            timeout: 6000
          },
          (res) => {
            if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 400)) {
              resolve(null);
              return;
            }
            let data = '';
            res.on('data', (chunk) => {
              data += chunk;
              if (data.length > 2 * 1024 * 1024) {
                req.destroy();
                resolve(data);
              }
            });
            res.on('end', () => resolve(data));
          }
        );

        req.on('error', () => resolve(null));
        req.on('timeout', () => {
          req.destroy();
          resolve(null);
        });

        if (method === 'POST' && body) {
          req.write(body);
        }
        req.end();
      } catch {
        resolve(null);
      }
    });
  }

  /**
   * Searches public web knowledge for a business by name, city, and category.
   * Extracts contact numbers, Instagram, Facebook, and official websites.
   */
  public async searchBusiness(
    businessName: string,
    city?: string,
    category?: string
  ): Promise<WebKnowledgeSearchResult | null> {
    if (!businessName || !businessName.trim()) return null;

    const normalizedKey = `${businessName.toLowerCase().trim()}::${(city || '').toLowerCase().trim()}`;
    const cached = WebKnowledgeSearchProvider.cache.get(normalizedKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.result;
    }

    const queryParts = [businessName.trim(), city?.trim(), category?.trim(), 'contact phone instagram facebook'].filter(Boolean);
    const query = queryParts.join(' ');

    // 1. Primary: POST to DDG HTML endpoint with full browser headers
    const postBody = `q=${encodeURIComponent(query)}&b=`;
    let html = await this.fetchHtml('html.duckduckgo.com', '/html/', 'POST', postBody);

    // 2. Fallback: GET request if POST was blocked or empty
    if (!html || html.length < 500) {
      html = await this.fetchHtml('html.duckduckgo.com', `/html/?q=${encodeURIComponent(query)}`, 'GET');
    }

    if (!html || html.length < 500) {
      return null;
    }

    const snippets: string[] = [];
    const snippetMatches = html.match(/<a class="result__snippet[^>]*>([\s\S]*?)<\/a>/g) || [];
    for (const sm of snippetMatches) {
      snippets.push(
        sm
          .replace(/<[^>]+>/g, '')
          .replace(/&#x27;/g, "'")
          .replace(/&amp;/g, '&')
          .replace(/&quot;/g, '"')
          .trim()
      );
    }

    // 1. Extract and validate phones from snippets
    const rawPhoneRegex = /(?:(?:\+|0{0,2})\d{1,3}[-.\s]?)?(?:\(?\d{2,5}\)?[-.\s]?)?\d{3,5}[-.\s]?\d{4,5}/g;
    const validatedPhones: string[] = [];
    const seenDigits = new Set<string>();

    for (const snippet of snippets) {
      const candidates = snippet.match(rawPhoneRegex) || [];
      for (const cand of candidates) {
        const clean = this.cleanAndValidatePhone(cand);
        if (clean) {
          const sig = clean.replace(/\D/g, '').slice(-10);
          if (!seenDigits.has(sig)) {
            seenDigits.add(sig);
            validatedPhones.push(clean);
          }
        }
      }
    }

    // 2. Extract address from snippets
    let extractedAddress: string | undefined = undefined;
    for (const snippet of snippets) {
      const addrMatch =
        snippet.match(/(?:situated at|located at|office is situated at|address:?)\s*([^.]+(?:-\s*\d{6}|\b\d{5,6}\b|India|Assam|[A-Z]{2}\b))/i) ||
        snippet.match(/(?:situated at|located at|office is situated at|address:?)\s*([^.]+)/i);
      if (addrMatch) {
        extractedAddress = addrMatch[1].trim();
        break;
      }
      const floorMatch = snippet.match(/(\d+(?:st|nd|rd|th)?\s+floor[^.]+(?:[A-Za-z]+|\d{5,6}))/i);
      if (floorMatch) {
        extractedAddress = floorMatch[1].trim();
        break;
      }
    }

    // 3. Extract candidate URLs & social links
    const rawHrefMatches = html.match(/href="([^"]+)"/g) || [];
    let candidateWebsite: string | undefined = undefined;
    let topSourceUrl: string | undefined = undefined;
    const socialProfiles: SocialProfile[] = [];
    const seenSocials = new Set<string>();

    const knownDirectories = [
      'justdial.com',
      'lybrate.com',
      'practo.com',
      'google.com',
      'idbf.in',
      'guwahatiportal.com',
      'promallu.com',
      'yellowpages.com',
      'yelp.com',
      'wikipedia.org',
      'wikidata.org'
    ];

    for (const m of rawHrefMatches) {
      const hrefMatch = m.match(/href="([^"]+)"/);
      if (!hrefMatch) continue;

      let href = hrefMatch[1];
      if (href.startsWith('//')) href = `https:${href}`;

      let actualUrl = href;
      const uddgMatch = href.match(/[?&]uddg=([^&]+)/);
      if (uddgMatch) {
        actualUrl = decodeURIComponent(uddgMatch[1]);
      }

      if (!actualUrl.startsWith('http://') && !actualUrl.startsWith('https://')) continue;
      if (actualUrl.includes('duckduckgo.com')) continue;

      if (!topSourceUrl) {
        topSourceUrl = actualUrl;
      }

      const lowerUrl = actualUrl.toLowerCase();

      // Check for social profiles in search results (skipping generic share/login paths)
      if (
        lowerUrl.includes('facebook.com/') &&
        !lowerUrl.includes('sharer') &&
        !lowerUrl.includes('/login') &&
        !lowerUrl.includes('/share') &&
        !seenSocials.has('facebook')
      ) {
        seenSocials.add('facebook');
        socialProfiles.push({ platform: 'Facebook', url: actualUrl, source: 'Facebook' });
      } else if (
        lowerUrl.includes('instagram.com/') &&
        !lowerUrl.includes('/p/') &&
        !lowerUrl.includes('/explore/') &&
        !seenSocials.has('instagram')
      ) {
        seenSocials.add('instagram');
        socialProfiles.push({ platform: 'Instagram', url: actualUrl, source: 'Instagram' });
      } else if (
        lowerUrl.includes('linkedin.com/') &&
        !lowerUrl.includes('/share') &&
        !seenSocials.has('linkedin')
      ) {
        seenSocials.add('linkedin');
        socialProfiles.push({ platform: 'LinkedIn', url: actualUrl, source: 'LinkedIn' });
      } else if (
        (lowerUrl.includes('twitter.com/') || lowerUrl.includes('x.com/')) &&
        !lowerUrl.includes('/intent/') &&
        !lowerUrl.includes('/share') &&
        !seenSocials.has('twitter')
      ) {
        seenSocials.add('twitter');
        socialProfiles.push({ platform: 'Twitter', url: actualUrl, source: 'Twitter' });
      } else if (
        lowerUrl.includes('youtube.com/') &&
        !lowerUrl.includes('/watch') &&
        !seenSocials.has('youtube')
      ) {
        seenSocials.add('youtube');
        socialProfiles.push({ platform: 'YouTube', url: actualUrl, source: 'YouTube' });
      }

      // If URL is an independent business website (not a major directory), pick as candidate website
      if (!candidateWebsite) {
        const isDirectory = knownDirectories.some((dir) => lowerUrl.includes(dir));
        if (!isDirectory && !socialProfiles.some((s) => s.url === actualUrl)) {
          candidateWebsite = actualUrl;
        }
      }
    }

    // 4. Extract emails from snippets if present
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const validatedEmails: string[] = [];
    for (const snippet of snippets) {
      const emMatches = snippet.match(emailRegex) || [];
      for (const em of emMatches) {
        const cleanEm = em.toLowerCase().trim();
        if (!validatedEmails.includes(cleanEm) && !cleanEm.endsWith('.png') && !cleanEm.endsWith('.jpg')) {
          validatedEmails.push(cleanEm);
        }
      }
    }

    const sourceName = topSourceUrl ? this.identifySourceLabel(topSourceUrl) : 'Google / Web Search';

    const result: WebKnowledgeSearchResult = {
      phones: validatedPhones,
      emails: validatedEmails,
      address: extractedAddress,
      website: candidateWebsite || topSourceUrl,
      sourceName,
      sourceUrl: topSourceUrl,
      socialProfiles,
      overview: snippets.length > 0 ? snippets[0] : undefined
    };

    // Store in cache
    WebKnowledgeSearchProvider.cache.set(normalizedKey, {
      result,
      expiresAt: Date.now() + WebKnowledgeSearchProvider.CACHE_TTL_MS
    });

    return result;
  }
}
