import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AutoLoopService } from './auto-loop.service';
import { TvModeService } from './tv-mode.service';

describe('AutoLoopService', () => {
  let service: AutoLoopService;
  let tvMode: TvModeService;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    });
    service = TestBed.inject(AutoLoopService);
    tvMode = TestBed.inject(TvModeService);
    router = TestBed.inject(Router);
  });

  it('defaults to manual mode', () => {
    expect(service.mode()).toBe('manual');
    expect(service.isAuto()).toBe(false);
  });

  it('toggle() flips between manual and auto', () => {
    service.toggle();
    expect(service.mode()).toBe('auto');
    service.toggle();
    expect(service.mode()).toBe('manual');
  });

  it('setMode() sets the mode explicitly', () => {
    service.setMode('auto');
    expect(service.mode()).toBe('auto');
  });

  it('starts with the TV phase the moment auto mode is freshly switched on', () => {
    expect(tvMode.enabled()).toBe(false);
    service.setMode('auto');
    expect(tvMode.enabled()).toBe(true);
  });

  it('does not reset an already-in-progress TV rotation when auto is switched on mid-session', () => {
    tvMode.enable();
    tvMode.completeIntro();
    tvMode.advanceSection();
    tvMode.advanceSection();
    expect(tvMode.activeSection()).toBe(2);

    service.setMode('auto');

    // Still enabled, and still on the same section - setMode() must not have called enable()
    // again (which would reset activeSection back to 0 and introComplete back to false).
    expect(tvMode.enabled()).toBe(true);
    expect(tvMode.activeSection()).toBe(2);
    expect(tvMode.introComplete()).toBe(true);
  });

  it('does not re-enable TV mode on repeated setMode("auto") calls once already auto', () => {
    service.setMode('auto');
    tvMode.disable(); // simulate the dashboard phase having taken over
    service.setMode('auto'); // e.g. some redundant call while still auto

    expect(tvMode.enabled()).toBe(false);
  });

  it('navigates to /dashboard when auto mode is turned on from elsewhere', () => {
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    Object.defineProperty(router, 'url', { value: '/evaluations', configurable: true });

    service.setMode('auto');
    TestBed.tick();

    expect(navigateSpy).toHaveBeenCalledWith('/dashboard');
  });

  it('does not navigate when already on /dashboard', () => {
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    Object.defineProperty(router, 'url', { value: '/dashboard', configurable: true });

    service.setMode('auto');
    TestBed.tick();

    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it('enterTvPhase() enables TV mode only while auto', () => {
    service.enterTvPhase();
    expect(tvMode.enabled()).toBe(false);

    service.setMode('auto');
    service.enterTvPhase();
    expect(tvMode.enabled()).toBe(true);
  });

  it('does not exit TV mode while the intro is still playing', () => {
    Object.defineProperty(router, 'url', { value: '/dashboard', configurable: true });
    service.setMode('auto');
    tvMode.enable();
    TestBed.tick();

    expect(tvMode.enabled()).toBe(true);
  });

  it('exits TV mode back to the dashboard once a full rotation lap completes', () => {
    Object.defineProperty(router, 'url', { value: '/dashboard', configurable: true });
    service.setMode('auto');
    tvMode.enable();
    tvMode.completeIntro();
    TestBed.tick();

    expect(tvMode.enabled()).toBe(true); // still on section 0, no lap completed yet

    // Advance through every section once - the wrap from the last section back to 0 is one
    // completed lap.
    for (let i = 0; i < tvMode.sectionCount; i++) {
      tvMode.advanceSection();
      TestBed.tick();
    }

    expect(tvMode.enabled()).toBe(false);
  });

  it('does not auto-exit TV mode when switched back to manual mid-rotation', () => {
    Object.defineProperty(router, 'url', { value: '/dashboard', configurable: true });
    service.setMode('auto');
    tvMode.enable();
    tvMode.completeIntro();
    TestBed.tick();

    service.setMode('manual');
    TestBed.tick();

    for (let i = 0; i < tvMode.sectionCount; i++) {
      tvMode.advanceSection();
      TestBed.tick();
    }

    expect(tvMode.enabled()).toBe(true);
  });
});
