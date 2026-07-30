import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AvatarComponent } from '../../../shared/components/avatar/avatar.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import { RelativeTimePipe } from '../../../shared/pipes/relative-time.pipe';
import type { StudentDetail } from '../../../core/models/api.models';

@Component({
  selector: 'app-featured-student-card',
  standalone: true,
  imports: [AvatarComponent, EmptyStateComponent, RelativeTimePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (student(); as s) {
      <a class="featured" [routerLink]="['/students', s.login]">
        <app-avatar [imageUrl]="s.imageUrl" [name]="s.displayName" [size]="88" />
        <div class="featured__info">
          <p class="featured__name">{{ s.displayName }}</p>
          <p class="featured__login">&commat;{{ s.login }}</p>
          <dl class="featured__stats">
            <div>
              <dt>Level</dt>
              <dd>{{ s.level.toFixed(2) }}</dd>
            </div>
            <div>
              <dt>Validated projects</dt>
              <dd>{{ s.completedProjectCount }}</dd>
            </div>
            <div>
              <dt>Current projects</dt>
              <dd>{{ s.currentProjects.length || '—' }}</dd>
            </div>
          </dl>
          @if (s.lastCompletedProject) {
            <p class="featured__last">
              Last completed <strong>{{ s.lastCompletedProject }}</strong> &middot; {{ s.lastCompletionDate | relativeTime }}
            </p>
          }
        </div>
      </a>
    } @else {
      <app-empty-state title="Featured student unavailable" description="This student could not be found in the current dataset." />
    }
  `,
  styles: `
    .featured {
      display: flex;
      gap: var(--space-5);
      text-decoration: none;
      color: inherit;
      padding: var(--space-2);
      border-radius: var(--radius-md);

      &:hover {
        background: var(--color-bg-card-hover);
      }
    }

    .featured__name {
      margin: 0;
      font-size: 1.3rem;
      font-weight: 700;
    }

    .featured__login {
      margin: 0 0 var(--space-3);
      color: var(--color-accent);
    }

    .featured__stats {
      display: flex;
      gap: var(--space-5);
      margin: 0 0 var(--space-3);
    }

    dt {
      font-size: 0.75rem;
      text-transform: uppercase;
      color: var(--color-text-muted);
    }

    dd {
      margin: 0;
      font-weight: 700;
      font-size: 1.2rem;
      font-variant-numeric: tabular-nums;
    }

    .featured__last {
      margin: 0;
      color: var(--color-text-secondary);
      font-size: 0.9rem;
    }
  `,
})
export class FeaturedStudentCardComponent {
  readonly student = input<StudentDetail | null>(null);
}
