// A write followed by .select() lets a caller tell "the row changed" apart
// from "RLS silently matched zero rows" - Postgres/PostgREST report the
// latter as an ordinary success (no error), so a write chain that only
// checks `error` can't distinguish a mutation that actually happened from
// one the database quietly refused (see handleDecide in
// src/app/(tabs)/profile.tsx for where this was first noticed).
// selectOrThrow makes that distinction the caller can't opt out of: it
// always throws when zero rows come back.
export async function selectOrThrow<T>(
  query: PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>,
  notFoundMessage: string
): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw error;
  if (!data?.length) throw new Error(notFoundMessage);
  return data;
}
