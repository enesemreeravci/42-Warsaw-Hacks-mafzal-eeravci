import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import type { AchievementEntry } from '../../../core/models/api.models';
import { AvatarComponent } from '../../../shared/components/avatar/avatar.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';

const INTRO_DISPLAY_MS = 3500; // within the required 3-4s window
const ROTATION_MS = 5000;
const CONFETTI_COUNT = 40;
const CONFETTI_COLORS = ['#34e2c4', '#ffb020', '#4cc9f0', '#38e19a', '#ff5470'];

/** Fixed scatter slots for the dimmed background avatars, arranged around the edges so the
 * center stays clear for the robot and the spotlight card. */
const BACKGROUND_SLOTS = [
  { leftPct: 8, topPct: 14 },
  { leftPct: 86, topPct: 16 },
  { leftPct: 6, topPct: 78 },
  { leftPct: 88, topPct: 76 },
  { leftPct: 47, topPct: 6 },
  { leftPct: 47, topPct: 92 },
];

interface ConfettiPiece {
  txPx: number;
  tyPx: number;
  delaySec: number;
  durationSec: number;
  color: string;
}

function buildConfettiBurst(): ConfettiPiece[] {
  return Array.from({ length: CONFETTI_COUNT }, (_, i) => {
    const angle = (i / CONFETTI_COUNT) * Math.PI * 2 + (i % 3) * 0.4;
    const distance = 160 + (i % 5) * 36;
    return {
      txPx: Math.round(Math.cos(angle) * distance),
      tyPx: Math.round(Math.sin(angle) * distance * 0.7),
      delaySec: (i % 8) * 0.05,
      durationSec: 0.9 + (i % 4) * 0.15,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length]!,
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
 * achievement showcase with a confetti burst on every unlock. No robot avatar here - the single
 * central 3D mascot (NarratorRobotComponent) is the only robot on screen, never duplicated
 * per-slide. A fresh instance of this component is created each time TV mode's rotation cycles
 * back to this section (Angular's `@switch` destroys/recreates the case), so the intro naturally
 * replays every time - no manual "did we just enter this section" tracking needed.
 */
@Component({
  selector: 'app-robot-achievement-showcase',
  standalone: true,
  imports: [AvatarComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="showcase">
      @if (phase() === 'showcase' && backgroundAvatars().length > 0) {
        <div class="showcase__background" aria-hidden="true">
          @for (bg of backgroundAvatars(); track bg.projectUserId; let i = $index) {
            <div class="showcase__bg-avatar" [style.left.%]="slots[i].leftPct" [style.top.%]="slots[i].topPct">
              <app-avatar [imageUrl]="bg.imageUrl" [name]="bg.displayName" [size]="64" />
            </div>
          }
        </div>
      }

      <div class="showcase__stage">
        @if (phase() === 'intro') {
          <div class="showcase__intro">
            <p class="showcase__greeting">{{ greeting }}</p>
            <p class="showcase__subtitle">Here's what most recently happened on our campus.</p>
          </div>
        } @else if (achievements().length === 0) {
          <app-empty-state title="No achievements yet" description="Recent completions will be celebrated here as they happen." />
        } @else {
          @for (item of [currentAchievement()]; track activeIndex()) {
            @if (item) {
              <div class="showcase__achievement">
                <h2 class="showcase__header">ACHIEVEMENT UNLOCKED</h2>
                <p class="showcase__caption">Congratulations on passing the module!</p>

                <div class="showcase__spotlight">
                  <div class="showcase__spotlight-avatar">
                    <app-avatar [imageUrl]="item.imageUrl" [name]="item.displayName" [size]="140" />
                  </div>
                  <p class="showcase__name">{{ item.displayName }}</p>
                  <p class="showcase__project">{{ item.projectName }}</p>
                  <span class="showcase__score">{{ item.finalMark ?? '—' }}/100</span>
                </div>

                <div class="showcase__confetti" aria-hidden="true">
                  @for (piece of confettiPieces; track $index) {
                    <span
                      class="confetti-piece"
                      [style.background]="piece.color"
                      [style.--tx.px]="piece.txPx"
                      [style.--ty.px]="piece.tyPx"
                      [style.--delay.s]="piece.delaySec"
                      [style.--duration.s]="piece.durationSec"
                    ></span>
                  }
                </div>
              </div>
            }
          }
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

    .showcase__background {
      position: absolute;
      inset: 0;
      z-index: 0;
    }

    .showcase__bg-avatar {
      position: absolute;
      transform: translate(-50%, -50%);
      opacity: 0.28;
      filter: grayscale(0.4);
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

    .showcase__spotlight {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-2);
    }

    @media (prefers-reduced-motion: no-preference) {
      .showcase__spotlight {
        animation: spotlight-enter 500ms ease-out;
      }
    }

    @keyframes spotlight-enter {
      from { opacity: 0; transform: scale(0.85); }
      to { opacity: 1; transform: scale(1); }
    }

    .showcase__spotlight-avatar {
      padding: 6px;
      border-radius: 50%;
      border: 3px solid var(--color-accent-strong);
      box-shadow: 0 0 28px rgba(52, 226, 196, 0.45);
    }

    .showcase__name {
      margin: var(--space-2) 0 0;
      font-size: 1.8rem;
      font-weight: 800;
    }

    .showcase__project {
      margin: 0;
      font-size: 1.2rem;
      color: var(--color-text-secondary);
    }

    .showcase__score {
      margin-top: var(--space-1);
      font-size: 2rem;
      font-weight: 900;
      color: var(--color-warn);
      text-shadow: 0 0 20px rgba(255, 176, 32, 0.6);
    }

    .showcase__confetti {
      position: absolute;
      inset: -40vh -40vw;
      pointer-events: none;
    }

    .confetti-piece {
      position: absolute;
      left: 50%;
      top: 50%;
      width: 10px;
      height: 10px;
      border-radius: 3px;
      opacity: 0;
    }

    @media (prefers-reduced-motion: no-preference) {
      .confetti-piece {
        animation: confetti-burst var(--duration, 1.1s) ease-out var(--delay, 0s) 1 forwards;
      }
    }

    @keyframes confetti-burst {
      0% { transform: translate(-50%, -50%) scale(0.3); opacity: 1; }
      100% { transform: translate(calc(-50% + var(--tx)), calc(-50% + var(--ty))) scale(1); opacity: 0; }
    }
  `,
})
export class RobotAchievementShowcaseComponent {
  readonly achievements = input.required<AchievementEntry[]>();

  protected readonly greeting = greetingForHour(new Date().getHours());
  protected readonly confettiPieces = buildConfettiBurst();
  protected readonly slots = BACKGROUND_SLOTS;

  protected readonly phase = signal<'intro' | 'showcase'>('intro');
  protected readonly activeIndex = signal(0);

  protected readonly currentAchievement = computed(() => {
    const list = this.achievements();
    return list.length > 0 ? list[this.activeIndex() % list.length]! : null;
  });

  protected readonly backgroundAvatars = computed(() => {
    const list = this.achievements();
    const active = this.activeIndex() % Math.max(list.length, 1);
    return list.filter((_, i) => i !== active).slice(0, BACKGROUND_SLOTS.length);
  });

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
    if (this.achievements().length <= 1) return; // nothing to rotate to
    this.rotationTimer = setInterval(() => {
      this.activeIndex.update((i) => (i + 1) % this.achievements().length);
    }, ROTATION_MS);
  }
}
