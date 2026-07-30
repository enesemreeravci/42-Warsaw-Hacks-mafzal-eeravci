import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** A generic pulsing placeholder used instead of layout-shifting spinners while data loads. */
@Component({
  selector: 'app-loading-skeleton',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="skeleton"
      [style.height]="height()"
      [style.width]="width()"
      [style.border-radius]="radius()"
      role="status"
      aria-label="Loading"
    ></div>
  `,
  styles: `
    .skeleton {
      background: linear-gradient(90deg, var(--color-bg-card) 25%, var(--color-bg-card-hover) 37%, var(--color-bg-card) 63%);
      background-size: 400% 100%;
      animation: shimmer 1.6s ease infinite;
    }

    @keyframes shimmer {
      0% {
        background-position: 100% 50%;
      }
      100% {
        background-position: 0 50%;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .skeleton {
        animation: none;
        opacity: 0.6;
      }
    }
  `,
})
export class LoadingSkeletonComponent {
  readonly height = input<string>('1rem');
  readonly width = input<string>('100%');
  readonly radius = input<string>('var(--radius-sm)');
}
