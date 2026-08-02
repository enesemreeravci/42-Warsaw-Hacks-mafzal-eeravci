import { ChangeDetectionStrategy, Component } from '@angular/core';

const PARTICLES_PER_BURST = 22;
const COLORS = ['#34e2c4', '#ffb020', '#4cc9f0', '#be2ad1', '#38e19a', '#ff5470', '#ffd700'];
/** How far apart (seconds) each successive burst fires, so they read as a sequence of
 * fireworks going off rather than one simultaneous flash. */
const BURST_STAGGER_SEC = 0.7;

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

function buildBurst(leftPct: number, topPct: number, order: number, seed: number): Burst {
  const particles = Array.from({ length: PARTICLES_PER_BURST }, (_, i) => {
    const angle = (i / PARTICLES_PER_BURST) * Math.PI * 2;
    const distance = 90 + ((i + seed) % 5) * 24;
    return {
      txPx: Math.round(Math.cos(angle) * distance),
      tyPx: Math.round(Math.sin(angle) * distance),
      color: COLORS[(i + seed) % COLORS.length]!,
      durationSec: 1.1 + ((i + seed) % 4) * 0.15,
    };
  });
  return { leftPct, topPct, delaySec: order * BURST_STAGGER_SEC, particles };
}

/**
 * Reusable celebratory fireworks overlay: several radial particle bursts at staggered screen
 * positions/times, playing once (not looped) - a fresh instance replays it every time, matching
 * how the rest of this codebase's TV sections naturally replay their entrance animations on
 * remount (Angular's `@switch` destroys/recreates each case). Purely decorative
 * (`aria-hidden`), CSS-only, and skipped entirely under `prefers-reduced-motion: reduce`. Drop
 * into any component that wants a one-shot celebration moment.
 */
@Component({
  selector: 'app-fireworks-overlay',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fireworks" aria-hidden="true">
      @for (burst of bursts; track $index) {
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
  protected readonly bursts: Burst[] = [
    buildBurst(22, 28, 0, 0),
    buildBurst(76, 22, 1, 4),
    buildBurst(48, 38, 2, 8),
    buildBurst(64, 62, 3, 12),
    buildBurst(30, 60, 4, 16),
  ];
}
