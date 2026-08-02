import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, signal } from '@angular/core';

const PARTICLES_PER_STAGE_BURST = 22;
const PARTICLES_PER_TILE_BURST = 14;
const COLORS = ['#34e2c4', '#ffb020', '#4cc9f0', '#be2ad1', '#38e19a', '#ff5470', '#ffd700'];
/** How far apart (seconds) each successive 'stage' burst fires, so they read as a sequence of
 * fireworks going off rather than one simultaneous flash. */
const BURST_STAGGER_SEC = 0.7;
/** With 5 bursts at BURST_STAGGER_SEC apart plus each particle's own ~1.1-1.7s flight, the whole
 * 'stage' sequence takes roughly this long - the `continuous` loop restarts on this cadence so a
 * new round of bursts kicks off right as the last one finishes, instead of stalling or
 * overlapping. Reused as the 'tile' variant's loop cadence too, for one consistent rhythm. */
const CYCLE_DURATION_SEC = 5.5;

interface Particle {
  txPx: number;
  tyPx: number;
  color: string;
  durationSec: number;
}

interface Burst {
  leftPct: number;
  topPct: number;
  delaySec: number;
  particles: Particle[];
}

interface BuildBurstOptions {
  particleCount?: number;
  baseDistancePx?: number;
  distanceStepPx?: number;
  extraDelaySec?: number;
}

function buildBurst(leftPct: number, topPct: number, order: number, seed: number, opts: BuildBurstOptions = {}): Burst {
  const { particleCount = PARTICLES_PER_STAGE_BURST, baseDistancePx = 90, distanceStepPx = 24, extraDelaySec = 0 } = opts;
  const particles = Array.from({ length: particleCount }, (_, i) => {
    const angle = (i / particleCount) * Math.PI * 2;
    const distance = baseDistancePx + ((i + seed) % 5) * distanceStepPx;
    return {
      txPx: Math.round(Math.cos(angle) * distance),
      tyPx: Math.round(Math.sin(angle) * distance),
      color: COLORS[(i + seed) % COLORS.length]!,
      durationSec: 1.1 + ((i + seed) % 4) * 0.15,
    };
  });
  return { leftPct, topPct, delaySec: order * BURST_STAGGER_SEC + extraDelaySec, particles };
}

/** The default full-stage look: 5 bursts spread across the whole host at staggered
 * positions/times. Doesn't depend on any input, so it's built once rather than recomputed. */
const STAGE_BURSTS: Burst[] = [
  buildBurst(22, 28, 0, 0),
  buildBurst(76, 22, 1, 4),
  buildBurst(48, 38, 2, 8),
  buildBurst(64, 62, 3, 12),
  buildBurst(30, 60, 4, 16),
];

/** 'tile' variant only: how far apart (seconds) successive repeats of the same burst fire, when
 * `[repeatCount]` is more than 1 - a quick flourish of flashes right after the item lands, not
 * one lonely flash. */
const TILE_REPEAT_INTERVAL_SEC = 0.55;

/**
 * Reusable celebratory fireworks overlay, in two variants:
 * - 'stage' (default): 5 bursts spread across the full host, for a section-wide celebration
 *   moment (e.g. Achievement Unlock's overall stage).
 * - 'tile': one smaller, centered burst sized for an individual card/tile rather than a whole
 *   stage - drop one into each item in a grid (Transcendence Completed's photos, Achievement
 *   Unlock's falling pictures) so each gets its own localized celebration exactly where it
 *   appears. `[startDelaySec]` syncs a tile burst's first firing with that item's own entrance
 *   animation delay; `[repeatCount]` fires that same burst several times in quick succession
 *   (e.g. 3-4x) right after landing, instead of just once.
 *
 * By default it plays once (not looped) - a fresh instance replays it every time, matching how
 * the rest of this codebase's TV sections naturally replay their entrance animations on remount
 * (Angular's `@switch`/`@for` destroys and recreates elements). Pass `[continuous]` to keep it
 * firing new rounds (a full repeat-count cluster each time) for as long as the component stays
 * mounted. Purely decorative (`aria-hidden`), CSS-driven, and skipped entirely under
 * `prefers-reduced-motion: reduce`.
 */
