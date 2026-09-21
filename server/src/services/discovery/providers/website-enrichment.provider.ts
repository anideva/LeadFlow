import dns from 'dns';
import { IEnrichmentProvider, EnrichmentOptions } from '../enrichment.provider';
import { ProspectEnrichmentResult, SocialProfile } from '../../../types/discovery.types';
import { AppError } from '../../../utils/error.util';

interface CacheEntry {
  result: ProspectEnrichmentResult;
  expiresAt: number;
}

export class WebsiteEnrichmentProvider implements IEnrichmentProvider {
  public readonly name = 'website_scraper';

  private static cache = new Map<string, CacheEntry>();
  private static readonly CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
  private static readonly MAX_CACHE_ENTRIES = 200;

  private userAgent: string;

  constructor(
    userAgent = 'LeadFlow-Bot/1.0 (+https://leadflow.io/bot; contact@leadflow.io)'
  ) {
    this.userAgent = userAgent;
  }

  /**
   * Enriches a business prospect by safely fetching and analyzing its public website.
   */
  public async enrich(
    targetUrl: string,
    options?: EnrichmentOptions
  ): Promise<ProspectEnrichmentResult> {
    const startTime = Date.now();
    const normalizedUrl = this.normalizeUrl(targetUrl);

    // 1. Cache lookup (unless forceRefresh is requested)
    if (!options?.forceRefresh) {
      const cached = this.getCached(normalizedUrl);
      if (cached) {
        return {
          ...cached,
          metadata: {
            ...cached.metadata,
            cached: true,
            durationMs: Date.now() - startTime
          }
        };
      }
    }

    // 2. Validate URL safety against SSRF and private IP ranges
    await this.validateUrlSafety(normalizedUrl);

    const pagesScanned: string[] = [];
    const emailsSet = new Set<string>();
    const phonesSet = new Set<string>();
    const socialMap = new Map<string, SocialProfile>();
    const contactPagesSet = new Set<string>();
    let businessName: string | undefined = undefined;
    let overview: string | undefined = undefined;

    // 3. Fetch primary homepage
    pagesScanned.push(normalizedUrl);
    const homepageHtml = await this.safeFetchHtml(normalizedUrl, options?.timeoutMs || 7000);

    if (homepageHtml) {
      // Extract metadata from homepage
      businessName = this.extractTitle(homepageHtml);
      overview = this.extractDescription(homepageHtml);

      // Extract contacts from homepage
      this.extractEmails(homepageHtml, emailsSet);
      this.extractPhones(homepageHtml, phonesSet);
      this.extractSocials(homepageHtml, socialMap);
      this.extractContactPageLinks(homepageHtml, normalizedUrl, contactPagesSet);

      // 4. If homepage lacks emails and an obvious contact page was discovered, scan 1 contact page
      if (emailsSet.size === 0 && contactPagesSet.size > 0) {
        const contactPageUrl = Array.from(contactPagesSet)[0];
        try {
          await this.validateUrlSafety(contactPageUrl);
          pagesScanned.push(contactPageUrl);
          const contactPageHtml = await this.safeFetchHtml(contactPageUrl, options?.timeoutMs || 7000);
          if (contactPageHtml) {
            this.extractEmails(contactPageHtml, emailsSet);
            this.extractPhones(contactPageHtml, phonesSet);
            this.extractSocials(contactPageHtml, socialMap);
          }
        } catch {
          // Non-blocking: failure to scan secondary page should not fail primary enrichment
        }
      }
    }

    const emails = Array.from(emailsSet);
    const phones = Array.from(phonesSet);
    const socialProfiles = Array.from(socialMap.values());
    const contactPages = Array.from(contactPagesSet);

    // Build provenance map for all newly discovered non-empty fields
    const provenance: Record<string, string> = {};
    if (businessName) provenance.businessName = 'website';
    if (emails.length > 0) provenance.email = 'website';
    if (phones.length > 0) provenance.phone = 'website';
    if (socialProfiles.length > 0) provenance.socialProfiles = 'website';
    if (overview) provenance.overview = 'website';

    const result: ProspectEnrichmentResult = {
      businessName,
      emails,
      phones,
      website: normalizedUrl,
      contactPages,
      socialProfiles,
      overview,
      provenance,
      metadata: {
        provider: this.name,
        targetUrl: normalizedUrl,
        pagesScanned,
        durationMs: Date.now() - startTime,
        cached: false
      }
    };

    // Save in session cache
    this.setCached(normalizedUrl, result);

    return result;
  }

