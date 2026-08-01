import { View, Text, StyleSheet } from 'react-native';
import { useI18n } from '@/lib/i18n';
import type { Attendee } from '@/lib/profile-data';
import { useRating, type Credit } from '@/lib/ratings';
import { useParticipantDecision } from '@/lib/participant-decisions';
import { bandForLevel } from '@/lib/skill-bands';
import { Court, Font, Radius, Space } from '@/constants/badminton-theme';
import { ActionButton } from '@/components/action-button';
import { Pill } from '@/components/pill';
import { CreditPill } from '@/components/credit-pill';
import { StarRating } from '@/components/star-rating';

// One person's row: name, skill band, Credit, and (when ratingsEnabled) a
// StarRating to score them - shared shape between the organizer roster and
// the fellow-participants list below, since both show "someone I shared an
// event with."
function PersonRow({
  name,
  skillLevel,
  contact,
  credit,
  statusLabel,
  statusTone,
  decision,
  rating,
  isGuest,
}: {
  name: string;
  skillLevel: number | null;
  contact?: string | null;
  credit: Credit | undefined;
  statusLabel?: string;
  statusTone?: 'green' | 'neutral' | 'danger';
  decision?: { onAccept: () => void; onDecline: () => void; loading?: boolean };
  rating?: { value: number; onChange: (score: number) => void; disabled?: boolean };
  isGuest?: boolean;
}) {
  const { t } = useI18n();
  return (
    <View style={styles.rosterRow}>
      <Text style={styles.rosterName}>{name}</Text>
      <View style={styles.pillRowSmall}>
        {statusLabel && <Pill label={statusLabel} tone={statusTone ?? 'neutral'} />}
        {isGuest && <Pill label={t('profile.guestBadge')} tone="neutral" />}
        {skillLevel != null && <Pill label={t(`skillBands.${bandForLevel(skillLevel).id}`)} tone="feather" />}
        <CreditPill credit={credit} />
        {contact && <Pill label={contact} tone="neutral" />}
      </View>
      {decision && (
        <View style={styles.decisionRow}>
          <ActionButton label={t('profile.accept')} onPress={decision.onAccept} loading={decision.loading} />
          <ActionButton label={t('profile.decline')} onPress={decision.onDecline} variant="danger" loading={decision.loading} />
        </View>
      )}
      {rating && <StarRating value={rating.value} onChange={rating.onChange} disabled={rating.disabled} />}
    </View>
  );
}

