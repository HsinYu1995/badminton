import { computeSplashProgress } from '@/lib/splash-progress';

it('is 0 before fonts load and while auth is still resolving', () => {
  expect(computeSplashProgress(false, true)).toBe(0);
});

it('is 50 once fonts load but auth is still resolving', () => {
  expect(computeSplashProgress(true, true)).toBe(50);
});

it('is 50 if auth resolves before fonts load', () => {
  expect(computeSplashProgress(false, false)).toBe(50);
});

it('is 100 once both fonts are loaded and auth has resolved', () => {
  expect(computeSplashProgress(true, false)).toBe(100);
});
