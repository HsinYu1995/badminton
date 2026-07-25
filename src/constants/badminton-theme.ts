// Design language for the badminton pickup-game screens: a "court card" system.
// Deliberately separate from ./theme.ts (the unused Expo template light/dark
// palette) - these tokens are what src/app/(tabs)/*.tsx actually render with.

export const Court = {
  green: '#0B6E4F',
  greenDark: '#074A35',
  greenTint: '#E6F4EC',
  shuttle: '#FFFDF8',
  line: '#D8E6DC',
  ink: '#173226',
  inkSecondary: '#5B7268',
  feather: '#F2A93C',
  featherDark: '#C9820F',
  danger: '#D64545',
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
  professional: '#D64545',
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