// A single rate-this-person control with its own submit-error display -
// used for the organizer card on an attending event (rate the host). `value`
// comes from ProfileScreen's consolidated state (see loadProfileSummary's
// myRatingsByEventId); the submit itself is wrapped by useRating, same as
// every other rating control here.
export function RatingRow({ value, canRate, onRate }: { value: number; canRate: boolean; onRate: (score: number) => Promise<void> }) {
  const { t } = useI18n();
  const { rate, error } = useRating(onRate);

  if (!canRate) return null;

  return (
    <View style={styles.ratingRow}>
      <Text style={styles.ratingLabel}>{t('profile.rateTheHost')}</Text>
      <StarRating value={value} onChange={rate} />
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

// The other *accepted* players in a game the signed-in user is attending -
// only accepted rows: a regular participant doesn't need the organizer's
// pending-request triage view, just the people they actually played with.
// `attendees` is this event's full roster (see loadProfileSummary's
// rostersByEventId) - filtered down to "accepted, not me" here rather than
// by the caller, since that's specific to this card's own framing.
export function FellowParticipants({
  attendees,
  currentUserId,
  canRate,
  credits,
  myRatings,
  onRate,
}: {
  attendees: Attendee[];
  currentUserId: string;
  canRate: boolean;
  credits: Record<string, Credit>;
  myRatings: Record<string, number>;
  onRate: (rateeId: string, score: number) => Promise<void>;
}) {
  const { t } = useI18n();
  const { rate, error } = useRating(onRate);
  const fellows = attendees.filter((row) => row.status === 'accepted' && row.user_id !== currentUserId);

  if (fellows.length === 0) return null;

  return (
    <View style={styles.rosterCard}>
      <Text style={styles.rosterTitle}>{t('profile.alsoPlaying', { count: fellows.length })}</Text>
      {error && <Text style={styles.error}>{error}</Text>}
      {fellows.map((attendee) => (
        <PersonRow
          key={attendee.user_id}
          name={attendee.profiles?.display_name ?? t('profile.unknownPlayer')}
          skillLevel={attendee.profiles?.skill_level ?? null}
          contact={attendee.profiles?.contact_info}
          credit={credits[attendee.user_id]}
          isGuest={attendee.profiles?.is_anonymous ?? false}
          rating={
            canRate ? { value: myRatings[attendee.user_id] ?? 0, onChange: (score) => rate(attendee.user_id, score) } : undefined
          }
        />
      ))}
    </View>
  );
}

// The full roster (any status) of one organized event - see
// loadProfileSummary's rostersByEventId, batched across every organized/
// attending event in one query rather than fetched per card. Owns both the
// rating control (useRating) and the accept/decline control
// (useParticipantDecision) for this event's roster - `onDecided` is how the
// screen-level roster/player-count state (shared across every event) gets
// resynced after a successful decision.
export function AttendeeRoster({
  eventId,
  attendees,
  canRate,
  credits,
  myRatings,
  onRate,
  onDecided,
}: {
  eventId: string;
  attendees: Attendee[];
  canRate: boolean;
  credits: Record<string, Credit>;
  myRatings: Record<string, number>;
  onRate: (rateeId: string, score: number) => Promise<void>;
  onDecided: (userId: string, status: 'accepted' | 'declined') => void;
}) {
  const { t } = useI18n();
  const { rate, error: ratingError } = useRating(onRate);
  const { decide, decidingUserId, error: decisionError } = useParticipantDecision(eventId, onDecided);

  if (attendees.length === 0) return null;

  return (
    <View style={styles.rosterCard}>
      <Text style={styles.rosterTitle}>{t('profile.requestsCount', { count: attendees.length })}</Text>
      {ratingError && <Text style={styles.error}>{ratingError}</Text>}
      {decisionError && <Text style={styles.error}>{decisionError}</Text>}
      {attendees.map((attendee) => (
        <PersonRow
          key={attendee.user_id}
          name={attendee.profiles?.display_name ?? t('profile.unknownPlayer')}
          skillLevel={attendee.profiles?.skill_level ?? null}
          contact={attendee.profiles?.contact_info}
          credit={credits[attendee.user_id]}
          isGuest={attendee.profiles?.is_anonymous ?? false}
          statusLabel={
            attendee.status === 'accepted'
              ? t('profile.statusAccepted')
              : attendee.status === 'declined'
                ? t('profile.statusDeclined')
                : t('profile.statusPending')
          }
          statusTone={attendee.status === 'accepted' ? 'green' : attendee.status === 'declined' ? 'danger' : 'neutral'}
          decision={
            attendee.status === 'pending'
              ? {
                  onAccept: () => decide(attendee.user_id, 'accepted'),
                  onDecline: () => decide(attendee.user_id, 'declined'),
                  loading: decidingUserId === attendee.user_id,
                }
              : undefined
          }
          rating={
            canRate && attendee.status === 'accepted'
              ? { value: myRatings[attendee.user_id] ?? 0, onChange: (score) => rate(attendee.user_id, score) }
              : undefined
          }
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  error: { color: Court.danger },
  pillRowSmall: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.xs },
  ratingRow: { gap: 4, marginTop: Space.xs },
  ratingLabel: { fontSize: 12, color: Court.inkSecondary },
  rosterCard: {
    backgroundColor: Court.shuttle,
    borderRadius: Radius.md,
    padding: Space.sm,
    marginTop: -Space.sm,
    marginBottom: Space.md,
    marginLeft: Space.sm,
    gap: Space.sm,
  },
  rosterTitle: { fontFamily: Font.display, fontSize: 13, color: Court.ink },
  rosterRow: { gap: 4 },
  rosterName: { fontFamily: Font.display, fontSize: 13, color: Court.ink },
  decisionRow: { flexDirection: 'row', gap: Space.sm, marginTop: Space.xs },
});
