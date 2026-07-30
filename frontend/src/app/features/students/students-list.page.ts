import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import type { PaginatedResult, SortDirection, SortField, StudentSummary } from '../../core/models/api.models';
import type { NormalizedApiError } from '../../core/interceptors/error.interceptor';
import { AvatarComponent } from '../../shared/components/avatar/avatar.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { ErrorStateComponent } from '../../shared/components/error-state/error-state.component';
import { LoadingSkeletonComponent } from '../../shared/components/loading-skeleton/loading-skeleton.component';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';

const EMPTY_RESULT: PaginatedResult<StudentSummary> = { items: [], page: 1, pageSize: 20, totalItems: 0, totalPages: 1 };

@Component({
  selector: 'app-students-list-page',
  standalone: true,
  imports: [
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatSelectModule,
    MatSlideToggleModule,
    AvatarComponent,
    EmptyStateComponent,
    ErrorStateComponent,
    LoadingSkeletonComponent,
    RelativeTimePipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './students-list.page.html',
  styleUrl: './students-list.page.scss',
})
export class StudentsListPage {
  private readonly api = inject(ApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly result = signal<PaginatedResult<StudentSummary>>(EMPTY_RESULT);
  protected readonly loading = signal(true);
  protected readonly error = signal<NormalizedApiError | null>(null);

  protected readonly search = signal('');
  protected readonly activeOnly = signal(false);
  protected readonly sort = signal<SortField>('level');
  protected readonly direction = signal<SortDirection>('desc');
  protected readonly page = signal(1);
  protected readonly pageSize = signal(20);

  private readonly searchInput$ = new Subject<string>();

  constructor() {
    const params = this.route.snapshot.queryParamMap;
    this.search.set(params.get('search') ?? '');
    this.activeOnly.set(params.get('activeOnly') === 'true');
    this.sort.set((params.get('sort') as SortField) ?? 'level');
    this.direction.set((params.get('direction') as SortDirection) ?? 'desc');
    this.page.set(Number(params.get('page')) || 1);
    this.pageSize.set(Number(params.get('pageSize')) || 20);

    this.searchInput$.pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef)).subscribe((value) => {
      this.search.set(value);
      this.page.set(1);
      this.syncUrlAndFetch();
    });

    this.fetch();
  }

  protected onSearchInput(value: string): void {
    this.searchInput$.next(value);
  }

  protected onActiveOnlyChange(value: boolean): void {
    this.activeOnly.set(value);
    this.page.set(1);
    this.syncUrlAndFetch();
  }

  protected onSortChange(sort: SortField): void {
    this.sort.set(sort);
    this.syncUrlAndFetch();
  }

  protected onDirectionToggle(): void {
    this.direction.set(this.direction() === 'asc' ? 'desc' : 'asc');
    this.syncUrlAndFetch();
  }

  protected onPage(event: PageEvent): void {
    this.page.set(event.pageIndex + 1);
    this.pageSize.set(event.pageSize);
    this.syncUrlAndFetch();
  }

  protected retry(): void {
    this.fetch();
  }

  protected goToStudent(login: string): void {
    this.router.navigate(['/students', login]);
  }

  private syncUrlAndFetch(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        search: this.search() || null,
        activeOnly: this.activeOnly() || null,
        sort: this.sort(),
        direction: this.direction(),
        page: this.page(),
        pageSize: this.pageSize(),
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
    this.fetch();
  }

  private fetch(): void {
    this.loading.set(true);
    this.api
      .getStudents({
        page: this.page(),
        pageSize: this.pageSize(),
        search: this.search(),
        sort: this.sort(),
        direction: this.direction(),
        activeOnly: this.activeOnly(),
      })
      .subscribe({
        next: (envelope) => {
          this.result.set(envelope.data);
          this.loading.set(false);
          this.error.set(null);
        },
        error: (err: NormalizedApiError) => {
          this.error.set(err);
          this.loading.set(false);
        },
      });
  }
}
