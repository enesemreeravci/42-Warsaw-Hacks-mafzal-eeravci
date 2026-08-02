import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AvatarComponent } from '../../../shared/components/avatar/avatar.component';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import type { StudentRanking } from '../../../core/models/api.models';

/** Per-row accent color for the level value. Levels have no fixed maximum (unlike a pass-rate
 * percentage), so a progress bar/chart would need an arbitrary scale to normalize against -
 * this highlights each row's value with a distinct color instead, without implying a scale that
 * doesn't exist. */
const RANK_COLORS = ['#ffd700', '#b0b8c8', '#cd7f32', '#4cc9f0', '#be2ad1', '#38e19a', '#16f0a6', '#ff5470'];

/** Independent "Top by level" ranking panel - split out from what used to be a combined
 * community-progress component so it can fail, refresh, and be highlighted on its own. */
@Component({
  selector: 'app-top-students-by-level',
  standalone: true,
  imports: [AvatarComponent, EmptyStateComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (students().length === 0) {
      <app-empty-state title="No student data yet" />
    } @else {
      <ol class="student-rank">
        @for (student of students(); track student.id; let i = $index) {
          <li [style.--rank-color]="rankColors[i % rankColors.length]">
            <a [routerLink]="['/students', student.login]">
              <span class="student-rank__pos">{{ i + 1 }}</span>
              <app-avatar [imageUrl]="student.imageUrl" [name]="student.displayName" [size]="36" />
              <span class="student-rank__name">{{ student.displayName }}</span>
              <span class="student-rank__value">Lvl {{ student.level.toFixed(2) }}</span>
            </a>
          </li>
        }
      </ol>

      <a class="student-rank__view-all" [routerLink]="['/students']" [queryParams]="{ sort: 'level', direction: 'desc' }">
        View full ranking
        <span aria-hidden="true">&rarr;</span>
      </a>
    }
  `,
  styles: `
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

    .student-rank__pos {
      width: 1.5rem;
      flex-shrink: 0;
      text-align: center;
      font-weight: 700;
      font-size: 0.85rem;
      color: var(--color-text-muted);
    }

    .student-rank__name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 600;
    }

    .student-rank__value {
      color: var(--rank-color, var(--color-text-muted));
      font-variant-numeric: tabular-nums;
      font-size: 0.92rem;
      font-weight: 800;
    }

    .student-rank__view-all {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-1);
      margin-top: var(--space-2);
      padding: var(--space-2);
      border-radius: var(--radius-md);
      font-size: 0.82rem;
      font-weight: 700;
      text-decoration: none;
      color: var(--color-accent);
      transition: background var(--transition-standard);

      &:hover {
        background: var(--color-bg-card-hover);
      }
    }
  `,
})
export class TopStudentsByLevelComponent {
  readonly students = input.required<StudentRanking[]>();

  protected readonly rankColors = RANK_COLORS;
}
