import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { ReturningStudentEntry, ReturningStudentsResponse } from '../../../core/models/api.models';
import { ApiService } from '../../../core/services/api.service';
import { TvModeService } from '../../../core/services/tv-mode.service';
import { AvatarComponent } from '../../../shared/components/avatar/avatar.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';

/** How many of the top returning students rotate through the spotlight. */
const SPOTLIGHT_SIZE = 5;
const ROTATION_MS = 9000;

/**
 * "Welcome Back": a slow-rotating spotlight of students returning to campus after a meaningful
 * absence (backend/src/services/returningStudents.ts - never fabricated, only students whose
 * gap since their last visit was confidently measured from real session history are ever shown
 * here). For TV mode; a fresh instance refetches each time TV mode's rotation cycles back here.
 */
@Component({
  selector: 'app-returning-students',
  standalone: true,
  imports: [AvatarComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="returning">
      @if (loading()) {
        <app-empty-state title="Checking who's back on campus…" />
      } @else if (spotlight().length === 0) {
        <app-empty-state title="No returning students during this period." />
      } @else {
        <div class="returning__summary">
          <div class="stat">
            <span class="stat__value">{{ data()!.totalReturningStudents }}</span>
            <span class="stat__label">Returned This Period</span>
          </div>
          <div class="stat">
            <span class="stat__value">{{ longestAbsence() }}d</span>
            <span class="stat__label">Longest Absence</span>
          </div>
          <div class="stat">
            <span class="stat__value">{{ averageAbsence() }}d</span>
            <span class="stat__label">Average Inactive Period</span>
          </div>
        </div>

        <div class="returning__spotlight">
          @for (student of spotlight(); track student.userId; let i = $index) {
            @if (i === activeIndex()) {
              <div class="spotlight-card">
                <app-avatar [imageUrl]="student.imageUrl" [name]="student.displayName" [size]="avatarSize()" />
                <p class="spotlight-card__headline">
                  <strong>{{ student.login }}</strong> is back after {{ student.inactiveDays }} days
                </p>
                <div class="spotlight-card__meta">
                  <span>Level {{ student.level.toFixed(2) }}</span>
                  @if (student.coalition) {
                    <span>{{ student.coalition.name }}</span>
                  }
                  @if (student.currentlyOnline) {
                    <span class="spotlight-card__online">● Online now</span>
                  }
                </div>
              </div>
            }
          }
        </div>

        <div class="returning__dots" aria-hidden="true">
          @for (student of spotlight(); track student.userId; let i = $index) {
            <span class="dot" [class.dot--active]="i === activeIndex()"></span>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .returning {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-5);
      height: 100%;
      min-height: 60vh;
      // space-evenly (not center) spreads the summary/spotlight/dots across the full available
      // height instead of clumping them together in the middle with dead space above and below.
      justify-content: space-evenly;
    }

    .returning__summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: var(--space-3);
      width: 100%;
    }

    .stat {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: var(--space-3) var(--space-4);
      border-radius: var(--radius-md);
      border: 1px solid var(--glass-border);
      background: var(--glass-bg-elevated);
      backdrop-filter: blur(var(--glass-blur));
      -webkit-backdrop-filter: blur(var(--glass-blur));
      text-align: center;
    }

    .stat__value {
      font-size: 1.6rem;
      font-weight: 800;
      color: var(--color-accent);
    }

    .stat__label {
      font-size: 0.7rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-text-muted);
    }

    .returning__spotlight {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 280px;
    }

    .spotlight-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-3);
      text-align: center;
    }

    @media (prefers-reduced-motion: no-preference) {
      .spotlight-card {
        animation: returning-fade-in 600ms ease-out;
      }
    }

    @keyframes returning-fade-in {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .spotlight-card__headline {
      margin: 0;
      font-size: 1.5rem;
      color: var(--color-text-primary);
    }

    .spotlight-card__headline strong {
      color: var(--color-accent-strong);
    }

    .spotlight-card__meta {
      display: flex;
      gap: var(--space-3);
      font-size: 0.9rem;
      color: var(--color-text-secondary);
    }

    .spotlight-card__online {
      color: var(--color-success);
      font-weight: 700;
    }

    .returning__dots {
      display: flex;
      gap: var(--space-2);
    }

    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--color-border-strong);
    }

    @media (prefers-reduced-motion: no-preference) {
      .dot {
        transition: background 300ms ease, transform 300ms ease;
      }
    }

    .dot--active {
      background: var(--color-accent-strong);
      transform: scale(1.3);
    }

    :host-context(.dashboard--tv) .spotlight-card__headline { font-size: 2.6rem; }
    :host-context(.dashboard--tv) .spotlight-card__meta { font-size: 1.15rem; gap: var(--space-4); }
    :host-context(.dashboard--tv) .stat__value { font-size: 2.6rem; }
    :host-context(.dashboard--tv) .stat__label { font-size: 0.85rem; }
    :host-context(.dashboard--tv) .stat { padding: var(--space-4) var(--space-5); }
    :host-context(.dashboard--tv) .dot { width: 12px; height: 12px; }
  `,
})
export class ReturningStudentsComponent {
  private readonly api = inject(ApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly tvMode = inject(TvModeService);

  protected readonly loading = signal(true);
  protected readonly data = signal<ReturningStudentsResponse | null>(null);
  protected readonly activeIndex = signal(0);

  /** The `size` avatar input renders as an inline pixel style, so a CSS-only
   * `:host-context(.dashboard--tv)` override can't reach it - this picks the TV-scaled size directly. */
  protected readonly avatarSize = computed(() => (this.tvMode.enabled() ? 220 : 140));

  protected readonly spotlight = computed<ReturningStudentEntry[]>(() => this.data()?.students.slice(0, SPOTLIGHT_SIZE) ?? []);

  protected readonly longestAbsence = computed(() => Math.max(0, ...this.data()?.students.map((s) => s.inactiveDays) ?? [0]));

  protected readonly averageAbsence = computed(() => {
    const students = this.data()?.students ?? [];
    if (students.length === 0) return 0;
    return Math.round(students.reduce((sum, s) => sum + s.inactiveDays, 0) / students.length);
  });

  constructor() {
    this.api
      .getReturningStudents('last7Days', 14, 'recent')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (envelope) => {
          this.data.set(envelope.data);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });

    const timer = setInterval(() => {
      const count = this.spotlight().length;
      if (count > 1) this.activeIndex.update((i) => (i + 1) % count);
    }, ROTATION_MS);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }
}
