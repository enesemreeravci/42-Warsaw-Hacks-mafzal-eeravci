import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import type { AchievementEntry } from '../../../core/models/api.models';
import { AvatarComponent } from '../../../shared/components/avatar/avatar.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';

const INTRO_DISPLAY_MS = 3500; // within the required 3-4s window
/** A batch of falling achievement pictures runs for at most this long before the next batch
 * takes over - keeps every drop-cascade cycle within the required 5s cap. */
const BATCH_MS = 5000;
const MIN_FALLING = 3;
const MAX_FALLING = 5;
/** Per-item stagger and fall duration, tuned so the last picture in a 5-item batch still lands
 * (delay + duration) comfortably inside BATCH_MS. */
const FALL_STAGGER_MS = 450;
const FALL_DURATION_MS = 2200;

interface FallingPicture {
  key: string;
  achievement: AchievementEntry;
  leftPct: number;
  delayMs: number;
  durationMs: number;
}

/** Builds a batch of 3-5 falling pictures starting at `startIndex` in `list`, wrapping around
 * (and repeating entries) if there are fewer than MIN_FALLING achievements to draw from. `cycle`
 * is folded into each item's key purely so Angular's `@for` track treats every batch as new
 * elements and replays the fall animation, even when the underlying achievements repeat. */
function buildFallingBatch(list: AchievementEntry[], startIndex: number, cycle: number): FallingPicture[] {
  if (list.length === 0) return [];
  const count = Math.min(MAX_FALLING, Math.max(MIN_FALLING, list.length));
  return Array.from({ length: count }, (_, i) => {
    const achievement = list[(startIndex + i) % list.length]!;
    return {
      key: `${achievement.projectUserId}-${cycle}-${i}`,
      achievement,
      leftPct: ((i + 1) * 100) / (count + 1),
      delayMs: i * FALL_STAGGER_MS,
      durationMs: FALL_DURATION_MS + (i % 3) * 200,
    };
  });
}

function greetingForHour(hour: number): string {
  if (hour >= 5 && hour < 12) return 'Hello, Good Morning!';
  if (hour >= 12 && hour < 17) return 'Hello, Good Afternoon!';
  return 'Hello, Good Evening!';
}

/**
 * TV-mode section: a dynamic time-of-day greeting that auto-transitions into a looping
 * achievement showcase where 3-5 unlocked-achievement pictures fall from the top of the stage to
 * the bottom simultaneously, each batch's cascade capped at BATCH_MS (5s) before the next batch
 * takes over. No robot avatar here - the single central 3D mascot (NarratorRobotComponent) is
 * the only robot on screen, never duplicated per-slide. This section is deliberately the last
 * one in the TV rotation (see TvModeService/dashboard.page.html), so it closes out every loop. A
 * fresh instance of this component is created each time TV mode's rotation cycles back to this
 * section (Angular's `@switch` destroys/recreates the case), so the intro naturally replays every
 * time - no manual "did we just enter this section" tracking needed.
 */
@Component({
  selector: 'app-robot-achievement-showcase',
  standalone: true,
  imports: [AvatarComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="showcase">
      <div class="showcase__stage">
        @if (phase() === 'intro') {
          <div class="showcase__intro">
            <p class="showcase__greeting">{{ greeting }}</p>
            <p class="showcase__subtitle">Here's what most recently happened on our campus.</p>
          </div>
        } @else if (achievements().length === 0) {
          <app-empty-state title="No achievements yet" description="Recent completions will be celebrated here as they happen." />
        } @else {
          <div class="showcase__achievement">
            <h2 class="showcase__header">ACHIEVEMENT UNLOCKED</h2>
            <p class="showcase__caption">Congratulations on passing the module!</p>

            <div class="showcase__falling">
              @for (item of fallingBatch(); track item.key) {
                <div
                  class="falling-picture"
                  [style.left.%]="item.leftPct"
                  [style.--delay.ms]="item.delayMs"
                  [style.--duration.ms]="item.durationMs"
                >
                  <app-avatar [imageUrl]="item.achievement.imageUrl" [name]="item.achievement.displayName" [size]="96" />
                  <span class="falling-picture__name">{{ item.achievement.displayName }}</span>
                </div>
              }
            </div>
          </div>
        }
      </div>
    </div>
  `,
  styles: `
    .showcase {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      min-height: 60vh;
      overflow: hidden;
      border-radius: var(--radius-lg);
      border: 1px solid var(--color-border);
      background: radial-gradient(circle at 50% 40%, rgba(52, 226, 196, 0.08), transparent 60%), var(--color-bg-elevated);
    }

    .showcase__stage {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-4);
      text-align: center;
      padding: var(--space-6);
    }

    .showcase__intro {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .showcase__greeting {
      margin: 0;
      font-size: 2.4rem;
      font-weight: 800;
      letter-spacing: -0.01em;
    }

    .showcase__subtitle {
      margin: 0;
      max-width: 46ch;
      font-size: 1.15rem;
      color: var(--color-text-secondary);
    }

    .showcase__achievement {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-2);
    }

    .showcase__header {
      margin: 0;
      font-size: 2.2rem;
      font-weight: 900;
      letter-spacing: 0.06em;
      color: var(--color-warn);
      text-shadow: 0 0 12px rgba(255, 176, 32, 0.55), 0 0 32px rgba(255, 176, 32, 0.35);
    }

    .showcase__caption {
      margin: 0 0 var(--space-3);
      font-size: 1.15rem;
      color: var(--color-text-secondary);
    }

    .showcase__falling {
      position: relative;
      width: min(900px, 90vw);
      height: 320px;
    }

    .falling-picture {
      position: absolute;
      top: -140px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-1);
      transform: translateX(-50%);
    }

    @media (prefers-reduced-motion: no-preference) {
      .falling-picture {
        animation: falling-picture-drop var(--duration, 2200ms) cubic-bezier(0.33, 0, 0.67, 1) var(--delay, 0ms) both;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .falling-picture {
        top: calc(100% - 120px);
      }
    }

    @keyframes falling-picture-drop {
      0% { top: -140px; opacity: 0; }
      12% { opacity: 1; }
      100% { top: calc(100% - 120px); opacity: 1; }
    }

    .falling-picture__name {
      max-width: 12ch;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--color-text-secondary);
    }
  `,
})
export class RobotAchievementShowcaseComponent {
  readonly achievements = input.required<AchievementEntry[]>();

  protected readonly greeting = greetingForHour(new Date().getHours());

  protected readonly phase = signal<'intro' | 'showcase'>('intro');
  private readonly batchStart = signal(0);
  private readonly cycle = signal(0);

  protected readonly fallingBatch = computed(() => buildFallingBatch(this.achievements(), this.batchStart(), this.cycle()));

  private readonly destroyRef = inject(DestroyRef);
  private rotationTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    const introTimeout = setTimeout(() => {
      this.phase.set('showcase');
      this.startRotation();
    }, INTRO_DISPLAY_MS);

    this.destroyRef.onDestroy(() => {
      clearTimeout(introTimeout);
      if (this.rotationTimer !== null) clearInterval(this.rotationTimer);
    });
  }

  private startRotation(): void {
    this.rotationTimer = setInterval(() => {
      const list = this.achievements();
      const batchSize = Math.min(MAX_FALLING, Math.max(MIN_FALLING, list.length || 1));
      this.batchStart.update((i) => (list.length > 0 ? (i + batchSize) % list.length : 0));
      this.cycle.update((c) => c + 1);
    }, BATCH_MS);
  }
}
