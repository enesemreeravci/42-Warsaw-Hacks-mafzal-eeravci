import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-stat-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="stat-card" [class.stat-card--accent]="accent()">
      <p class="stat-card__label">{{ label() }}</p>
      <p class="stat-card__value">
        {{ value() }}<span class="stat-card__suffix">{{ suffix() }}</span>
      </p>
      @if (hint()) {
        <p class="stat-card__hint">{{ hint() }}</p>
      }
    </article>
  `,
  styles: `
    .stat-card {
      background: var(--color-bg-card);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-lg);
      padding: var(--space-5) var(--space-6);
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      min-width: 0;
      box-shadow: var(--shadow-card);
      transition: border-color var(--transition-standard);
    }

    .stat-card--accent {
      border-color: var(--color-accent);
      box-shadow: 0 0 0 1px var(--color-accent-glow), var(--shadow-card);
    }

    .stat-card__label {
      margin: 0;
      font-size: 0.9rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--color-text-secondary);
    }

    .stat-card__value {
      margin: 0;
      font-size: clamp(1.8rem, 3vw, 3rem);
      font-weight: 700;
      line-height: 1.1;
      color: var(--color-text-primary);
      font-variant-numeric: tabular-nums;
    }

    .stat-card__suffix {
      font-size: 0.5em;
      font-weight: 500;
      margin-left: var(--space-1);
      color: var(--color-text-secondary);
    }

    .stat-card__hint {
      margin: 0;
      color: var(--color-text-muted);
      font-size: 0.85rem;
    }
  `,
})
export class StatCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly suffix = input<string>('');
  readonly hint = input<string>('');
  readonly accent = input<boolean>(false);
}
