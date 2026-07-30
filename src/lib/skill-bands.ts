export type SkillBandId =
  | 'novice'
  | 'beginner'
  | 'early_intermediate'
  | 'intermediate'
  | 'intermediate_advanced'
  | 'advanced'
  | 'professional';

export type SkillBand = {
  id: SkillBandId;
  min: number;
  max: number;
};

// Mirrors public.skill_band()'s case statement in
// supabase/migrations/20260716084150_init_schema.sql - keep both in sync if
// the level-to-band boundaries ever change.
export const SKILL_BANDS: SkillBand[] = [
  { id: 'novice', min: 1, max: 3 },
  { id: 'beginner', min: 4, max: 5 },
  { id: 'early_intermediate', min: 6, max: 7 },
  { id: 'intermediate', min: 8, max: 9 },
  { id: 'intermediate_advanced', min: 10, max: 12 },
  { id: 'advanced', min: 13, max: 15 },
  { id: 'professional', min: 16, max: 18 },
];

export function bandForLevel(level: number): SkillBand {
  return SKILL_BANDS.find((band) => level >= band.min && level <= band.max) ?? SKILL_BANDS[0];
}
