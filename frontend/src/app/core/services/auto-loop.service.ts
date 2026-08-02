import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TvModeService } from './tv-mode.service';

export type LoopMode = 'manual' | 'auto';

/**
 * Orchestrates the outer TV Mode <-> Dashboard loop for "Auto" mode: TV Mode first (its own
 * already-automatic section rotation, unchanged) -> Dashboard (scrolled through section-by-section
 * by DashboardPage, which owns the actual scrollable elements) -> back to TV Mode -> repeat,
 * forever, until switched back to "Manual".
 *
 * This service owns only the parts that don't need DOM access: the mode flag itself, redirecting
 * to /dashboard when Auto is turned on from elsewhere (TV mode's rotation content only exists
 * inside DashboardPage's own template, so both phases require that route), kicking off the TV
 * phase the moment Auto is freshly switched on, and detecting when TV mode has completed one full
 * lap (its active section wrapping from the last one back to 0) so it can hand control over to
 * the dashboard phase. The dashboard-scrolling phase itself is driven by DashboardPage (see
 * startAutoScroll()/stopAutoScroll() there), reacting to `isAuto() && !tvMode.enabled()` - which
 * is also what hands back to the TV phase once dashboard scrolling finishes (see enterTvPhase()).
 */
@Injectable({ providedIn: 'root' })
export class AutoLoopService {
  private readonly router = inject(Router);
  private readonly tvMode = inject(TvModeService);

  private readonly modeSignal = signal<LoopMode>('manual');
  readonly mode = this.modeSignal.asReadonly();
  readonly isAuto = computed(() => this.modeSignal() === 'auto');

  /** Tracks TvModeService.activeSection() across effect runs so a wrap from the last section
   * back to 0 can be told apart from simply starting at 0. */
  private lastSeenSection = 0;

  constructor() {
    // Auto mode only makes sense on the dashboard route (that's the only place with a Dashboard
    // phase to scroll through) - turning it on from anywhere else jumps there first.
    effect(() => {
      if (!this.isAuto()) return;
      if (!this.router.url.startsWith('/dashboard')) {
        this.router.navigateByUrl('/dashboard');
      }
    });

    // Detects "TV mode just completed one full lap" and hands control back to the dashboard
    // phase. Deliberately ignores the intro (introComplete() gate) so the reset-to-section-0 at
    // the start of every TV session is never mistaken for a completed lap.
    effect(() => {
      if (!this.isAuto() || !this.tvMode.enabled() || !this.tvMode.introComplete()) {
        this.lastSeenSection = this.tvMode.activeSection();
        return;
      }

      const current = this.tvMode.activeSection();
      if (current === 0 && this.lastSeenSection === this.tvMode.sectionCount - 1) {
        this.tvMode.disable();
      }
      this.lastSeenSection = current;
    });
  }

  toggle(): void {
    this.setMode(this.modeSignal() === 'auto' ? 'manual' : 'auto');
  }

  setMode(mode: LoopMode): void {
    const wasAuto = this.isAuto();
    this.modeSignal.set(mode);

    // Auto starts with the TV phase, not the dashboard one - only on the manual->auto transition
    // (not e.g. every time this happens to be called with 'auto' again), and only if we're not
    // already mid-TV-rotation (in which case that's already effectively the TV phase in
    // progress, so there's nothing to kick off).
    if (mode === 'auto' && !wasAuto && !this.tvMode.enabled()) {
      this.tvMode.enable();
    }
  }

  /** Called by DashboardPage once it has scrolled through every dashboard section - advances
   * the loop into the TV Mode phase. */
  enterTvPhase(): void {
    if (!this.isAuto()) return;
    this.tvMode.enable();
  }
}
