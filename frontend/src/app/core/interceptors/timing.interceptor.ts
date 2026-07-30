import { HttpInterceptorFn } from '@angular/common/http';
import { tap } from 'rxjs';
import { isDevMode } from '@angular/core';

/** Development-only diagnostic: logs request duration without ever touching headers/tokens. */
export const timingInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isDevMode()) {
    return next(req);
  }
  const start = performance.now();
  return next(req).pipe(
    tap({
      next: () => {
        const durationMs = Math.round(performance.now() - start);
        console.debug(`[timing] ${req.method} ${req.urlWithParams} - ${durationMs}ms`);
      },
    }),
  );
};
