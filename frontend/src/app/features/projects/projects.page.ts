import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { catchError, forkJoin, map, of } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import type { NormalizedApiError } from '../../core/interceptors/error.interceptor';
import type { ProjectListing, ProjectMetric } from '../../core/models/api.models';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../shared/components/error-state/error-state.component';
import { LoadingSkeletonComponent } from '../../shared/components/loading-skeleton/loading-skeleton.component';

interface ProjectRow {
  projectId: number;
  projectName: string;
  completionCount: number;
  successRate: number;
  averageFinalMark: number;
  recentCompletionCount: number;
}

type SortKey = keyof Pick<ProjectRow, 'projectName' | 'completionCount' | 'successRate' | 'averageFinalMark' | 'recentCompletionCount'>;

const ALL_TIME_DAYS = 3650;
const RECENT_DAYS = 7;
const MAX_PROJECTS = 200;

@Component({
  selector: 'app-projects-page',
  standalone: true,
  imports: [MatIconModule, MatTooltipModule, EmptyStateComponent, ErrorStateComponent, LoadingSkeletonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './projects.page.html',
  styleUrl: './projects.page.scss',
})
export class ProjectsPage {
  private readonly api = inject(ApiService);

  protected readonly rows = signal<ProjectRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<NormalizedApiError | null>(null);
  /** Set when one of the two metrics calls fails but the core project list still loaded -
   * the table renders with zeroed metrics for that column instead of blanking the whole page. */
  protected readonly partialError = signal<string | null>(null);
  protected readonly expandedProjectId = signal<number | null>(null);
  protected readonly sortKey = signal<SortKey>('completionCount');
  protected readonly sortDesc = signal(true);

  protected readonly sortedRows = computed(() => {
    const key = this.sortKey();
    const desc = this.sortDesc();
    return [...this.rows()].sort((a, b) => {
      const aVal = a[key];
      const bVal = b[key];
      const cmp = typeof aVal === 'string' ? aVal.localeCompare(bVal as string) : (aVal as number) - (bVal as number);
      return desc ? -cmp : cmp;
    });
  });

  constructor() {
    this.fetch();
  }

  protected sortBy(key: SortKey): void {
    if (this.sortKey() === key) {
      this.sortDesc.update((v) => !v);
    } else {
      this.sortKey.set(key);
      this.sortDesc.set(true);
    }
  }

  protected toggleExpand(projectId: number): void {
    this.expandedProjectId.update((current) => (current === projectId ? null : projectId));
  }

  protected retry(): void {
    this.fetch();
  }

  private fetch(): void {
    this.loading.set(true);
    this.error.set(null);
    this.partialError.set(null);

    // Only the core project listing is treated as fatal - without it there are no rows to
    // build at all. The two metrics calls each degrade to an empty array on failure so a single
    // upstream 503 (e.g. the 42 API being unreachable) can't blank the whole page; the affected
    // column just shows zeroed metrics with a banner explaining why.
    forkJoin({
      projects: this.api.getProjects().pipe(map((envelope) => envelope.data)),
      allTime: this.api.getTopProjects(ALL_TIME_DAYS, MAX_PROJECTS).pipe(
        map((envelope) => envelope.data),
        catchError((err: NormalizedApiError) => {
          this.partialError.set(`All-time completion metrics are unavailable (${err.message}).`);
          return of<ProjectMetric[]>([]);
        }),
      ),
      recent: this.api.getTopProjects(RECENT_DAYS, MAX_PROJECTS).pipe(
        map((envelope) => envelope.data),
        catchError((err: NormalizedApiError) => {
          this.partialError.set(`Last-7-days completion metrics are unavailable (${err.message}).`);
          return of<ProjectMetric[]>([]);
        }),
      ),
    }).subscribe({
      next: ({ projects, allTime, recent }) => {
        this.rows.set(this.merge(projects, allTime, recent));
        this.loading.set(false);
      },
      error: (err: NormalizedApiError) => {
        this.error.set(err);
        this.loading.set(false);
      },
    });
  }

  private merge(projects: ProjectListing[], allTime: ProjectMetric[], recent: ProjectMetric[]): ProjectRow[] {
    const allTimeById = new Map(allTime.map((m) => [m.projectId, m]));
    const recentById = new Map(recent.map((m) => [m.projectId, m]));

    return projects.map((p) => {
      const metric = allTimeById.get(p.id);
      return {
        projectId: p.id,
        projectName: p.name,
        completionCount: metric?.completionCount ?? 0,
        successRate: metric?.successRate ?? 0,
        averageFinalMark: metric?.averageFinalMark ?? 0,
        recentCompletionCount: recentById.get(p.id)?.completionCount ?? 0,
      };
    });
  }
}