@Component({
  selector: 'app-fireworks-overlay',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fireworks" aria-hidden="true">
      @for (burst of bursts(); track $index + '-' + cycle()) {
        <div class="fireworks__burst" [style.left.%]="burst.leftPct" [style.top.%]="burst.topPct" [style.--burst-delay.s]="burst.delaySec">
          @for (particle of burst.particles; track $index) {
            <span
              class="fireworks__particle"
              [style.background]="particle.color"
              [style.--tx.px]="particle.txPx"
              [style.--ty.px]="particle.tyPx"
              [style.--duration.s]="particle.durationSec"
            ></span>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .fireworks {
      position: absolute;
      inset: 0;
      overflow: hidden;
      pointer-events: none;
      z-index: 5;
    }

    @media (prefers-reduced-motion: reduce) {
      .fireworks {
        display: none;
      }
    }

    .fireworks__burst {
      position: absolute;
      width: 0;
      height: 0;
    }

    .fireworks__particle {
      position: absolute;
      left: 0;
      top: 0;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      opacity: 0;
      box-shadow: 0 0 6px 1px currentColor;
      animation: fireworks-particle var(--duration, 1.2s) ease-out var(--burst-delay, 0s) 1 both;
    }

    @keyframes fireworks-particle {
      0% { transform: translate(0, 0) scale(0.4); opacity: 0; }
      10% { opacity: 1; }
      100% { transform: translate(var(--tx), calc(var(--ty) + 70px)) scale(0.8); opacity: 0; }
    }
  `,
})
export class FireworksOverlayComponent {
  /** When true, keeps firing new rounds of bursts for as long as this component stays mounted. */
  readonly continuous = input(false);
  /** 'stage' (default) or 'tile' - see class doc comment above. */
  readonly variant = input<'stage' | 'tile'>('stage');
  /** 'tile' variant only: delays that burst's first firing (and every subsequent one, since the
   * loop just restarts the same burst list) to sync with the host item's own entrance delay. */
  readonly startDelaySec = input(0);
  /** 'tile' variant only: fires the same centered burst this many times, TILE_REPEAT_INTERVAL_SEC
   * apart, so landing reads as a little celebratory flourish rather than a single flash. */
  readonly repeatCount = input(1);

  protected readonly bursts = computed<Burst[]>(() => {
    if (this.variant() === 'tile') {
      const count = Math.max(1, this.repeatCount());
      return Array.from({ length: count }, (_, i) =>
        buildBurst(50, 50, 0, i * 3, {
          particleCount: PARTICLES_PER_TILE_BURST,
          baseDistancePx: 22,
          distanceStepPx: 8,
          extraDelaySec: this.startDelaySec() + i * TILE_REPEAT_INTERVAL_SEC,
        }),
      );
    }
    return STAGE_BURSTS;
  });

  /** Bumped every CYCLE_DURATION_SEC while `continuous` is on, folded into the burst `@for`
   * track so Angular tears down and recreates the burst elements each round - which is what
   * actually restarts their one-shot CSS animations, the same "fresh instance replays" trick
   * used elsewhere in this codebase (see RobotAchievementShowcaseComponent's falling batches). */
  protected readonly cycle = signal(0);

  private readonly destroyRef = inject(DestroyRef);
  private loopTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    effect(() => {
      if (this.continuous()) {
        this.startLoop();
      } else {
        this.stopLoop();
      }
    });
    this.destroyRef.onDestroy(() => this.stopLoop());
  }

  private startLoop(): void {
    if (this.loopTimer !== null) return;
    this.loopTimer = setInterval(() => this.cycle.update((c) => c + 1), CYCLE_DURATION_SEC * 1000);
  }

  private stopLoop(): void {
    if (this.loopTimer === null) return;
    clearInterval(this.loopTimer);
    this.loopTimer = null;
  }
}
