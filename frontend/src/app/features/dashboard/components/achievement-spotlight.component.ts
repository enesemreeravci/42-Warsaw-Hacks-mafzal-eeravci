import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { AchievementEntry } from '../../../core/models/api.models';
import { AvatarComponent } from '../../../shared/components/avatar/avatar.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';

/** "Level Up" spotlight: cinematic auto-scrolling feed of recently completed projects, for TV mode. */
@Component({
  selector: 'app-achievement-spotlight',
  standalone: true,
  imports: [AvatarComponent, EmptyStateComponent, RelativeTimePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="spotlight">
      @if (achievements().length === 0) {
        <app-empty-state title="No recent completions" description="Validated project completions will appear here as they happen." />
      } @else {
        <div class="spotlight__viewport">
          <div class="spotlight__track">
            @for (item of loopedAchievements(); track $index) {
              <div class="spotlight__card" [class.spotlight__card--gold]="item.isTakeover">
                <app-avatar [imageUrl]="item.imageUrl" [name]="item.displayName" [size]="88" />
                <div class="spotlight__details">
                  <p class="spotlight__name">{{ item.displayName }}</p>
                  <p class="spotlight__project">completed <strong>{{ item.projectName }}</strong></p>
                  <p class="spotlight__meta">{{ item.completedAt | relativeTime }}</p>
                </div>
                @if (item.finalMark !== null) {
                  <span class="spotlight__score" [class.spotlight__score--gold]="item.isTakeover">{{ item.finalMark }}</span>
                }
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    .spotlight {
      display: flex;
      flex-direction: column;
      height: 100%;
      gap: var(--space-5);
    }

    .spotlight__viewport {
      flex: 1;
      min-height: 60vh;
      overflow: hidden;
      border-radius: var(--radius-lg);
      border: 1px solid var(--color-border);
      background: var(--color-bg-elevated);
      mask-image: linear-gradient(to bottom, transparent, black 8%, black 92%, transparent);
    }

    .spotlight__track {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      padding: var(--space-5);
    }

    @media (prefers-reduced-motion: no-preference) {
      .spotlight__track {
        animation: spotlight-scroll 24s linear infinite;
      }
    }

    @keyframes spotlight-scroll {
      0% { transform: translateY(0); }
      100% { transform: translateY(-50%); }
    }

    .spotlight__card {
      display: flex;
      align-items: center;
      gap: var(--space-4);
      padding: var(--space-4) var(--space-5);
      border-radius: var(--radius-lg);
      background: linear-gradient(120deg, rgba(52, 226, 196, 0.1), rgba(76, 201, 240, 0.04));
      border: 1px solid var(--color-border);
    }

    .spotlight__card--gold {
      border-color: var(--color-warn);
      background: linear-gradient(120deg, rgba(255, 176, 32, 0.16), rgba(255, 176, 32, 0.04));
    }

    .spotlight__details {
      flex: 1;
      min-width: 0;
    }

    .spotlight__name {
      margin: 0;
      font-size: 1.4rem;
      font-weight: 700;
    }

    .spotlight__project {
      margin: var(--space-1) 0;
      color: var(--color-text-secondary);
      font-size: 1.1rem;
    }

    .spotlight__meta {
      margin: 0;
      color: var(--color-text-muted);
      font-size: 0.9rem;
    }

    .spotlight__score {
      font-size: 1.6rem;
      font-weight: 800;
      color: var(--color-success);
      flex-shrink: 0;
    }

    .spotlight__score--gold {
      color: var(--color-warn);
      text-shadow: 0 0 16px rgba(255, 176, 32, 0.6);
    }
  `,
})
export class AchievementSpotlightComponent {
  readonly achievements = input.required<AchievementEntry[]>();

  /** Doubles the list so the CSS marquee loop (0% -> -50%) reads as seamless. */
  protected readonly loopedAchievements = computed(() => {
    const items = this.achievements();
    return items.length > 0 ? [...items, ...items] : items;
  });
}
