import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { timer } from 'rxjs';
import type { ProjectCompletion } from '../../../core/models/api.models';
import { AvatarComponent } from '../../../shared/components/avatar/avatar.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import { VisibilityService } from '../../../core/services/visibility.service';

const ROTATION_MS = 5000;
const MAX_DOTS = 8;

/** Centered circular spotlight for recently completed projects - one avatar in a glowing ring,
 * dead-center, auto-cycling with a smooth fade/scale transition between profiles rather than an
 * instant swap or a wide strip of avatars. Pausable and screen-reader friendly. */
@Component({
  selector: 'app-celebration-carousel',
  standalone: true,
  imports: [AvatarComponent, EmptyStateComponent, RelativeTimePipe, MatIconModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (completions().length === 0) {
      <app-empty-state title="No recent completions" description="Validated project completions will appear here as they happen." />
    } @else {
      <div class="spotlight" role="region" aria-label="Recently completed projects" aria-live="polite">
        <button class="spotlight__nav spotlight__nav--prev" type="button" (click)="prev()" aria-label="Previous celebration">
          <mat-icon>chevron_left</mat-icon>
        </button>

        @for (item of [current()]; track index()) {
          @if (item) {
            <a class="spotlight__body" [routerLink]="['/students', item.login]">
              <span class="spotlight__ring" [class.spotlight__ring--fail]="!item.validated">
                <app-avatar [imageUrl]="item.imageUrl" [name]="item.displayName" [size]="96" />
              </span>
              <p class="spotlight__name">{{ item.displayName }}</p>
              <p class="spotlight__meta">
                completed <strong>{{ item.projectName }}</strong>
                @if (item.finalMark !== null) {
                  <span class="spotlight__mark">{{ item.finalMark }}/100</span>
                }
              </p>
              <p class="spotlight__time">{{ item.completedAt | relativeTime }}</p>
            </a>
          }
        }

        <button class="spotlight__nav spotlight__nav--next" type="button" (click)="next()" aria-label="Next celebration">
          <mat-icon>chevron_right</mat-icon>
        </button>

        <div class="spotlight__controls">
          @if (dots().length > 1) {
            <div class="spotlight__dots" role="tablist" aria-label="Celebration slides">
              @for (dot of dots(); track dot) {
                <span class="dot" [class.dot--active]="dot === index()"></span>
              }
            </div>
          }
          <button
            class="spotlight__pause"
            type="button"
            (click)="togglePause()"
            [attr.aria-pressed]="paused()"
            aria-label="Pause or resume rotation"
          >
            <mat-icon>{{ paused() ? 'play_arrow' : 'pause' }}</mat-icon>
          </button>
        </div>
      </div>
    }
  `,
  styles: `
    .spotlight {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-2);
      text-align: center;
      padding: var(--space-2) var(--space-8);
    }

    .spotlight__body {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-decoration: none;
      color: inherit;
      animation: spotlight-cycle-in 450ms cubic-bezier(0.2, 0.8, 0.2, 1);
    }

    @keyframes spotlight-cycle-in {
      from {
        opacity: 0;
        transform: scale(0.88);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }

    .spotlight__ring {
      display: flex;
      padding: 5px;
      border-radius: 50%;
      border: 2px solid var(--color-accent-strong);
      box-shadow: 0 0 26px -2px var(--color-accent-glow);
      transition: transform 300ms ease;
    }

    .spotlight__body:hover .spotlight__ring {
      transform: scale(1.03);
    }

    .spotlight__ring--fail {
      border-color: var(--color-danger);
      box-shadow: 0 0 26px -2px rgba(255, 84, 112, 0.4);
    }

    .spotlight__nav {
      position: absolute;
      top: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      border: 1px solid var(--color-border);
      background: var(--color-bg-elevated);
      color: var(--color-text-secondary);
      cursor: pointer;
      flex-shrink: 0;

      mat-icon {
        font-size: 20px;
        width: 20px;
        height: 20px;
      }
    }

    .spotlight__nav--prev {
      left: var(--space-3);
    }

    .spotlight__nav--next {
      right: var(--space-3);
    }

    .spotlight__nav:hover {
      border-color: var(--color-accent);
      color: var(--color-text-primary);
    }

    .spotlight__name {
      margin: var(--space-2) 0 0;
      font-weight: 700;
      font-size: 1.1rem;
    }

    .spotlight__meta {
      margin: 2px 0 0;
      color: var(--color-text-secondary);
      font-size: 0.88rem;
    }

    .spotlight__mark {
      margin-left: var(--space-2);
      color: var(--color-success);
      font-weight: 700;
    }

    .spotlight__time {
      margin: 2px 0 0;
      color: var(--color-text-muted);
      font-size: 0.8rem;
    }

    .spotlight__controls {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      margin-top: var(--space-2);
    }

    .spotlight__dots {
      display: flex;
      gap: 5px;
    }

    .dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--color-border-strong);
    }

    .dot--active {
      background: var(--color-accent);
      width: 16px;
      border-radius: 999px;
      transition: width var(--transition-standard);
    }

    .spotlight__pause {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      border-radius: 50%;
      border: 1px solid var(--color-border);
      background: var(--color-bg-elevated);
      color: var(--color-text-secondary);
      cursor: pointer;
      flex-shrink: 0;

      mat-icon {
        font-size: 16px;
        width: 16px;
        height: 16px;
      }
    }

    .spotlight__pause:hover {
      border-color: var(--color-accent);
      color: var(--color-text-primary);
    }

    @media (max-width: 560px) {
      .spotlight {
        padding: var(--space-2) var(--space-7);
      }
    }
  `,
})
export class CelebrationCarouselComponent {
  readonly completions = input.required<ProjectCompletion[]>();

  private readonly visibility = inject(VisibilityService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly index = signal(0);
  protected readonly paused = signal(false);

  protected readonly current = computed(() => this.completions()[this.index()] ?? null);

  /** Dot positions to show, capped so a long completions list doesn't produce an unreadable row. */
  protected readonly dots = computed(() => {
    const length = Math.min(this.completions().length, MAX_DOTS);
    return Array.from({ length }, (_, i) => i);
  });

  constructor() {
    timer(ROTATION_MS, ROTATION_MS)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.paused() || this.visibility.hidden() || this.completions().length <= 1) return;
        this.next();
      });

    effect(() => {
      const length = this.completions().length;
      if (this.index() >= length) {
        this.index.set(0);
      }
    });
  }

  protected next(): void {
    const length = this.completions().length;
    if (length === 0) return;
    this.index.update((i) => (i + 1) % length);
  }

  protected prev(): void {
    const length = this.completions().length;
    if (length === 0) return;
    this.index.update((i) => (i - 1 + length) % length);
  }

  protected togglePause(): void {
    this.paused.update((v) => !v);
  }
}
