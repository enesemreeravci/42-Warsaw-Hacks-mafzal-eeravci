import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AvatarComponent } from './avatar.component';

describe('AvatarComponent', () => {
  let fixture: ComponentFixture<AvatarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AvatarComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(AvatarComponent);
  });

  it('renders an <img> when an imageUrl is provided', async () => {
    fixture.componentRef.setInput('imageUrl', 'https://example.com/a.png');
    fixture.componentRef.setInput('name', 'Muhammad Afzal');
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('img')?.getAttribute('src')).toBe('https://example.com/a.png');
  });

  it('falls back to initials when there is no imageUrl', async () => {
    fixture.componentRef.setInput('imageUrl', null);
    fixture.componentRef.setInput('name', 'Muhammad Afzal');
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('.avatar--fallback')?.textContent?.trim()).toBe('MA');
  });

  it('falls back to "?" for an empty name', async () => {
    fixture.componentRef.setInput('imageUrl', null);
    fixture.componentRef.setInput('name', '');
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.avatar--fallback')?.textContent?.trim()).toBe('?');
  });
});
