import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AvatarComponent } from '../../../shared/components/avatar/avatar.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import type { StudentRanking } from '../../../core/models/api.models';

@Component({
  selector: 'app-community-progress',
  standalone: true,
  imports: [AvatarComponent, EmptyStateComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="community-progress">
      <div>
        <h3>Top by level</h3>
        @if (byLevel().length === 0) {
          <app-empty-state title="No student data yet" />
        } @else {
          <ol class="student-rank">
            @for (student of byLevel(); track student.id) {
              <li>
                <a [routerLink]="['/students', student.login]">
                  <app-avatar [imageUrl]="student.imageUrl" [name]="student.displayName" [size]="36" />
                  <span class="student-rank__name">{{ student.displayName }}</span>
                  <span class="student-rank__value">Lvl {{ student.level.toFixed(2) }}</span>
                </a>
              </li>
            }
          </ol>
        }
      </div>

      <div>
        <h3>Top by validated projects</h3>
        @if (byCompleted().length === 0) {
          <app-empty-state title="No student data yet" />
        } @else {
          <ol class="student-rank">
            @for (student of byCompleted(); track student.id) {
              <li>
                <a [routerLink]="['/students', student.login]">
                  <app-avatar [imageUrl]="student.imageUrl" [name]="student.displayName" [size]="36" />
                  <span class="student-rank__name">{{ student.displayName }}</span>
                  <span class="student-rank__value">{{ student.completedProjectCount }} projects</span>
                </a>
              </li>
            }
          </ol>
        }
      </div>
    </div>
  `,
  styles: `
    .community-progress {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-6);
    }

    h3 {
      margin: 0 0 var(--space-3);
      font-size: 0.95rem;
      color: var(--color-text-secondary);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .student-rank {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .student-rank a {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      text-decoration: none;
      color: var(--color-text-primary);
      padding: var(--space-2);
      border-radius: var(--radius-md);
      transition: background var(--transition-standard);

      &:hover {
        background: var(--color-bg-card-hover);
      }
    }

    .student-rank__name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 600;
    }

    .student-rank__value {
      color: var(--color-text-muted);
      font-variant-numeric: tabular-nums;
      font-size: 0.9rem;
    }

    @media (max-width: 900px) {
      .community-progress {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class CommunityProgressComponent {
  readonly byLevel = input.required<StudentRanking[]>();
  readonly byCompleted = input.required<StudentRanking[]>();
}
