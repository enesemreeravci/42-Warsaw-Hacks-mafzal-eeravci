import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { EmptyStateComponent } from '../../../shared/components/empty-state/empty-state.component';
import type { ProjectMetric } from '../../../core/models/api.models';

@Component({
  selector: 'app-top-projects-list',
  standalone: true,
  imports: [EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (projects().length === 0) {
      <app-empty-state title="No completions in this period" description="Try widening the display period." />
    } @else {
      <ol class="ranked-list">
        @for (project of projects(); track project.projectId) {
          <li>
            <span class="ranked-list__name">{{ project.projectName }}</span>
            <span class="ranked-list__bar-track">
              <span class="ranked-list__bar" [style.width.%]="widthPercent(project.completionCount)"></span>
            </span>
            <span class="ranked-list__count">{{ project.completionCount }}</span>
          </li>
        }
      </ol>
    }
  `,
  styles: `
    .ranked-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .ranked-list li {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 2fr auto;
      align-items: center;
      gap: var(--space-3);
    }

    .ranked-list__name {
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .ranked-list__bar-track {
      height: 10px;
      border-radius: 999px;
      background: var(--color-bg-elevated);
      overflow: hidden;
    }

    .ranked-list__bar {
      display: block;
      height: 100%;
      background: linear-gradient(90deg, var(--color-accent), var(--color-info));
      border-radius: 999px;
    }

    .ranked-list__count {
      font-variant-numeric: tabular-nums;
      color: var(--color-text-secondary);
      min-width: 2ch;
      text-align: right;
    }
  `,
})
export class TopProjectsListComponent {
  readonly projects = input.required<ProjectMetric[]>();

  private readonly maxCount = computed(() => Math.max(...this.projects().map((p) => p.completionCount), 1));

  protected widthPercent(count: number): number {
    return Math.max((count / this.maxCount()) * 100, 4);
  }
}
