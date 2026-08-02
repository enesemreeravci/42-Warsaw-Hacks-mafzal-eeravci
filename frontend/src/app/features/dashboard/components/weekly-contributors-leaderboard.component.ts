import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { WeeklyTopContributorsResponse } from '../../../core/models/api.models';
import { ApiService } from '../../../core/services/api.service';
import { AvatarComponent } from '../../../shared/components/avatar/avatar.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';

const TOP_N = 10;

/**
 * "Weekly Top Coalition Contributors": ranks students by coalition points earned during the
 * period, computed strictly from two real historical snapshots
 * (backend/src/services/weeklyTopContributors.ts / coalitionSnapshotStore.ts) - never from
 * current totals. Shows the required "not available yet" message verbatim until enough
 * snapshot history has accumulated, rather than fabricating a ranking. For TV mode.
 */
@Component({
  selector: 'app-weekly-contributors-leaderboard',
  standalone: true,
  imports: [AvatarComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="contributors">
      @if (loading()) {
        <app-empty-state title="Loading contributor rankings…" />
      } @else if (!data()?.available) {
        <app-empty-state
          title="Weekly contribution data is not available yet."
          description="Historical snapshots are required before contributor rankings can be calculated accurately."
        />
      } @else if (data()!.contributors.length === 0) {
        <app-empty-state title="No coalition points earned during this period yet." />
      } @else {
        <div class="contributors__summary">
          @if (data()!.summary.topContributor; as top) {
            <div class="stat">
              <span class="stat__value">{{ top.login }}</span>
              <span class="stat__label">Top Contributor · {{ top.pointsEarned }} pts</span>
            </div>
          }
          @if (data()!.summary.mostActiveCoalition; as coalition) {
            <div class="stat">
              <span class="stat__value">{{ coalition.name }}</span>
              <span class="stat__label">Most Active Coalition · +{{ coalition.pointsGained }} pts</span>
            </div>
          }
          <div class="stat">
            <span class="stat__value">{{ data()!.summary.totalPointsEarned }}</span>
            <span class="stat__label">Total Points Earned</span>
          </div>
          <div class="stat">
            <span class="stat__value">{{ data()!.summary.activeContributors }}</span>
            <span class="stat__label">Active Contributors</span>
          </div>
        </div>

        <ol class="contributors__list">
          @for (contributor of topContributors(); track contributor.userId) {
            <li class="contributor" [class.contributor--gold]="contributor.rank === 1" [class.contributor--silver]="contributor.rank === 2" [class.contributor--bronze]="contributor.rank === 3">
              <span class="contributor__rank">{{ contributor.rank === 1 ? '🏆' : '#' + contributor.rank }}</span>
              <app-avatar [imageUrl]="contributor.imageUrl" [name]="contributor.displayName" [size]="56" />
              <div class="contributor__details">
                <p class="contributor__login">{{ contributor.login }}</p>
                <p class="contributor__meta">
                  Level {{ contributor.level.toFixed(2) }}
                  @if (contributor.coalition) {
                    · {{ contributor.coalition.name }}
                  }
                </p>
              </div>
              <span class="contributor__points">+{{ contributor.pointsEarned }}</span>
              <span class="contributor__change" [class.contributor__change--up]="(contributor.rankChange ?? 0) > 0" [class.contributor__change--down]="(contributor.rankChange ?? 0) < 0">
                @if (contributor.rankChange === null) {
                  —
                } @else if (contributor.rankChange > 0) {
                  ↑ {{ contributor.rankChange }}
                } @else if (contributor.rankChange < 0) {
                  ↓ {{ -contributor.rankChange }}
                } @else {
                  —
                }
              </span>
            </li>
          }
        </ol>
      }
    </div>
  `,
  styles: `
    .contributors {
      display: flex;
      flex-direction: column;
      gap: var(--space-5);
      height: 100%;
      min-height: 60vh;
    }

    .contributors__summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: var(--space-3);
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
    }

    .stat__value {
      font-size: 1.4rem;
      font-weight: 800;
      color: var(--color-accent);
    }

    .stat__label {
      font-size: 0.68rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--color-text-muted);
    }

    .contributors__list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      overflow-y: auto;
    }

    .contributor {
      display: grid;
      grid-template-columns: 3rem auto 1fr auto auto;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-2) var(--space-4);
      border-radius: var(--radius-md);
      border: 1px solid var(--color-border);
      background: var(--color-bg-card);
    }

    .contributor--gold {
      border-color: #ffd700;
      box-shadow: 0 0 16px -4px rgba(255, 215, 0, 0.5);
    }

    .contributor--silver {
      border-color: #b0b8c8;
    }

    .contributor--bronze {
      border-color: #cd7f32;
    }

    .contributor__rank {
      font-size: 1.1rem;
      font-weight: 800;
      text-align: center;
      color: var(--color-text-secondary);
    }

    .contributor__details {
      min-width: 0;
    }

    .contributor__login {
      margin: 0;
      font-weight: 700;
      font-size: 1rem;
    }

    .contributor__meta {
      margin: 0;
      font-size: 0.78rem;
      color: var(--color-text-muted);
    }

    .contributor__points {
      font-weight: 800;
      font-size: 1.1rem;
      color: var(--color-success);
      white-space: nowrap;
    }

    .contributor__change {
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--color-text-muted);
      white-space: nowrap;
    }

    .contributor__change--up {
      color: var(--color-success);
    }

    .contributor__change--down {
      color: var(--color-danger);
    }

    :host-context(.dashboard--tv) .stat__value { font-size: 1.7rem; }
    :host-context(.dashboard--tv) .contributor__login { font-size: 1.2rem; }
    :host-context(.dashboard--tv) .contributor__points { font-size: 1.35rem; }
  `,
})
export class WeeklyContributorsLeaderboardComponent {
  private readonly api = inject(ApiService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly loading = signal(true);
  protected readonly data = signal<WeeklyTopContributorsResponse | null>(null);

  protected readonly topContributors = computed(() => this.data()?.contributors.slice(0, TOP_N) ?? []);

  constructor() {
    this.api
      .getWeeklyContributorLeaderboard(7)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (envelope) => {
          this.data.set(envelope.data);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }
}
