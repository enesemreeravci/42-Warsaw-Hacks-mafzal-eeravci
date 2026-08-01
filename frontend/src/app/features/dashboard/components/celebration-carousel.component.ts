import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import type { ProjectCompletion } from '../../../core/models/api.models';
import { AvatarComponent } from '../../../shared/components/avatar/avatar.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';

const PERFECT_MARK = 100;

interface FeedCard {
  completion: ProjectCompletion;
  isPerfect: boolean;
}

/** Compact activity-feed grid of recently completed projects - a dense card per completion
 * (mini-avatar, project tag, score pill, time-ago, validation status) instead of a single
 * cycling spotlight or a tall, sparse stacked list. */
@Component({
  selector: 'app-celebration-carousel',
  standalone: true,
  imports: [AvatarComponent, EmptyStateComponent, RelativeTimePipe, MatIconModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (cards().length === 0) {
      <app-empty-state title="No recent completions" description="Validated project completions will appear here as they happen." />
    } @else {
      <div class="feed" role="list" aria-label="Recently completed projects">
        @for (card of cards(); track card.completion.projectUserId) {
          <a
            class="feed-card"
            [class.feed-card--fail]="!card.completion.validated"
            [routerLink]="['/students', card.completion.login]"
            role="listitem"
          >
            <app-avatar [imageUrl]="card.completion.imageUrl" [name]="card.completion.displayName" [size]="40" />

            <div class="feed-card__body">
              <div class="feed-card__row">
                <span class="feed-card__name">{{ card.completion.displayName }}</span>
                <mat-icon
                  class="feed-card__status"
                  [class.feed-card__status--fail]="!card.completion.validated"
                  [attr.aria-label]="card.completion.validated ? 'Validated' : 'Not validated'"
                >
                  {{ card.completion.validated ? 'check_circle' : 'cancel' }}
                </mat-icon>
              </div>

              <span class="feed-card__project">{{ card.completion.projectName }}</span>

              <div class="feed-card__meta">
                @if (card.completion.finalMark !== null) {
                  <span class="feed-card__score" [class.feed-card__score--perfect]="card.isPerfect">
                    {{ card.completion.finalMark }}/100
                  </span>
                }
                <span class="feed-card__time">{{ card.completion.completedAt | relativeTime }}</span>
              </div>
            </div>
          </a>
        }
      </div>
    }
  `,
  styles: `
    .feed {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: var(--space-3);
      max-height: 420px;
      overflow-y: auto;
      padding: 2px var(--space-1) 2px 2px;
    }

    .feed-card {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3);
      padding: var(--space-3);
      border-radius: var(--radius-md);
      border: 1px solid var(--glass-border);
      background: var(--glass-bg);
      backdrop-filter: blur(var(--glass-blur));
      -webkit-backdrop-filter: blur(var(--glass-blur));
      text-decoration: none;
      color: inherit;
      transition: transform 200ms ease, border-color 200ms ease, box-shadow 200ms ease;
    }

    .feed-card:hover {
      transform: translateY(-2px);
      border-color: var(--color-accent);
      box-shadow: 0 0 20px -6px var(--color-accent-glow);
    }

    .feed-card--fail:hover {
      border-color: var(--color-danger);
      box-shadow: 0 0 20px -6px rgba(255, 84, 112, 0.4);
    }

    .feed-card__body {
      min-width: 0;
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .feed-card__row {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .feed-card__name {
      flex: 1;
      min-width: 0;
      font-weight: 700;
      font-size: 0.92rem;
      color: var(--color-text-primary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .feed-card__status {
      flex-shrink: 0;
      font-size: 16px;
      width: 16px;
      height: 16px;
      color: var(--color-success);
    }

    .feed-card__status--fail {
      color: var(--color-danger);
    }

    .feed-card__project {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--color-accent);
      text-shadow: 0 0 12px var(--color-accent-glow);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .feed-card__meta {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      margin-top: 2px;
    }

    .feed-card__score {
      padding: 1px var(--space-2);
      border-radius: 999px;
      font-size: 0.72rem;
      font-weight: 800;
      color: var(--color-success);
      background: rgba(56, 225, 154, 0.1);
      border: 1px solid rgba(56, 225, 154, 0.3);
    }

    .feed-card--fail .feed-card__score {
      color: var(--color-danger);
      background: rgba(255, 84, 112, 0.1);
      border-color: rgba(255, 84, 112, 0.3);
    }

    .feed-card__score--perfect {
      color: var(--color-warn);
      background: rgba(255, 176, 32, 0.14);
      border-color: rgba(255, 176, 32, 0.4);
      box-shadow: 0 0 10px -1px rgba(255, 176, 32, 0.55);
    }

    .feed-card__time {
      font-size: 0.72rem;
      color: var(--color-text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    @media (prefers-reduced-motion: no-preference) {
      .feed-card {
        animation: feed-card-in 350ms cubic-bezier(0.2, 0.8, 0.2, 1) backwards;
      }
    }

    @keyframes feed-card-in {
      from {
        opacity: 0;
        transform: translateY(6px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  `,
})
export class CelebrationCarouselComponent {
  readonly completions = input.required<ProjectCompletion[]>();

  protected readonly cards = computed<FeedCard[]>(() =>
    this.completions().map((completion) => ({
      completion,
      isPerfect: completion.finalMark !== null && completion.finalMark >= PERFECT_MARK,
    })),
  );
}
