import type { Response } from 'express';

export function sendData<T>(res: Response, data: T, meta: Record<string, unknown> = {}, status = 200): void {
  res.status(status).json({
    data,
    meta: {
      generatedAt: new Date().toISOString(),
      cached: false,
      ...meta,
    },
  });
}

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 500,
  ) {
    super(message);
  }
}

export function sendError(res: Response, code: string, message: string, status = 500): void {
  res.status(status).json({ error: { code, message } });
}
