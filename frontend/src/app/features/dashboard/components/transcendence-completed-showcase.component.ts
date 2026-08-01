import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { TRANSCENDENCE_PICTURES } from '../transcendence-pictures.manifest';

/** Cap how many staggered entrances play at once - beyond this the per-image delay would push
 * the last photos in well past the section's on-screen dwell time. */
const MAX_DISPLAYED = 12;
const STAGGER_STEP_MS = 140;

interface ShowcasePicture {
  url: string;
  alt: string;
  delayMs: number;
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
  imports: [EmptyStateComponent],
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
            <div class="transcendence__tile" [style.--delay.ms]="picture.delayMs">
              <img class="transcendence__image" [src]="picture.url" [alt]="picture.alt" loading="lazy" />
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .transcendence {
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

    .transcendence__grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: var(--space-4);
      overflow: hidden;
    }

    .transcendence__tile {
      aspect-ratio: 4 / 3;
      border-radius: var(--radius-md);
      overflow: hidden;
      border: 1px solid var(--color-border-strong);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
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
      object-fit: cover;
    }
  `,
})
export class TranscendenceCompletedShowcaseComponent {
  protected readonly pictures = computed<ShowcasePicture[]>(() =>
    TRANSCENDENCE_PICTURES.slice(0, MAX_DISPLAYED).map((url, i) => ({
      url,
      alt: altFromFilename(url),
      delayMs: i * STAGGER_STEP_MS,
    })),
  );
}
