import { Request, Response, NextFunction } from 'express';

/**
 * Validates request body for POST /api/discovery/search.
 */
export const validateDiscoverySearch = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const { query, limit } = req.body;

  // 1. Query must be provided and non-empty
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    res.status(400).json({
      success: false,
      error: 'Search query is required and cannot be empty.'
    });
    return;
  }

  const trimmedQuery = query.trim();

  // 2. Minimum length check
  if (trimmedQuery.length < 2) {
    res.status(400).json({
      success: false,
      error: 'Search query must be at least 2 characters long.'
    });
    return;
  }

  // 3. Maximum length check
  if (trimmedQuery.length > 200) {
    res.status(400).json({
      success: false,
      error: 'Search query cannot exceed 200 characters.'
    });
    return;
  }

  // 4. Optional limit validation
  if (limit !== undefined && limit !== null) {
    const parsedLimit = Number(limit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 50) {
      res.status(400).json({
        success: false,
        error: 'Limit must be an integer between 1 and 50.'
      });
      return;
    }
  }

  // 5. Optional pagination cursor validation
  const { cursor } = req.body;
  if (cursor !== undefined && cursor !== null) {
    if (typeof cursor !== 'string' || cursor.trim().length === 0 || cursor.length > 200) {
      res.status(400).json({
        success: false,
        error: 'Cursor must be a valid non-empty string under 200 characters.'
      });
      return;
    }
  }

  next();
};

/**
 * Validates request body for POST /api/discovery/convert.
 */
export const validateConvertProspect = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const { prospect } = req.body;

  if (!prospect || typeof prospect !== 'object' || Array.isArray(prospect)) {
    res.status(400).json({
      success: false,
      error: 'A valid prospect object is required in request body.'
    });
    return;
  }

  if (!prospect.name || typeof prospect.name !== 'string' || prospect.name.trim().length === 0) {
    res.status(400).json({
      success: false,
      error: 'Prospect name is required.'
    });
    return;
  }

  next();
};

/**
 * Validates request body for POST /api/discovery/enrich.
 */
export const validateEnrichProspect = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const { prospect } = req.body;

  if (!prospect || typeof prospect !== 'object' || Array.isArray(prospect)) {
    res.status(400).json({
      success: false,
      error: 'A valid prospect object is required in request body.'
    });
    return;
  }

  if (!prospect.website || typeof prospect.website !== 'string' || prospect.website.trim().length === 0) {
    res.status(400).json({
      success: false,
      error: 'Prospect must have a non-empty website URL for enrichment.'
    });
    return;
  }

  const trimmedUrl = prospect.website.trim();

  // Basic format and protocol check
  let parsed: URL;
  try {
    parsed = new URL(trimmedUrl.startsWith('http://') || trimmedUrl.startsWith('https://') ? trimmedUrl : `https://${trimmedUrl}`);
  } catch {
    res.status(400).json({
      success: false,
      error: 'Website URL has an invalid format.'
    });
    return;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    res.status(400).json({
      success: false,
      error: 'Only HTTP and HTTPS protocols are allowed for enrichment.'
    });
    return;
  }

  // Pre-filter obvious localhost / loopback addresses
  const host = parsed.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local') || host.endsWith('.internal')) {
    res.status(400).json({
      success: false,
      error: 'Access to local or private network addresses is forbidden for security.'
    });
    return;
  }

  next();
};
