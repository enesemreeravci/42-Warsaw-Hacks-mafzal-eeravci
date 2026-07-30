import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { EvaluationEntry } from '../../../core/models/api.models';
import { AvatarComponent } from '../../../shared/components/avatar/avatar.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';

/**
 * "Live Evaluations": a scrolling feed of recently completed peer defenses, for TV mode.
 * Deliberately shows only structured fields (project, pass/fail flag, mark) - evaluation
 * comments/feedback are never fetched by the backend, so there is nothing to leak here.
 */
@Component({
  selector: 'app-live-evaluations',
  standalone: true,
  imports: [AvatarComponent, EmptyStateComponent, RelativeTimePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="evaluations">
      <h2 class="evaluations__title">Live evaluations</h2>

      @if (evaluations().length === 0) {
        <app-empty-state title="No recent evaluations" description="Completed peer evaluations will appear here as they're filled in." />
      } @else {
        <div class="evaluations__viewport">
          <div class="evaluations__track">
            @for (item of loopedEvaluations(); track $index) {
              <div class="evaluations__card">
                <app-avatar [imageUrl]="item.correctedImageUrl" [name]="item.correctedDisplayName" [size]="72" />
                <div class="evaluations__details">
                  <p class="evaluations__name">{{ item.correctedDisplayName }}</p>
                  <p class="evaluations__project">evaluated on <strong>{{ item.projectName ?? 'Evaluation' }}</strong></p>
                  <p class="evaluations__meta">{{ item.filledAt | relativeTime }}</p>
                </div>
                @if (item.flagName) {
                  <span class="evaluations__flag" [class.evaluations__flag--positive]="item.flagPositive" [class.evaluations__flag--negative]="item.flagPositive === false">
                    {{ item.flagName }}
                  </span>
                }
                @if (item.finalMark !== null) {
                  <span class="evaluations__score">{{ item.finalMark }}</span>
                }
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    .evaluations {
      display: flex;
      flex-direction: column;
      height: 100%;
      gap: var(--space-5);
    }

    .evaluations__title {
      margin: 0;
      font-size: 2rem;
      font-weight: 800;
      letter-spacing: -0.01em;
    }

    .evaluations__viewport {
      flex: 1;
      min-height: 60vh;
      overflow: hidden;
      border-radius: var(--radius-lg);
      border: 1px solid var(--color-border);
      background: var(--color-bg-elevated);
      mask-image: linear-gradient(to bottom, transparent, black 8%, black 92%, transparent);
    }

    .evaluations__track {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      padding: var(--space-5);
    }

    @media (prefers-reduced-motion: no-preference) {
      .evaluations__track {
        animation: evaluations-scroll 26s linear infinite;
      }
    }

    @keyframes evaluations-scroll {
      0% { transform: translateY(0); }
      100% { transform: translateY(-50%); }
    }

    .evaluations__card {
      display: flex;
      align-items: center;
      gap: var(--space-4);
      padding: var(--space-4) var(--space-5);
      border-radius: var(--radius-lg);
      background: linear-gradient(120deg, rgba(76, 201, 240, 0.1), rgba(52, 226, 196, 0.04));
      border: 1px solid var(--color-border);
    }

    .evaluations__details {
      flex: 1;
      min-width: 0;
    }

    .evaluations__name {
      margin: 0;
      font-size: 1.3rem;
      font-weight: 700;
    }

    .evaluations__project {
      margin: var(--space-1) 0;
      color: var(--color-text-secondary);
    }

    .evaluations__meta {
      margin: 0;
      color: var(--color-text-muted);
      font-size: 0.9rem;
    }

    .evaluations__flag {
      font-size: 0.85rem;
      font-weight: 700;
      padding: var(--space-1) var(--space-3);
      border-radius: 999px;
      border: 1px solid var(--color-border-strong);
      color: var(--color-text-secondary);
      white-space: nowrap;
    }

    .evaluations__flag--positive {
      color: var(--color-success);
      border-color: var(--color-success);
      background: rgba(56, 225, 154, 0.08);
    }

    .evaluations__flag--negative {
      color: var(--color-danger);
      border-color: var(--color-danger);
      background: rgba(255, 84, 112, 0.08);
    }

    .evaluations__score {
      font-size: 1.4rem;
      font-weight: 800;
      color: var(--color-text-primary);
      flex-shrink: 0;
    }
  `,
})
export class LiveEvaluationsComponent {
  readonly evaluations = input.required<EvaluationEntry[]>();

  /** Doubles the list so the CSS marquee loop (0% -> -50%) reads as seamless. */
  protected readonly loopedEvaluations = computed(() => {
    const items = this.evaluations();
    return items.length > 0 ? [...items, ...items] : items;
  });
}
