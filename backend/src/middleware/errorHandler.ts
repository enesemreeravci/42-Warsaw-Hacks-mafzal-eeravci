import type { NextFunction, Request, Response } from 'express';
import type { Logger } from '../config/logger.js';
import { Ft42ApiError } from '../services/ft42ApiClient.js';
import { DiscoveryError } from '../services/discoveryService.js';
import { TokenAcquisitionError } from '../services/tokenManager.js';
import { ApiError, sendError } from './envelope.js';

/** Wraps async route handlers so rejected promises reach the error middleware. */
export function asyncHandler(handler: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res, next).catch(next);
  };
}

export function notFoundHandler(_req: Request, res: Response): void {
  sendError(res, 'NOT_FOUND', 'The requested resource was not found.', 404);
}

/**
 * Central error translator: every error type is mapped to a safe code and
 * user-friendly message. Raw stack traces / upstream bodies never reach the browser.
 */
export function errorHandler(logger: Logger) {
  return (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
    if (err instanceof ApiError) {
      sendError(res, err.code, err.message, err.status);
      return;
    }
    if (err instanceof Ft42ApiError) {
      logger.error({ path: req.path, status: err.status }, 'Upstream 42 API error');
      const status = err.status === 404 ? 404 : err.status === 400 ? 400 : 502;
      sendError(res, err.code, 'The 42 API request could not be completed. Please try again shortly.', status);
      return;
    }
    if (err instanceof DiscoveryError) {
      sendError(res, 'DISCOVERY_FAILED', err.message, 502);
      return;
    }
    if (err instanceof TokenAcquisitionError) {
      logger.error({ path: req.path }, 'Token acquisition failed');
      sendError(res, 'AUTH_FAILED', 'Unable to authenticate with the 42 API. Check server credentials.', 502);
      return;
    }

    logger.error({ path: req.path, err: err instanceof Error ? err.message : String(err) }, 'Unhandled error');
    sendError(res, 'INTERNAL_ERROR', 'An unexpected error occurred.', 500);
  };
}