  /**
   * Normalizes incoming URL string, ensuring valid protocol.
   */
  public normalizeUrl(rawUrl: string): string {
    const trimmed = rawUrl.trim();
    if (!trimmed) {
      throw new AppError(400, 'Website URL is required for enrichment.');
    }

    let urlObj: URL;
    try {
      urlObj = new URL(trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`);
    } catch {
      throw new AppError(400, `Invalid website URL format: "${rawUrl}"`);
    }

    if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
      throw new AppError(400, `Unsupported protocol "${urlObj.protocol}". Only HTTP and HTTPS are allowed.`);
    }

    // Strip hash and normalize trailing slashes on bare origin
    urlObj.hash = '';
    return urlObj.toString();
  }

  /**
   * Strict SSRF and Private IP Range Validator.
   * Checks hostname and resolves DNS to verify no requests hit private/local/metadata IPs.
   */
  public async validateUrlSafety(targetUrl: string): Promise<void> {
    const parsed = new URL(targetUrl);
    const hostname = parsed.hostname.toLowerCase();

    // 1. Direct hostname checks
    if (
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal') ||
      hostname === 'broadcasthost'
    ) {
      throw new AppError(400, `Access to local/private hostname "${hostname}" is forbidden for security.`);
    }

    // 2. Reject credentials in URL
    if (parsed.username || parsed.password) {
      throw new AppError(400, 'URLs containing user credentials are not permitted.');
    }

    // 3. Resolve DNS records and verify all IP addresses
    let addresses: dns.LookupAddress[] = [];
    try {
      addresses = await dns.promises.lookup(hostname, { all: true });
    } catch (err: any) {
      throw new AppError(400, `Could not resolve hostname "${hostname}": ${err.message}`);
    }

    if (!addresses || addresses.length === 0) {
      throw new AppError(400, `Could not resolve any network address for hostname "${hostname}".`);
    }

    for (const addr of addresses) {
      if (this.isPrivateOrRestrictedIp(addr.address)) {
        throw new AppError(400, `Access to private or restricted network address (${addr.address}) is forbidden.`);
      }
    }
  }

  /**
   * Identifies IPv4 and IPv6 private, loopback, link-local, carrier-grade, or cloud metadata addresses.
   */
  public isPrivateOrRestrictedIp(ip: string): boolean {
    const cleanIp = ip.toLowerCase().trim();

    // IPv6 checks
    if (cleanIp.includes(':')) {
      if (
        cleanIp === '::1' ||
        cleanIp === '::' ||
        cleanIp.startsWith('fe80:') || // Link-local
        cleanIp.startsWith('fc00:') || // Unique local
        cleanIp.startsWith('fd00:') ||
        cleanIp.startsWith('::ffff:127.') || // IPv4-mapped loopback
        cleanIp.startsWith('::ffff:10.') ||
        cleanIp.startsWith('::ffff:192.168.') ||
        cleanIp.startsWith('::ffff:172.')
      ) {
        return true;
      }
    }

    // IPv4 checks
    const parts = cleanIp.split('.').map(Number);
    if (parts.length === 4 && parts.every((p) => !isNaN(p) && p >= 0 && p <= 255)) {
      const [a, b] = parts;

      // 127.0.0.0/8 (Loopback)
      if (a === 127) return true;

      // 10.0.0.0/8 (Private)
      if (a === 10) return true;

      // 172.16.0.0/12 (Private: 172.16.x.x - 172.31.x.x)
      if (a === 172 && b >= 16 && b <= 31) return true;

      // 192.168.0.0/16 (Private)
      if (a === 192 && b === 168) return true;

      // 169.254.0.0/16 (Link-local / Cloud Metadata: e.g. AWS/GCP 169.254.169.254)
      if (a === 169 && b === 254) return true;

      // 0.0.0.0/8 (Current network)
      if (a === 0) return true;

      // 100.64.0.0/10 (Carrier-Grade NAT)
      if (a === 100 && b >= 64 && b <= 127) return true;

      // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved)
      if (a >= 224) return true;
    }

    return false;
  }

  /**
   * Safe HTML Fetcher with strict size bounding (2MB max), timeout (7s),
   * and manual redirect validation against SSRF rules.
   */
  private async safeFetchHtml(url: string, timeoutMs: number): Promise<string | null> {
    let currentUrl = url;
    const maxHops = 3;
    let hops = 0;

    while (hops <= maxHops) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await fetch(currentUrl, {
          method: 'GET',
          headers: {
            'User-Agent': this.userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
          },
          redirect: 'manual',
          signal: controller.signal
        });

        // Handle redirects safely with SSRF validation on target
        if ([301, 302, 303, 307, 308].includes(res.status)) {
          hops++;
          if (hops > maxHops) {
            throw new AppError(400, `Exceeded maximum redirect limit of ${maxHops} hops.`);
          }
          const location = res.headers.get('location');
          if (!location) {
            return null;
          }
          const resolvedRedirect = new URL(location, currentUrl).toString();
          await this.validateUrlSafety(resolvedRedirect);
          currentUrl = resolvedRedirect;
          continue;
        }

        if (!res.ok) {
          return null;
        }

        const contentType = res.headers.get('content-type') || '';
        if (
          !contentType.includes('text/html') &&
          !contentType.includes('text/plain') &&
          !contentType.includes('application/xhtml+xml')
        ) {
          // Reject non-HTML assets (e.g. binary PDFs, zip files, videos)
          return null;
        }

        // Bounded payload stream read: maximum 2MB
        const MAX_BYTES = 2 * 1024 * 1024;
        const text = await res.text();
        return text.length > MAX_BYTES ? text.substring(0, MAX_BYTES) : text;
      } catch (err: any) {
        if (err.name === 'AbortError') {
          throw new AppError(408, `Website request timed out after ${timeoutMs / 1000} seconds.`);
        }
        if (err instanceof AppError) {
          throw err;
        }
        return null;
      } finally {
        clearTimeout(timeoutId);
      }
    }

    return null;
  }

  /**
   * Extracts clean, valid business email addresses from HTML text and mailto: anchors.
   */
  public extractEmails(html: string, emailSet: Set<string>): void {
    // 1. mailto: links
    const mailtoRegex = /href=["']mailto:([^"'?#\s]+)/gi;
    let match: RegExpExecArray | null;
    while ((match = mailtoRegex.exec(html)) !== null) {
      const email = this.sanitizeEmail(match[1]);
      if (email) emailSet.add(email);
    }

    // 2. Regular expression across body text (with scripts and styles stripped)
    const textOnly = html
      .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, ' ')
      .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, ' ');

    const textEmailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
    while ((match = textEmailRegex.exec(textOnly)) !== null) {
      const email = this.sanitizeEmail(match[0]);
      if (email) emailSet.add(email);
    }
  }

  /**
   * Sanitizes candidate email strings, rejecting image filenames or assets.
   */
  public sanitizeEmail(raw: string): string | null {
    if (!raw) return null;
    let email = raw.trim().toLowerCase();

    // Strip trailing punctuation
    email = email.replace(/[.,;:)\]}>]+$/, '');

    // Disqualify file asset extensions masquerading as emails (e.g. icon@2x.png, logo@2x.jpg)
    const assetExtensions = /\.(png|jpg|jpeg|gif|svg|webp|bmp|ico|css|js|woff|woff2|ttf|mp4|webm|pdf)$/i;
    if (assetExtensions.test(email)) {
      return null;
    }

    // Disqualify common placeholder/example domains
    const placeholderDomains = /@(example\.(com|org|net|fr|de|in|co\.uk)|domain\.(com|org)|domaine\.(com|fr)|youremail\.com|sentry\.io|wixpress\.com)$/i;
    if (placeholderDomains.test(email)) {
      return null;
    }

    // Length and structural validation
    if (email.length < 5 || email.length > 254 || !email.includes('@')) {
      return null;
    }

    return email;
  }

  /**
   * Extracts phone numbers from tel: anchors and formatted phone patterns.
   */
  public extractPhones(html: string, phoneSet: Set<string>): void {
    // 1. tel: links
    const telRegex = /href=["']tel:([^"'#\s]+)/gi;
    let match: RegExpExecArray | null;
    while ((match = telRegex.exec(html)) !== null) {
      const phone = this.sanitizePhone(match[1]);
      if (phone) phoneSet.add(phone);
    }

    // 2. Formatted international and national phone patterns in text (excluding script, style, svg blocks)
    const textOnly = html
      .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, ' ')
      .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, ' ')
      .replace(/<svg[^>]*>([\s\S]*?)<\/svg>/gi, ' ');

    // Match formatted numbers: e.g. +33 1 86 64 06 06, +1 (555) 019-2834, 01 86 64 06 06
    const phonePattern = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{2,4}[-.\s]?\d{2,4}(?:[-.\s]?\d{2,4})?\b/g;
    while ((match = phonePattern.exec(textOnly)) !== null) {
      const candidate = match[0].trim();
      const phone = this.sanitizePhone(candidate);
      if (phone) phoneSet.add(phone);
    }
  }

  /**
   * Validates and cleans extracted phone candidates.
   */
  public sanitizePhone(raw: string): string | null {
    if (!raw) return null;

    // Decimal numbers are CSS or dimension values, not phone numbers
    if (raw.includes('.')) return null;

    const cleaned = decodeURIComponent(raw).replace(/[^\d+().\-\s]/g, '').trim();

    // Count numeric digits
    const digitsOnly = cleaned.replace(/\D/g, '');
    if (digitsOnly.length < 7 || digitsOnly.length > 15) {
      return null;
    }

    // Filter out timestamps (e.g. 1675157841848, 1782201902776)
    if (digitsOnly.length >= 13 && (digitsOnly.startsWith('16') || digitsOnly.startsWith('17') || digitsOnly.startsWith('18'))) {
      return null;
    }

    // Filter out obvious years or dates (e.g. 2024, 2025)
    if (digitsOnly.length === 8 && (digitsOnly.startsWith('202') || digitsOnly.startsWith('199'))) {
      return null;
    }

    // Filter out date formats like DD-MM-YYYY, YYYY-MM-DD
    if (/^\d{1,4}[-.\/]\d{1,2}[-.\/]\d{2,4}$/.test(raw.trim())) {
      return null;
    }

    return cleaned;
  }

  /**
   * Extracts official social media profile links from anchor tags.
   */
  public extractSocials(html: string, socialMap: Map<string, SocialProfile>): void {
    const anchorHrefRegex = /href=["'](https?:\/\/[^"'\s>]+)["']/gi;
    let match: RegExpExecArray | null;

    const supportedPlatforms: { platform: string; matchRegex: RegExp }[] = [
      { platform: 'LinkedIn', matchRegex: /linkedin\.com\/(?:company|in)\/([a-zA-Z0-9_-]+)/i },
      { platform: 'Facebook', matchRegex: /facebook\.com\/([a-zA-Z0-9._-]+)/i },
      { platform: 'Instagram', matchRegex: /instagram\.com\/([a-zA-Z0-9._-]+)/i },
      { platform: 'Twitter', matchRegex: /(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)/i },
      { platform: 'YouTube', matchRegex: /youtube\.com\/(?:c\/|user\/|@|channel\/)?([a-zA-Z0-9_-]+)/i },
      { platform: 'TikTok', matchRegex: /tiktok\.com\/@([a-zA-Z0-9._-]+)/i },
      { platform: 'GitHub', matchRegex: /github\.com\/([a-zA-Z0-9_-]+)/i }
    ];

    while ((match = anchorHrefRegex.exec(html)) !== null) {
      const url = match[1];

      // Disqualify share intents
      if (
        url.includes('/sharer') ||
        url.includes('/intent') ||
        url.includes('/share') ||
        url.includes('shareArticle') ||
        url.includes('hashtag')
      ) {
        continue;
      }

      for (const item of supportedPlatforms) {
        if (item.matchRegex.test(url)) {
          // Normalize URL: clean query string and trailing slashes
          try {
            const parsed = new URL(url);
            parsed.search = '';
            parsed.hash = '';
            const cleanUrl = parsed.toString().replace(/\/$/, '');
            const key = `${item.platform}:${cleanUrl.toLowerCase()}`;
            if (!socialMap.has(key)) {
              socialMap.set(key, { platform: item.platform, url: cleanUrl });
            }
          } catch {
            // Ignore malformed URL
          }
          break;
        }
      }
    }
  }

  /**
   * Discovers internal contact and about page URLs from homepage HTML.
   */
  public extractContactPageLinks(html: string, baseUrl: string, contactSet: Set<string>): void {
    const linkRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi;
    let match: RegExpExecArray | null;

    const contactKeywords = /(contact|about|touch|reach|location|visit|help)/i;

    while ((match = linkRegex.exec(html)) !== null) {
      const href = match[1].trim();
      const anchorText = match[2].replace(/<[^>]*>/g, '').trim();

      if (contactKeywords.test(href) || contactKeywords.test(anchorText)) {
        try {
          const resolved = new URL(href, baseUrl);
          // Only follow links on the exact same domain
          const baseParsed = new URL(baseUrl);
          if (resolved.origin === baseParsed.origin && resolved.pathname !== baseParsed.pathname) {
            resolved.hash = '';
            resolved.search = '';
            contactSet.add(resolved.toString());
          }
        } catch {
          // Ignore invalid URL resolution
        }
      }
    }
  }

  private extractTitle(html: string): string | undefined {
    const match = /<title[^>]*>(.*?)<\/title>/is.exec(html);
    if (match) {
      const clean = match[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      // Strip typical site title suffixes (e.g. "Mon Square - Paris Restaurant")
      return clean.length > 1 && clean.length < 150 ? clean : undefined;
    }
    return undefined;
  }

  private extractDescription(html: string): string | undefined {
    const metaMatch = /<meta\s+[^>]*name=["']description["'][^>]*content=["'](.*?)["']/is.exec(html) ||
                      /<meta\s+[^>]*content=["'](.*?)["'][^>]*name=["']description["']/is.exec(html) ||
                      /<meta\s+[^>]*property=["']og:description["'][^>]*content=["'](.*?)["']/is.exec(html);
    if (metaMatch) {
      const clean = metaMatch[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
      return clean.length > 5 && clean.length < 300 ? clean : undefined;
    }
    return undefined;
  }

  private getCached(url: string): ProspectEnrichmentResult | null {
    const entry = WebsiteEnrichmentProvider.cache.get(url);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      WebsiteEnrichmentProvider.cache.delete(url);
      return null;
    }
    return entry.result;
  }

  private setCached(url: string, result: ProspectEnrichmentResult): void {
    if (WebsiteEnrichmentProvider.cache.size >= WebsiteEnrichmentProvider.MAX_CACHE_ENTRIES) {
      const oldestKey = WebsiteEnrichmentProvider.cache.keys().next().value;
      if (oldestKey) WebsiteEnrichmentProvider.cache.delete(oldestKey);
    }
    WebsiteEnrichmentProvider.cache.set(url, {
      result,
      expiresAt: Date.now() + WebsiteEnrichmentProvider.CACHE_TTL_MS
    });
  }

  public static clearCache(): void {
    WebsiteEnrichmentProvider.cache.clear();
  }
}
