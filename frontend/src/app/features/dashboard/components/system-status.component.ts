import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { CacheStatus, Ft42Status } from '../../../core/models/api.models';

@Component({
  selector: 'app-system-status',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dl class="status-grid">
      <div>
        <dt>Data source</dt>
        <dd [class.status-grid__value--warn]="mockMode()">{{ mockMode() ? 'Demo data' : 'Live 42 API' }}</dd>
      </div>
      <div>
        <dt>Cache status</dt>
        <dd [class.status-grid__value--warn]="cacheStatus() === 'stale'">{{ cacheStatusLabel() }}</dd>
      </div>
      <div>
        <dt>42 API</dt>
        <dd [class.status-grid__value--ok]="ft42Status()?.reachable" [class.status-grid__value--danger]="ft42Status() && !ft42Status()?.reachable">
          {{ mockMode() ? 'Not used (demo mode)' : ft42Status()?.reachable ? 'Reachable' : 'Unreachable' }}
        </dd>
      </div>
      <div>
        <dt>Next refresh</dt>
        <dd>{{ autoRefreshEnabled() ? countdownSeconds() + 's' : 'Paused' }}</dd>
      </div>
    </dl>
  `,
  styles: `
    .status-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: var(--space-4);
      margin: 0;
    }

    dt {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--color-text-muted);
      margin-bottom: var(--space-1);
    }

    dd {
      margin: 0;
      font-weight: 700;
      font-size: 1.05rem;
      color: var(--color-text-primary);
    }

    .status-grid__value--ok {
      color: var(--color-success);
    }

    .status-grid__value--warn {
      color: var(--color-warn);
    }

    .status-grid__value--danger {
      color: var(--color-danger);
    }
  `,
})
export class SystemStatusComponent {
  readonly mockMode = input.required<boolean>();
  readonly cacheStatus = input.required<CacheStatus>();
  readonly ft42Status = input<Ft42Status | null>(null);
  readonly autoRefreshEnabled = input.required<boolean>();
  readonly countdownSeconds = input.required<number>();

  protected cacheStatusLabel(): string {
    const status = this.cacheStatus();
    if (status === 'fresh') return 'Fresh';
    if (status === 'cached') return 'Cached';
    return 'Stale (serving last known data)';
  }
}
