import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { isPastEvent, type EventListItem } from '@/lib/events';
import { loadProfileSummary, getEventRoster, type Attendee, type AttendingEvent, type ProfileRow } from '@/lib/profile-data';
import { getCredits, getMyRatings, submitRating, type Credit } from '@/lib/ratings';
import { bandForLevel, SKILL_BANDS, type SkillBandId } from '@/lib/skill-bands';
import { Court, Font, Radius, Space } from '@/constants/badminton-theme';
import { EventCard } from '@/components/event-card';
import { ActionButton } from '@/components/action-button';
import { Pill } from '@/components/pill';
import { CreditPill } from '@/components/credit-pill';
import { StarRating } from '@/components/star-rating';
import { SkillBandSelector } from '@/components/skill-band-selector';
import { SectionDivider } from '@/components/section-divider';

export default function ProfileScreen() {
  const { session, signOut } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [myEvents, setMyEvents] = useState<EventListItem[]>([]);
  const [attendingEvents, setAttendingEvents] = useState<AttendingEvent[]>([]);
  const [organizerCredits, setOrganizerCredits] = useState<Record<string, Credit>>({});
  const [participantCounts, setParticipantCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [removingEventId, setRemovingEventId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [leavingEventId, setLeavingEventId] = useState<string | null>(null);
  const [leaveError, setLeaveError] = useState<string | null>(null);

  const [displayNameText, setDisplayNameText] = useState('');
  const [bioText, setBioText] = useState('');
  const [contactInfoText, setContactInfoText] = useState('');
  const [skillBandId, setSkillBandId] = useState<SkillBandId | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!session) return;
    setLoading(true);

    const summary = await loadProfileSummary(supabase, session.user.id);

    if (summary.profile) {
      setProfile(summary.profile);
      setDisplayNameText(summary.profile.display_name);
      setBioText(summary.profile.bio ?? '');
      setContactInfoText(summary.profile.contact_info ?? '');
      setSkillBandId(summary.profile.skill_level != null ? bandForLevel(summary.profile.skill_level).id : null);
    }
    setMyEvents(summary.organizedEvents);
    setAttendingEvents(summary.attendingEvents);
    setParticipantCounts(summary.playerCounts);
    setLoadError(summary.profileError ?? summary.organizedEventsError ?? summary.attendingEventsError);

    const organizerIds = [...new Set(summary.attendingEvents.map((event) => event.organizer_id))];
    setOrganizerCredits(await getCredits(supabase, organizerIds));

    setLoading(false);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [loadProfile])
  );

  async function handleSignOut() {
    setSignOutError(null);
    try {
      await signOut();
    } catch (err) {
      setSignOutError(err instanceof Error ? err.message : 'Sign-out failed');
    }
  }

  async function handleSaveProfile() {
    if (!session) return;
    setSaveError(null);
    setSaveSuccess(false);

    const trimmedName = displayNameText.trim();
    if (!trimmedName) {
      setSaveError('Display name is required.');
      return;
    }

    setSavingProfile(true);
    try {
      const band = skillBandId ? SKILL_BANDS.find((b) => b.id === skillBandId) : null;
      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: trimmedName,
          bio: bioText.trim() || null,
          contact_info: contactInfoText.trim() || null,
          skill_level: band ? band.min : null,
        })
        .eq('id', session.user.id);
      if (error) throw error;
      setProfile((prev) => (prev ? { ...prev, display_name: trimmedName } : prev));
      setSaveSuccess(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save profile.');
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleRemoveOutdated(event: EventListItem) {
    setRemoveError(null);
    setRemovingEventId(event.id);
    try {
      const { error } = await supabase.from('events').delete().eq('id', event.id);
      if (error) throw error;
      setMyEvents((prev) => prev.filter((e) => e.id !== event.id));
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : 'Could not remove event.');
    } finally {
      setRemovingEventId(null);
    }
  }

  async function handleLeaveEvent(event: EventListItem) {
    if (!session) return;
    setLeaveError(null);
    setLeavingEventId(event.id);
    try {
      const { error } = await supabase
        .from('event_participants')
        .delete()
        .eq('event_id', event.id)
        .eq('user_id', session.user.id);
      if (error) throw error;
      setAttendingEvents((prev) => prev.filter((e) => e.id !== event.id));
    } catch (err) {
      setLeaveError(err instanceof Error ? err.message : 'Could not leave event.');
    } finally {
      setLeavingEventId(null);
    }
  }

  // Bumps one event's displayed player count by 1 - called when the
  // organizer accepts a pending request, the one moment a request starts
  // counting (see ACTIVE_PARTICIPANT_STATUSES in src/lib/events.ts).
  function handleParticipantAccepted(eventId: string) {
    setParticipantCounts((prev) => ({ ...prev, [eventId]: (prev[eventId] ?? 1) + 1 }));
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.topRow}>
        <Text style={styles.pageTitle}>🏸 Profile</Text>
        <View style={styles.userCorner}>
          <View style={styles.userCornerTop}>
            <View style={styles.avatarSmall}>
              <Text style={styles.avatarEmojiSmall}>🏸</Text>
            </View>
            <Text style={styles.nameSmall} numberOfLines={1}>
              {profile?.display_name ?? session?.user.email ?? 'Player'}
            </Text>
          </View>
          <Pressable onPress={handleSignOut} hitSlop={8}>
            <Text style={styles.signOutLink}>Sign out</Text>
          </Pressable>
        </View>
      </View>
      {signOutError && <Text style={styles.error}>{signOutError}</Text>}
      <SectionDivider />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>My profile</Text>

        <Text style={styles.label}>😀 Display name</Text>
        <TextInput
          style={styles.input}
          value={displayNameText}
          onChangeText={setDisplayNameText}
          placeholder="How other players see you"
          placeholderTextColor={Court.inkSecondary}
        />

        <Text style={styles.label}>🏆 Skill level</Text>
        <SkillBandSelector selectedId={skillBandId} onSelect={setSkillBandId} />

        <Text style={styles.label}>📝 About me</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={bioText}
          onChangeText={setBioText}
          placeholder="Tell other players a bit about yourself"
          placeholderTextColor={Court.inkSecondary}
          multiline
        />

        <Text style={styles.label}>💬 Contact info</Text>
        <TextInput
          style={styles.input}
          value={contactInfoText}
          onChangeText={setContactInfoText}
          placeholder="e.g. LINE ID, phone number"
          placeholderTextColor={Court.inkSecondary}
        />

        <ActionButton
          label={savingProfile ? 'Saving...' : 'Save profile'}
          onPress={handleSaveProfile}
          loading={savingProfile}
          style={styles.saveButton}
        />
        {saveError && <Text style={styles.error}>{saveError}</Text>}
        {saveSuccess && !saveError && <Text style={styles.success}>Profile saved.</Text>}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Games I'm playing</Text>
        <SectionDivider />
        {loading && <ActivityIndicator color={Court.green} />}
        {!loading && !loadError && attendingEvents.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🏸</Text>
            <Text style={styles.emptyTitle}>No games joined yet</Text>
            <Text style={styles.emptySubtext}>Head to Discover to find a pickup game.</Text>
          </View>
        )}
        {leaveError && <Text style={styles.error}>{leaveError}</Text>}
        {!loading &&
          !loadError &&
          attendingEvents.map((event) => (
            <View key={event.id}>
              <Pressable onPress={() => router.push({ pathname: '/event/[id]', params: { id: event.id } })}>
                <EventCard
                  event={event}
                  participantCount={participantCounts[event.id]}
                  action={
                    isPastEvent(event) ? undefined : (
                      <ActionButton
                        label="Leave event"
                        onPress={() => handleLeaveEvent(event)}
                        variant="danger"
                        loading={leavingEventId === event.id}
                      />
                    )
                  }
                />
              </Pressable>
              {event.organizer && session && (
                <View style={styles.organizerCard}>
                  <Text style={styles.organizerLabel}>🧑 Organized by {event.organizer.display_name}</Text>
                  <View style={styles.pillRowSmall}>
                    {event.organizer.skill_level != null && (
                      <Pill label={bandForLevel(event.organizer.skill_level).label} tone="green" />
                    )}
                    <CreditPill credit={organizerCredits[event.organizer_id]} />
                    {event.organizer.contact_info && <Pill label={event.organizer.contact_info} tone="feather" />}
                  </View>
                  <RatingRow
                    eventId={event.id}
                    raterId={session.user.id}
                    rateeId={event.organizer_id}
                    canRate={isPastEvent(event)}
                  />
                </View>
              )}
              <FellowParticipants eventId={event.id} currentUserId={session?.user.id ?? ''} canRate={isPastEvent(event)} />
            </View>
          ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>My events</Text>
        <SectionDivider />
        {loading && <ActivityIndicator color={Court.green} />}
        {!loading && loadError && <Text style={styles.error}>{loadError}</Text>}
        {!loading && !loadError && myEvents.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🏸</Text>
            <Text style={styles.emptyTitle}>No games organized yet</Text>
            <Text style={styles.emptySubtext}>Head to Create to host your first pickup game.</Text>
          </View>
        )}
        {removeError && <Text style={styles.error}>{removeError}</Text>}
        {!loading &&
          !loadError &&
          myEvents.map((event) => (
            <View key={event.id}>
              <Pressable onPress={() => router.push({ pathname: '/event/[id]', params: { id: event.id } })}>
                <EventCard
                  event={event}
                  participantCount={participantCounts[event.id]}
                  action={
                    isPastEvent(event) ? (
                      <ActionButton
                        label="Remove outdated event"
                        onPress={() => handleRemoveOutdated(event)}
                        variant="danger"
                        loading={removingEventId === event.id}
                      />
                    ) : (
                      <Text style={styles.upcomingLabel}>Upcoming</Text>
                    )
                  }
                />
              </Pressable>
              <AttendeeRoster
                eventId={event.id}
                organizerId={session?.user.id ?? ''}
                canRate={isPastEvent(event)}
                onAccept={handleParticipantAccepted}
              />
            </View>
          ))}
      </View>
    </ScrollView>
  );
}

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
}: {
  name: string;
  skillLevel: number | null;
  contact?: string | null;
  credit: Credit | undefined;
  statusLabel?: string;
  statusTone?: 'green' | 'neutral' | 'danger';
  decision?: { onAccept: () => void; onDecline: () => void; loading?: boolean };
  rating?: { value: number; onChange: (score: number) => void; disabled?: boolean };
}) {
  return (
    <View style={styles.rosterRow}>
      <Text style={styles.rosterName}>{name}</Text>
      <View style={styles.pillRowSmall}>
        {statusLabel && <Pill label={statusLabel} tone={statusTone ?? 'neutral'} />}
        {skillLevel != null && <Pill label={bandForLevel(skillLevel).label} tone="feather" />}
        <CreditPill credit={credit} />
        {contact && <Pill label={contact} tone="neutral" />}
      </View>
      {decision && (
        <View style={styles.decisionRow}>
          <ActionButton label="Accept" onPress={decision.onAccept} loading={decision.loading} />
          <ActionButton label="Decline" onPress={decision.onDecline} variant="danger" loading={decision.loading} />
        </View>
      )}
      {rating && <StarRating value={rating.value} onChange={rating.onChange} disabled={rating.disabled} />}
    </View>
  );
}

