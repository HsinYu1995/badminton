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
  label: string;
  min: number;
  max: number;
};

// Mirrors public.skill_band()'s case statement in
// supabase/migrations/20260716084150_init_schema.sql - keep both in sync if
// the level-to-band boundaries ever change.
export const SKILL_BANDS: SkillBand[] = [
  { id: 'novice', label: 'Novice', min: 1, max: 3 },
  { id: 'beginner', label: 'Beginner', min: 4, max: 5 },
  { id: 'early_intermediate', label: 'Early Intermediate', min: 6, max: 7 },
  { id: 'intermediate', label: 'Intermediate', min: 8, max: 9 },
  { id: 'intermediate_advanced', label: 'Intermediate-Advanced', min: 10, max: 12 },
  { id: 'advanced', label: 'Advanced', min: 13, max: 15 },
  { id: 'professional', label: 'Professional', min: 16, max: 18 },
];

export function bandForLevel(level: number): SkillBand {
  return SKILL_BANDS.find((band) => level >= band.min && level <= band.max) ?? SKILL_BANDS[0];
}
