import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-error-state',
  standalone: true,
  imports: [MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="error-state" role="alert">
      <p class="error-state__title">{{ title() }}</p>
      <p class="error-state__message">{{ message() }}</p>
      @if (retryable()) {
        <button mat-stroked-button type="button" (click)="retry.emit()">Try again</button>
      }
    </div>
  `,
  styles: `
    .error-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--space-3);
      padding: var(--space-7) var(--space-4);
      text-align: center;
      border: 1px dashed var(--color-danger);
      border-radius: var(--radius-lg);
      background: rgba(255, 84, 112, 0.06);
    }

    .error-state__title {
      margin: 0;
      font-size: 1.1rem;
      font-weight: 700;
      color: var(--color-danger);
    }

    .error-state__message {
      margin: 0;
      max-width: 48ch;
      color: var(--color-text-secondary);
    }
  `,
})
export class ErrorStateComponent {
  readonly title = input<string>('Something went wrong');
  readonly message = input<string>('Please try again in a moment.');
  readonly retryable = input<boolean>(true);
  readonly retry = output<void>();
}
