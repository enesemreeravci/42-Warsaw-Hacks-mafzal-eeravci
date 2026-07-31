import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { LoadCycleService } from '../services/load-cycle.service';

/** Stamps every same-origin API request with the current dashboard load-cycle ID, purely for backend diagnostic correlation - never used for auth or app logic. */
export const loadCycleInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api')) {
    return next(req);
  }

  const loadId = inject(LoadCycleService).currentId();
  if (!loadId) {
    return next(req);
  }

  return next(req.clone({ setHeaders: { 'X-Dashboard-Load-ID': loadId } }));
};
