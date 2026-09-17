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
