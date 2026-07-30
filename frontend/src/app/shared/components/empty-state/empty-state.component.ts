import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="empty-state" role="status">
      <p class="empty-state__title">{{ title() }}</p>
      @if (description()) {
        <p class="empty-state__description">{{ description() }}</p>
      }
    </div>
  `,
  styles: `
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--space-2);
      padding: var(--space-7) var(--space-4);
      text-align: center;
      color: var(--color-text-secondary);
    }

    .empty-state__title {
      margin: 0;
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--color-text-primary);
    }

    .empty-state__description {
      margin: 0;
      max-width: 40ch;
      color: var(--color-text-muted);
    }
  `,
})
export class EmptyStateComponent {
  readonly title = input<string>('Nothing here yet');
  readonly description = input<string>('');
}
