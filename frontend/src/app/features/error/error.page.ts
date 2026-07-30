import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-error-page',
  standalone: true,
  imports: [RouterLink, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="error-page" role="alert">
      <p class="error-page__code">404</p>
      <h1>Page not found</h1>
      <p>The page you're looking for doesn't exist, or the link may be out of date.</p>
      <a mat-flat-button routerLink="/dashboard">Back to the dashboard</a>
    </div>
  `,
  styles: `
    .error-page {
      min-height: 60vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      gap: var(--space-3);
    }

    .error-page__code {
      font-size: 5rem;
      font-weight: 800;
      margin: 0;
      color: var(--color-accent);
      line-height: 1;
    }

    h1 {
      margin: 0;
    }

    p {
      color: var(--color-text-secondary);
      max-width: 40ch;
    }
  `,
})
export class ErrorPage {}
