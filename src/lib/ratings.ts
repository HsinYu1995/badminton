import type { SupabaseClient } from '@supabase/supabase-js';

export type Credit = { credit: number; ratingsCount: number };

// Unrated profiles simply have no row in the view (see CONTEXT.md's Credit
// term) - callers get `undefined` for those ids, never a fabricated 0.
export async function getCredits(supabase: SupabaseClient, userIds: string[]): Promise<Record<string, Credit>> {
  if (userIds.length === 0) return {};
  const { data } = await supabase.from('profile_credit').select('profile_id, credit, ratings_count').in('profile_id', userIds);
  const result: Record<string, Credit> = {};
  for (const row of (data as { profile_id: string; credit: number; ratings_count: number }[] | null) ?? []) {
    result[row.profile_id] = { credit: Number(row.credit), ratingsCount: Number(row.ratings_count) };
  }
  return result;
}

// "Unrated" for a profile with no ratings (see CONTEXT.md's Credit term) -
// never a fabricated "0.0 stars." Pulled out as a pure function (rather
// than inline in CreditPill's JSX) since this project's Jest setup only
// exercises components through expo-router/testing-library's renderRouter,
// which needs a route tree - there's no standalone RTL harness here for a
// leaf component in isolation, so the formatting logic is what's unit
// tested directly; the component itself is exercised through the screens
// that render it.
export function formatCredit(credit: Credit | undefined): string {
  if (!credit) return 'Unrated';
  return `★ ${credit.credit.toFixed(1)} (${credit.ratingsCount})`;
}

// This viewer's own previously-given scores for one event, keyed by ratee -
// lets the UI pre-fill each StarRating with what was already given, so
// "can be updated later" is something the user can actually see and change,
// not just something the upsert silently supports.
export async function getMyRatings(supabase: SupabaseClient, eventId: string, raterId: string): Promise<Record<string, number>> {
  const { data } = await supabase.from('ratings').select('ratee_id, score').eq('event_id', eventId).eq('rater_id', raterId);
  const result: Record<string, number> = {};
  for (const row of (data as { ratee_id: string; score: number }[] | null) ?? []) {
    result[row.ratee_id] = row.score;
  }
  return result;
}

export type SubmitRatingInput = {
  eventId: string;
  raterId: string;
  rateeId: string;
  score: number;
};

// Upserts on the (event_id, rater_id, ratee_id) unique constraint, so
// re-rating the same person for the same event overwrites the previous
// score instead of erroring - this is how "can be updated later" is
// implemented (see 20260725070000_ratings_update_and_credit.sql).
export async function submitRating(supabase: SupabaseClient, input: SubmitRatingInput): Promise<void> {
  const { error } = await supabase
    .from('ratings')
    .upsert(
      { event_id: input.eventId, rater_id: input.raterId, ratee_id: input.rateeId, score: input.score },
      { onConflict: 'event_id,rater_id,ratee_id' }
    );
  if (error) throw error;
}
