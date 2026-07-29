// Design language for the badminton pickup-game screens: a "court card" system.
// Deliberately separate from ./theme.ts (the unused Expo template light/dark
// palette) - these tokens are what src/app/(tabs)/*.tsx actually render with.

export const Court = {
  green: '#0B6E4F',
  greenDeep: '#083D2C', // header/hero surface - darker than greenDark for real contrast
  greenDark: '#074A35',
  greenTint: '#E6F4EC',
  shuttle: '#F7F5EE', // "chalk" - warmer than pure white, like a court sideline or shuttle cork
  line: '#D8E6DC',
  ink: '#22302B', // "net charcoal" - deep charcoal-green, not flat black
  inkSecondary: '#5B7268',
  feather: '#E8A33D', // "shuttle gold" - cork-and-feather gold, not generic orange
  featherDark: '#C9820F',
  danger: '#D6455B', // "rally red" - a line-judge call, not a stop sign
  dangerTint: '#FCEAEA',
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 18,
  pill: 999,
} as const;

export const Space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

// The one signature typographic move: a condensed, bold display face for
// screen titles, event titles, and every number that matters (skill level,
// fee, headcount) - it reads like scoreboard/jersey numerals, which is
// specific to the sport, instead of leaning on the system font everywhere.
// Body text stays on the system font (loaded via @expo-google-fonts/league-spartan
// in src/app/_layout.tsx) so the boldness is spent in exactly one place.
export const Font = {
  display: 'LeagueSpartan_700Bold',
  displayBlack: 'LeagueSpartan_800ExtraBold',
} as const;

// One accent per skill band (src/lib/skill-bands.ts), novice -> professional,
// so a glance at an event card's left stripe reads as "how competitive is this"
// before you even read the skill-range text.
export const SkillBandAccents: Record<string, string> = {
  novice: '#8FD19E',
  beginner: '#5FBF7E',
  early_intermediate: '#3AA65E',
  intermediate: '#0B6E4F',
  intermediate_advanced: '#C9820F',
  advanced: '#E08E1D',
  professional: '#D6455B',
};

export const Shadow = {
  card: {
    shadowColor: '#0B2E1F',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
} as const;
