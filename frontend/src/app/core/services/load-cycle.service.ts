import { Injectable, signal } from '@angular/core';

/**
 * Tags every HTTP request belonging to one `DashboardStore.loadAll()` invocation with a shared
 * ID (via `loadCycleInterceptor`), so backend logs can tell "one load cycle, several routes"
 * apart from "several separate load cycles" (double init, manual reloads, retries, etc.).
 */
@Injectable({ providedIn: 'root' })
export class LoadCycleService {
  private readonly currentIdSignal = signal<string | null>(null);

  readonly currentId = this.currentIdSignal.asReadonly();

  startNewCycle(): string {
    const id = crypto.randomUUID();
    this.currentIdSignal.set(id);
    return id;
  }
}
