// The splash screen's loading bar reflects real startup state, not a fake
// looping animation - two known steps (fonts, then auth) map to 50/100, so
// the bar always lands on 100 exactly when RootNavigator is about to render,
// never stalling short or overshooting.
export function computeSplashProgress(fontsLoaded: boolean, authLoading: boolean): number {
  let progress = 0;
  if (fontsLoaded) progress += 50;
  if (!authLoading) progress += 50;
  return progress;
}
