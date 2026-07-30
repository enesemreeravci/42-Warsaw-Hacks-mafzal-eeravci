import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { timer } from 'rxjs';
import type { ProjectCompletion } from '../../../core/models/api.models';
import { AvatarComponent } from '../../../shared/components/avatar/avatar.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import { VisibilityService } from '../../../core/services/visibility.service';

const ROTATION_MS = 6000;

/** Auto-rotating showcase of recently completed projects, pausable and screen-reader friendly. */
@Component({
  selector: 'app-celebration-carousel',
  standalone: true,
  imports: [AvatarComponent, EmptyStateComponent, RelativeTimePipe, MatButtonModule, MatIconModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (completions().length === 0) {
      <app-empty-state title="No recent completions" description="Validated project completions will appear here as they happen." />
    } @else {
      <div class="carousel" role="region" aria-label="Recently completed projects" aria-live="polite">
        @if (current(); as item) {
          <a class="carousel__card" [routerLink]="['/students', item.login]">
            <app-avatar [imageUrl]="item.imageUrl" [name]="item.displayName" [size]="72" />
            <div class="carousel__details">
              <p class="carousel__name">{{ item.displayName }}</p>
              <p class="carousel__project">completed <strong>{{ item.projectName }}</strong></p>
              <p class="carousel__meta">
                @if (item.finalMark !== null) {
                  <span class="mark">{{ item.finalMark }}/100</span>
                }
                <span>{{ item.completedAt | relativeTime }}</span>
              </p>
            </div>
          </a>
        }

        <div class="carousel__controls">
          <button mat-icon-button type="button" (click)="prev()" aria-label="Previous celebration">
            <mat-icon>chevron_left</mat-icon>
          </button>
          <div class="carousel__dots" role="tablist" aria-label="Celebration slides">
            @for (item of completions(); track item.projectUserId; let i = $index) {
              <button
                class="dot"
                [class.dot--active]="i === index()"
                role="tab"
                [attr.aria-selected]="i === index()"
                [attr.aria-label]="'Show celebration ' + (i + 1)"
                (click)="goTo(i)"
              ></button>
            }
          </div>
          <button mat-icon-button type="button" (click)="next()" aria-label="Next celebration">
            <mat-icon>chevron_right</mat-icon>
          </button>
          <button mat-icon-button type="button" (click)="togglePause()" [attr.aria-pressed]="paused()" aria-label="Pause or resume rotation">
            <mat-icon>{{ paused() ? 'play_arrow' : 'pause' }}</mat-icon>
          </button>
        </div>
      </div>
    }
  `,
  styles: `
    .carousel {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    .carousel__card {
      display: flex;
      align-items: center;
      gap: var(--space-4);
      text-decoration: none;
      color: inherit;
      padding: var(--space-4);
      border-radius: var(--radius-lg);
      background: linear-gradient(120deg, rgba(52, 226, 196, 0.1), rgba(76, 201, 240, 0.04));
      border: 1px solid var(--color-border);
      transition: transform var(--transition-standard), border-color var(--transition-standard);

      &:hover {
        border-color: var(--color-accent);
      }
    }

    .carousel__name {
      margin: 0;
      font-size: 1.3rem;
      font-weight: 700;
    }

    .carousel__project {
      margin: var(--space-1) 0;
      color: var(--color-text-secondary);
    }

    .carousel__meta {
      margin: 0;
      display: flex;
      gap: var(--space-3);
      color: var(--color-text-muted);
      font-size: 0.9rem;
    }

    .mark {
      color: var(--color-success);
      font-weight: 700;
    }

    .carousel__controls {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2);
    }

    .carousel__dots {
      display: flex;
      gap: var(--space-1);
    }

    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      border: none;
      background: var(--color-border-strong);
      cursor: pointer;
      padding: 0;
    }

    .dot--active {
      background: var(--color-accent);
      width: 22px;
      border-radius: 999px;
      transition: width var(--transition-standard);
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

  protected goTo(i: number): void {
    this.index.set(i);
  }

  protected togglePause(): void {
    this.paused.update((v) => !v);
  }
}
