import { DestroyRef, Injectable, inject, signal } from '@angular/core';

/** Tracks document.visibilityState as a signal so polling/animations can pause off-screen. */
@Injectable({ providedIn: 'root' })
export class VisibilityService {
  private readonly hiddenSignal = signal(typeof document !== 'undefined' && document.hidden);
  readonly hidden = this.hiddenSignal.asReadonly();

  constructor() {
    if (typeof document === 'undefined') return;
    const destroyRef = inject(DestroyRef);
    const handler = () => this.hiddenSignal.set(document.hidden);
    document.addEventListener('visibilitychange', handler);
    destroyRef.onDestroy(() => document.removeEventListener('visibilitychange', handler));
  }
}
