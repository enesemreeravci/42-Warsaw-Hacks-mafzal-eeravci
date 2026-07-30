import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { StatCardComponent } from './stat-card.component';

describe('StatCardComponent', () => {
  let fixture: ComponentFixture<StatCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StatCardComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(StatCardComponent);
  });

  it('renders the label and value', async () => {
    fixture.componentRef.setInput('label', 'Active students');
    fixture.componentRef.setInput('value', 42);
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.stat-card__label')?.textContent).toContain('Active students');
    expect(el.querySelector('.stat-card__value')?.textContent).toContain('42');
  });

  it('renders an optional suffix and hint', async () => {
    fixture.componentRef.setInput('label', 'Average level');
    fixture.componentRef.setInput('value', '5.83');
    fixture.componentRef.setInput('suffix', ' lvl');
    fixture.componentRef.setInput('hint', 'active students only');
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.stat-card__suffix')?.textContent).toContain('lvl');
    expect(el.querySelector('.stat-card__hint')?.textContent).toContain('active students only');
  });

  it('applies the accent class when accent is true', async () => {
    fixture.componentRef.setInput('label', 'x');
    fixture.componentRef.setInput('value', 1);
    fixture.componentRef.setInput('accent', true);
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.stat-card--accent')).toBeTruthy();
  });
});
