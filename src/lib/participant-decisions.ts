import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { selectOrThrow } from '@/lib/mutations';
import { useI18n } from '@/lib/i18n';

export type ParticipantDecisionStatus = 'accepted' | 'declined';

// The organizer accepting or declining one pending request - relies on
// participants_update_by_organizer (organizer can update any participant row
// on their own event; see 20260716201044_rls_policies.sql). Owns its own
// in-flight/error state so callers (AttendeeRoster) don't hand-roll it.
//
// Acceptance can also be rejected outright by the enforce_event_headcount
// trigger (see supabase/migrations/20260801120000_event_capacity_trigger.sql
// and docs/adr/0002-event-capacity-enforced-by-trigger.md) if the event
// filled up - e.g. two pending requests decided for the same last spot -
// surfaced via its custom SQLSTATE rather than the generic "no longer
// available" guard below.
//
// RLS silently matches zero rows rather than erroring when the organizer
// check fails (or the row was already decided) - selectOrThrow (see
// src/lib/mutations.ts) is what turns that into a visible error instead of
// an optimistic update the database never actually made.
//
// The actual roster/player-count state update on success is the caller's
// job (via onDecided) - that state is shared across every event on the
// screen, not owned by this one card's decision.
export function useParticipantDecision(eventId: string, onDecided: (userId: string, status: ParticipantDecisionStatus) => void) {
  const { t } = useI18n();
  const [decidingUserId, setDecidingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(userId: string, status: ParticipantDecisionStatus) {
    setError(null);
    setDecidingUserId(userId);
    try {
      const query = supabase
        .from('event_participants')
        .update({ status })
        .eq('event_id', eventId)
        .eq('user_id', userId)
        .select('user_id');
      try {
        await selectOrThrow(query, t('profile.requestNoLongerAvailable'));
      } catch (err) {
        if (err && typeof err === 'object' && 'code' in err && err.code === 'EVFUL') throw new Error(t('profile.eventIsFull'));
        throw err;
      }
      onDecided(userId, status);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('profile.couldNotUpdateRequest'));
    } finally {
      setDecidingUserId(null);
    }
  }

  return { decide, decidingUserId, error };
}
