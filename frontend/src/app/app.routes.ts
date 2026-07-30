import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  {
    path: 'dashboard',
    loadComponent: () => import('./features/dashboard/dashboard.page').then((m) => m.DashboardPage),
    title: '42 Warsaw Learning Progress Insight — Dashboard',
  },
  {
    path: 'students',
    loadComponent: () => import('./features/students/students-list.page').then((m) => m.StudentsListPage),
    title: 'Students — 42 Warsaw Learning Progress Insight',
  },
  {
    path: 'students/:login',
    loadComponent: () => import('./features/student-detail/student-detail.page').then((m) => m.StudentDetailPage),
    title: 'Student — 42 Warsaw Learning Progress Insight',
  },
  {
    path: 'projects',
    loadComponent: () => import('./features/projects/projects.page').then((m) => m.ProjectsPage),
    title: 'Projects — 42 Warsaw Learning Progress Insight',
  },
  {
    path: 'about',
    loadComponent: () => import('./features/about/about.page').then((m) => m.AboutPage),
    title: 'About — 42 Warsaw Learning Progress Insight',
  },
  {
    path: 'error',
    loadComponent: () => import('./features/error/error.page').then((m) => m.ErrorPage),
    title: 'Error — 42 Warsaw Learning Progress Insight',
  },
  { path: '**', redirectTo: 'error' },
];
