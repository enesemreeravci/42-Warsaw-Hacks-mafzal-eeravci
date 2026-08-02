import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { TRANSCENDENCE_PICTURES } from '../transcendence-pictures.manifest';
import { FireworksOverlayComponent } from './fireworks-overlay.component';

/** Cap how many staggered entrances play at once, kept a multiple of the 5-per-row grid so the
 * last row is never left partially empty - beyond this the per-image delay would also push the
 * last photos in well past the section's on-screen dwell time. 5x3 = 15 tiles. */
const MAX_DISPLAYED = 15;
const STAGGER_STEP_MS = 140;

/** The tile's own fall-in animation (see transcendence-fall below) takes this long - a tile's
 * firework burst is timed to fire right as it finishes landing, not mid-fall. */
const FALL_DURATION_MS = 600;
/** Cycled per tile so neighboring frames don't all glow the exact same color. */
const GLOW_COLORS = ['#34e2c4', '#4cc9f0', '#be2ad1', '#ffb020', '#38e19a'];

interface ShowcasePicture {
  url: string;
  alt: string;
  delayMs: number;
  fireworkDelaySec: number;
  glowColor: string;
}

function altFromFilename(url: string): string {
  const filename = url.slice(url.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');
  const words = filename.replace(/[-_]+/g, ' ').trim();
  return words ? `${words} - Transcendence completion photo` : 'Transcendence completion photo';
}

/**
 * TV-mode section: a "Transcendence Completed" gallery sourced automatically from whatever
 * images live in public/pictures/ (see transcendence-pictures.manifest.ts, regenerated on every
 * `npm start` / `npm run build` - no code changes needed to add a new photo). Photos cascade in
 * one-by-one, top to bottom, PowerPoint-entrance style. A fresh instance is created each time TV
 * mode's rotation cycles back to this section, so the entrance naturally replays every time. The
 * section's identity ("Transcendence Completed") is shown in the unified TV header bar (see
 * app.html) rather than repeated as an in-card title.
 */
@Component({
  selector: 'app-transcendence-completed-showcase',
  standalone: true,
  imports: [EmptyStateComponent, FireworksOverlayComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="transcendence" role="region" aria-label="Transcendence Completed">
      @if (pictures().length === 0) {
        <app-empty-state
          title="No Transcendence photos yet"
          description="Drop images into frontend/public/pictures and they'll show up here automatically."
        />
      } @else {
        <div class="transcendence__grid">
          @for (picture of pictures(); track picture.url) {
            <div class="transcendence__tile" [style.--delay.ms]="picture.delayMs" [style.--tile-glow]="picture.glowColor">
              <img class="transcendence__image" [src]="picture.url" [alt]="picture.alt" loading="lazy" />
              <app-fireworks-overlay variant="tile" [repeatCount]="4" [startDelaySec]="picture.fireworkDelaySec" />
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .transcendence {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: var(--space-5);
      height: 100%;
      min-height: 60vh;
      padding: var(--space-6);
      border-radius: var(--radius-lg);
      border: 1px solid var(--color-border);
      background: radial-gradient(circle at 50% 0%, rgba(52, 226, 196, 0.08), transparent 60%), var(--color-bg-elevated);
    }

    // Fixed 5x3 (not auto-fill) so photos are consistently sized regardless of viewport width,
    // and the grid fills the full-screen TV stage rather than shrinking tiles to fit more
    // columns. Smaller/more-numerous tiles than before, to leave visible room for each one's
    // frame (below) instead of the photo filling the entire tile edge-to-edge.
    .transcendence__grid {
      flex: 1;
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      grid-template-rows: repeat(3, 1fr);
      gap: var(--space-4);
      overflow: hidden;
    }

    // A modern glassmorphism picture frame: a frosted, translucent mat (blurring whatever's
    // behind the tile) between a soft glowing border and the photo itself, rather than the image
    // running edge-to-edge with just a thin hairline around it.
    .transcendence__tile {
      position: relative;
      aspect-ratio: 4 / 3;
      padding: 8px;
      border-radius: var(--radius-lg);
      border: 1px solid var(--glass-border);
      background: var(--glass-bg-elevated);
      backdrop-filter: blur(var(--glass-blur));
      -webkit-backdrop-filter: blur(var(--glass-blur));
      box-shadow: 0 12px 28px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 0 26px -6px var(--tile-glow, var(--color-accent-glow));
      opacity: 0;
      transform: translateY(-64px);
    }

    @media (prefers-reduced-motion: no-preference) {
      .transcendence__tile {
        animation: transcendence-fall 600ms cubic-bezier(0.25, 0.8, 0.4, 1) var(--delay, 0ms) both;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .transcendence__tile {
        opacity: 1;
        transform: none;
      }
    }

    @keyframes transcendence-fall {
      0% { opacity: 0; transform: translateY(-64px); }
      70% { opacity: 1; }
      100% { opacity: 1; transform: translateY(0); }
    }

    .transcendence__image {
      display: block;
      width: 100%;
      height: 100%;
      border-radius: calc(var(--radius-lg) - 6px);
      object-fit: cover;
    }
  `,
})
export class TranscendenceCompletedShowcaseComponent {
  protected readonly pictures = computed<ShowcasePicture[]>(() =>
    TRANSCENDENCE_PICTURES.slice(0, MAX_DISPLAYED).map((url, i) => {
      const delayMs = i * STAGGER_STEP_MS;
      return {
        url,
        alt: altFromFilename(url),
        delayMs,
        fireworkDelaySec: (delayMs + FALL_DURATION_MS) / 1000,
        glowColor: GLOW_COLORS[i % GLOW_COLORS.length]!,
      };
    }),
  );
}
