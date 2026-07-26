import { formatCredit, getCredits, submitRating } from '@/lib/ratings';

it('formats "Unrated" when there is no credit', () => {
  expect(formatCredit(undefined)).toBe('Unrated');
});

it('formats the average to one decimal place with the ratings count', () => {
  expect(formatCredit({ credit: 4.5, ratingsCount: 3 })).toBe('★ 4.5 (3)');
  expect(formatCredit({ credit: 5, ratingsCount: 1 })).toBe('★ 5.0 (1)');
});

function fakeSupabase(overrides: { from?: (table: string) => unknown }) {
  return { from: overrides.from } as never;
}

it('maps profile_credit rows into a Record keyed by profile_id', async () => {
  const supabase = fakeSupabase({
    from: (table) => {
      expect(table).toBe('profile_credit');
      return {
        select: () => ({
          in: () =>
            Promise.resolve({
              data: [
                { profile_id: 'user-1', credit: '4.50', ratings_count: 2 },
                { profile_id: 'user-2', credit: '3.00', ratings_count: 1 },
              ],
              error: null,
            }),
        }),
      };
    },
  });

  const credits = await getCredits(supabase, ['user-1', 'user-2']);
  expect(credits).toEqual({
    'user-1': { credit: 4.5, ratingsCount: 2 },
    'user-2': { credit: 3, ratingsCount: 1 },
  });
});

it('omits ids with no profile_credit row - unrated, not zero', async () => {
  const supabase = fakeSupabase({
    from: () => ({
      select: () => ({ in: () => Promise.resolve({ data: [{ profile_id: 'user-1', credit: '4.50', ratings_count: 2 }], error: null }) }),
    }),
  });

  const credits = await getCredits(supabase, ['user-1', 'user-2']);
  expect(credits['user-2']).toBeUndefined();
});

it('returns an empty object without querying for an empty id list', async () => {
  const supabase = fakeSupabase({
    from: () => {
      throw new Error('should not be called');
    },
  });
  expect(await getCredits(supabase, [])).toEqual({});
});

it('submits a rating via upsert on the (event_id, rater_id, ratee_id) conflict target', async () => {
  const mockUpsert = jest.fn(() => Promise.resolve({ error: null }));
  const supabase = fakeSupabase({
    from: (table) => {
      expect(table).toBe('ratings');
      return { upsert: mockUpsert };
    },
  });

  await submitRating(supabase, { eventId: 'event-1', raterId: 'rater-1', rateeId: 'ratee-1', score: 4 });

  expect(mockUpsert).toHaveBeenCalledWith(
    { event_id: 'event-1', rater_id: 'rater-1', ratee_id: 'ratee-1', score: 4 },
    { onConflict: 'event_id,rater_id,ratee_id' }
  );
});

it('throws when the upsert fails', async () => {
  const supabase = fakeSupabase({
    from: () => ({ upsert: () => Promise.resolve({ error: { message: 'boom' } }) }),
  });

  await expect(submitRating(supabase, { eventId: 'e', raterId: 'r', rateeId: 't', score: 3 })).rejects.toEqual({ message: 'boom' });
});
