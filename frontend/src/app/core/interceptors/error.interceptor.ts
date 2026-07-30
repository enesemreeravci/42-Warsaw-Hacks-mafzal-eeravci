import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

export interface NormalizedApiError {
  code: string;
  message: string;
  status: number;
}

/** Normalizes every HTTP failure into a predictable shape components can render without guessing response format. */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse) {
        const backendError = err.error?.error as { code?: string; message?: string } | undefined;
        const normalized: NormalizedApiError = {
          code: backendError?.code ?? (err.status === 0 ? 'NETWORK_ERROR' : 'HTTP_ERROR'),
          message:
            backendError?.message ??
            (err.status === 0
              ? 'Could not reach the server. It may be starting up or unavailable.'
              : `Request failed with status ${err.status}.`),
          status: err.status,
        };
        return throwError(() => normalized);
      }
      return throwError(() => err);
    }),
  );
};