// A single rate-this-person control with its own submit state - used for
// the organizer card on an attending event (rate the host).
function RatingRow({
  eventId,
  raterId,
  rateeId,
  canRate,
}: {
  eventId: string;
  raterId: string;
  rateeId: string;
  canRate: boolean;
}) {
  const [value, setValue] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!canRate) return;
    let cancelled = false;
    getMyRatings(supabase, eventId, raterId).then((ratings) => {
      if (!cancelled) setValue(ratings[rateeId] ?? 0);
    });
    return () => {
      cancelled = true;
    };
  }, [eventId, raterId, rateeId, canRate]);

  if (!canRate) return null;

  async function handleRate(score: number) {
    setError(null);
    const previous = value;
    setValue(score);
    try {
      await submitRating(supabase, { eventId, raterId, rateeId, score });
    } catch (err) {
      setValue(previous);
      setError(err instanceof Error ? err.message : 'Could not save rating.');
    }
  }

  return (
    <View style={styles.ratingRow}>
      <Text style={styles.ratingLabel}>Rate the host</Text>
      <StarRating value={value} onChange={handleRate} />
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

// The other *accepted* players in a game the signed-in user is attending -
// didn't exist before this pass (a non-organizer participant had no
// visibility into who else was in their game). Only accepted rows: a
// regular participant doesn't need the organizer's pending-request triage
// view, just the people they actually played with.
function FellowParticipants({ eventId, currentUserId, canRate }: { eventId: string; currentUserId: string; canRate: boolean }) {
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [credits, setCredits] = useState<Record<string, Credit>>({});
  const [myRatings, setMyRatings] = useState<Record<string, number>>({});
  const [loadingRoster, setLoadingRoster] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingRoster(true);
    getEventRoster(supabase, eventId).then(async (rows) => {
      if (cancelled) return;
      const fellows = rows.filter((row) => row.status === 'accepted' && row.user_id !== currentUserId);
      setAttendees(fellows);
      const ids = fellows.map((row) => row.user_id);
      const [creditsById, myRatingsById] = await Promise.all([
        getCredits(supabase, ids),
        canRate && currentUserId ? getMyRatings(supabase, eventId, currentUserId) : Promise.resolve({}),
      ]);
      if (!cancelled) {
        setCredits(creditsById);
        setMyRatings(myRatingsById);
        setLoadingRoster(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [eventId, currentUserId, canRate]);

  if (loadingRoster || attendees.length === 0) return null;

  async function handleRate(rateeId: string, score: number) {
    setError(null);
    const previous = myRatings[rateeId] ?? 0;
    setMyRatings((prev) => ({ ...prev, [rateeId]: score }));
    try {
      await submitRating(supabase, { eventId, raterId: currentUserId, rateeId, score });
    } catch (err) {
      setMyRatings((prev) => ({ ...prev, [rateeId]: previous }));
      setError(err instanceof Error ? err.message : 'Could not save rating.');
    }
  }

  return (
    <View style={styles.rosterCard}>
      <Text style={styles.rosterTitle}>🏸 Also playing ({attendees.length})</Text>
      {error && <Text style={styles.error}>{error}</Text>}
      {attendees.map((attendee) => (
        <PersonRow
          key={attendee.user_id}
          name={attendee.profiles?.display_name ?? 'Unknown player'}
          skillLevel={attendee.profiles?.skill_level ?? null}
          contact={attendee.profiles?.contact_info}
          credit={credits[attendee.user_id]}
          rating={
            canRate
              ? { value: myRatings[attendee.user_id] ?? 0, onChange: (score) => handleRate(attendee.user_id, score) }
              : undefined
          }
        />
      ))}
    </View>
  );
}

// A small self-fetching block rather than threading roster data through
// ProfileScreen's own state - each organized event's attendee list is
// independent of the rest of the screen's load/save cycle, and there's no
// other consumer that would benefit from lifting this fetch up.
function AttendeeRoster({
  eventId,
  organizerId,
  canRate,
  onAccept,
}: {
  eventId: string;
  organizerId: string;
  canRate: boolean;
  onAccept: (eventId: string) => void;
}) {
  const [attendees, setAttendees] = useState<Attendee[]>([]);
  const [credits, setCredits] = useState<Record<string, Credit>>({});
  const [myRatings, setMyRatings] = useState<Record<string, number>>({});
  const [loadingRoster, setLoadingRoster] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [decidingUserId, setDecidingUserId] = useState<string | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadingRoster(true);
    getEventRoster(supabase, eventId).then(async (rows) => {
      if (cancelled) return;
      setAttendees(rows);
      const ids = rows.map((row) => row.user_id);
      const [creditsById, myRatingsById] = await Promise.all([
        getCredits(supabase, ids),
        canRate && organizerId ? getMyRatings(supabase, eventId, organizerId) : Promise.resolve({}),
      ]);
      if (!cancelled) {
        setCredits(creditsById);
        setMyRatings(myRatingsById);
        setLoadingRoster(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [eventId, organizerId, canRate]);

  if (loadingRoster) return null;
  if (attendees.length === 0) return null;

  async function handleRate(rateeId: string, score: number) {
    setError(null);
    const previous = myRatings[rateeId] ?? 0;
    setMyRatings((prev) => ({ ...prev, [rateeId]: score }));
    try {
      await submitRating(supabase, { eventId, raterId: organizerId, rateeId, score });
    } catch (err) {
      setMyRatings((prev) => ({ ...prev, [rateeId]: previous }));
      setError(err instanceof Error ? err.message : 'Could not save rating.');
    }
  }

  async function handleDecide(userId: string, status: 'accepted' | 'declined') {
    setDecisionError(null);
    setDecidingUserId(userId);
    try {
      const { data: updated, error: decideErr } = await supabase
        .from('event_participants')
        .update({ status })
        .eq('event_id', eventId)
        .eq('user_id', userId)
        .select('user_id');
      if (decideErr) throw decideErr;
      if (!updated?.length) throw new Error('This request is no longer available.');
      setAttendees((prev) => prev.map((row) => (row.user_id === userId ? { ...row, status } : row)));
      if (status === 'accepted') onAccept(eventId);
    } catch (err) {
      setDecisionError(err instanceof Error ? err.message : 'Could not update request.');
    } finally {
      setDecidingUserId(null);
    }
  }

  return (
    <View style={styles.rosterCard}>
      <Text style={styles.rosterTitle}>👥 Requests ({attendees.length})</Text>
      {error && <Text style={styles.error}>{error}</Text>}
      {decisionError && <Text style={styles.error}>{decisionError}</Text>}
      {attendees.map((attendee) => (
        <PersonRow
          key={attendee.user_id}
          name={attendee.profiles?.display_name ?? 'Unknown player'}
          skillLevel={attendee.profiles?.skill_level ?? null}
          contact={attendee.profiles?.contact_info}
          credit={credits[attendee.user_id]}
          statusLabel={
            attendee.status === 'accepted' ? 'Accepted' : attendee.status === 'declined' ? 'Declined' : 'Pending'
          }
          statusTone={attendee.status === 'accepted' ? 'green' : attendee.status === 'declined' ? 'danger' : 'neutral'}
          decision={
            attendee.status === 'pending'
              ? {
                  onAccept: () => handleDecide(attendee.user_id, 'accepted'),
                  onDecline: () => handleDecide(attendee.user_id, 'declined'),
                  loading: decidingUserId === attendee.user_id,
                }
              : undefined
          }
          rating={
            canRate && attendee.status === 'accepted'
              ? { value: myRatings[attendee.user_id] ?? 0, onChange: (score) => handleRate(attendee.user_id, score) }
              : undefined
          }
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Court.greenTint },
  content: { padding: Space.lg, gap: Space.xl },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  pageTitle: { fontSize: 26, fontFamily: Font.displayBlack, color: Court.ink },
  userCorner: { alignItems: 'flex-end', gap: 4, maxWidth: '55%' },
  userCornerTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  avatarSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Court.shuttle,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Court.feather,
  },
  avatarEmojiSmall: { fontSize: 14 },
  nameSmall: { fontFamily: Font.display, fontSize: 14, color: Court.ink, flexShrink: 1 },
  signOutLink: { fontFamily: Font.display, fontSize: 12, color: Court.danger },
  section: { gap: Space.sm },
  sectionTitle: { fontSize: 20, fontFamily: Font.displayBlack, color: Court.ink, marginBottom: 0 },
  label: { fontWeight: '700', color: Court.ink, marginTop: Space.md },
  input: {
    borderWidth: 1,
    borderColor: Court.line,
    backgroundColor: Court.shuttle,
    borderRadius: Radius.md,
    padding: 10,
    marginTop: 4,
    color: Court.ink,
  },
  multiline: { minHeight: 70, textAlignVertical: 'top' },
  saveButton: { marginTop: Space.lg, alignSelf: 'stretch' },
  emptyState: { alignItems: 'center', marginTop: Space.xl, gap: 4 },
  emptyEmoji: { fontSize: 40, marginBottom: Space.xs },
  emptyTitle: { fontSize: 17, fontFamily: Font.display, color: Court.ink },
  emptySubtext: { color: Court.inkSecondary, textAlign: 'center' },
  error: { color: Court.danger },
  success: { color: Court.green },
  upcomingLabel: { color: Court.green, fontWeight: '700' },
  organizerCard: {
    backgroundColor: Court.shuttle,
    borderRadius: Radius.md,
    padding: Space.sm,
    marginTop: -Space.sm,
    marginBottom: Space.md,
    marginLeft: Space.sm,
    gap: Space.xs,
  },
  organizerLabel: { fontFamily: Font.display, fontSize: 13, color: Court.ink },
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
