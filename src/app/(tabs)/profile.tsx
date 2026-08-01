import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { ACTIVE_PARTICIPANT_STATUSES, computePlayerCounts, isPastEvent, type EventListItem } from '@/lib/events';
import { selectOrThrow } from '@/lib/mutations';
import { loadProfileSummary, type Attendee, type AttendingEvent, type ProfileRow } from '@/lib/profile-data';
import { submitRating, type Credit } from '@/lib/ratings';
import type { ParticipantDecisionStatus } from '@/lib/participant-decisions';
import { bandForLevel, SKILL_BANDS, type SkillBandId } from '@/lib/skill-bands';
import { useI18n } from '@/lib/i18n';
import { Court, Font, Radius, Space } from '@/constants/badminton-theme';
import { EventCard } from '@/components/event-card';
import { ActionButton } from '@/components/action-button';
import { Pill } from '@/components/pill';
import { CreditPill } from '@/components/credit-pill';
import { SkillBandSelector } from '@/components/skill-band-selector';
import { SectionDivider } from '@/components/section-divider';
import { AttendeeRoster, FellowParticipants, RatingRow } from '@/components/attendee-roster';

export default function ProfileScreen() {
  const { t } = useI18n();
  const { session, signOut } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [myEvents, setMyEvents] = useState<EventListItem[]>([]);
  const [attendingEvents, setAttendingEvents] = useState<AttendingEvent[]>([]);
  const [rostersByEventId, setRostersByEventId] = useState<Record<string, Attendee[]>>({});
  const [creditsByUserId, setCreditsByUserId] = useState<Record<string, Credit>>({});
  const [myRatingsByEventId, setMyRatingsByEventId] = useState<Record<string, Record<string, number>>>({});
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

  // Only the very first load (per mount) shows the full-screen spinner -
  // refocusing this tab afterward (e.g. switching back from Discover)
  // refetches quietly, so the screen doesn't blank out on every visit.
  const hasLoadedOnceRef = useRef(false);
  const loadProfile = useCallback(async () => {
    if (!session) return;
    const isFirstLoad = !hasLoadedOnceRef.current;
    if (isFirstLoad) setLoading(true);

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
    setRostersByEventId(summary.rostersByEventId);
    setCreditsByUserId(summary.creditsByUserId);
    setMyRatingsByEventId(summary.myRatingsByEventId);

    hasLoadedOnceRef.current = true;
    if (isFirstLoad) setLoading(false);
  }, [session]);

  // Single source of truth for "my rating of this person for this event" -
  // shared by the host-rating control and every roster row, replacing what
  // used to be separate optimistic-update-and-revert logic duplicated in
  // three different self-fetching components.
  async function handleRate(eventId: string, raterId: string, rateeId: string, score: number) {
    const previous = myRatingsByEventId[eventId]?.[rateeId] ?? 0;
    setMyRatingsByEventId((prev) => ({ ...prev, [eventId]: { ...prev[eventId], [rateeId]: score } }));
    try {
      await submitRating(supabase, { eventId, raterId, rateeId, score });
    } catch (err) {
      setMyRatingsByEventId((prev) => ({ ...prev, [eventId]: { ...prev[eventId], [rateeId]: previous } }));
      throw err;
    }
  }

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
      setSignOutError(err instanceof Error ? err.message : t('profile.signOutFailed'));
    }
  }

  async function handleSaveProfile() {
    if (!session) return;
    setSaveError(null);
    setSaveSuccess(false);

    const trimmedName = displayNameText.trim();
    if (!trimmedName) {
      setSaveError(t('profile.displayNameRequired'));
      return;
    }

    setSavingProfile(true);
    try {
      const band = skillBandId ? SKILL_BANDS.find((b) => b.id === skillBandId) : null;
      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: trimmedName,
          skill_level: band ? band.min : null,
        })
        .eq('id', session.user.id);
      if (error) throw error;
      // Separate table (see 20260726120000_profile_contact_visibility.sql) -
      // upsert rather than update, since a freshly-created profile has no
      // profile_contact row yet.
      const { error: contactError } = await supabase.from('profile_contact').upsert({
        id: session.user.id,
        bio: bioText.trim() || null,
        contact_info: contactInfoText.trim() || null,
      });
      if (contactError) throw contactError;
      setProfile((prev) => (prev ? { ...prev, display_name: trimmedName } : prev));
      setSaveSuccess(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t('profile.couldNotSaveProfile'));
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleRemoveOutdated(event: EventListItem) {
    setRemoveError(null);
    setRemovingEventId(event.id);
    try {
      await selectOrThrow(
        supabase.from('events').delete().eq('id', event.id).select('id'),
        t('profile.eventAlreadyRemoved')
      );
      setMyEvents((prev) => prev.filter((e) => e.id !== event.id));
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : t('profile.couldNotRemoveEvent'));
    } finally {
      setRemovingEventId(null);
    }
  }

  async function handleLeaveEvent(event: EventListItem) {
    if (!session) return;
    setLeaveError(null);
    setLeavingEventId(event.id);
    try {
      await selectOrThrow(
        supabase
          .from('event_participants')
          .delete()
          .eq('event_id', event.id)
          .eq('user_id', session.user.id)
          .select('user_id'),
        t('profile.alreadyLeftEvent')
      );
      setAttendingEvents((prev) => prev.filter((e) => e.id !== event.id));
    } catch (err) {
      setLeaveError(err instanceof Error ? err.message : t('profile.couldNotLeaveEvent'));
    } finally {
      setLeavingEventId(null);
    }
  }

  // The actual accept/decline mutation lives in useParticipantDecision (see
  // src/lib/participant-decisions.ts, used inside AttendeeRoster) - this is
  // just the screen-level resync once it succeeds: flip the row's status in
  // place (pill flips, decision buttons disappear) and, only on acceptance,
  // resync that event's displayed player count from the roster we just
  // updated - see ACTIVE_PARTICIPANT_STATUSES in src/lib/events.ts. Player
  // count and rosters are shared across every event on this screen, which is
  // why this lives here rather than inside the hook.
  function handleDecided(eventId: string, userId: string, status: ParticipantDecisionStatus) {
    const nextRoster = (rostersByEventId[eventId] ?? []).map((row) => (row.user_id === userId ? { ...row, status } : row));
    setRostersByEventId((prev) => ({ ...prev, [eventId]: nextRoster }));
    if (status === 'accepted') {
      const activeRows = nextRoster
        .filter((row) => (ACTIVE_PARTICIPANT_STATUSES as readonly string[]).includes(row.status))
        .map((row) => ({ event_id: eventId }));
      setParticipantCounts((prev) => ({ ...prev, ...computePlayerCounts([eventId], activeRows) }));
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.topRow}>
        <Text style={styles.pageTitle}>{t('profile.pageTitle')}</Text>
        <View style={styles.userCorner}>
          <View style={styles.userCornerTop}>
            <View style={styles.avatarSmall}>
              <Text style={styles.avatarEmojiSmall}>🏸</Text>
            </View>
            <Text style={styles.nameSmall} numberOfLines={1}>
              {profile?.display_name ?? session?.user.email ?? t('profile.playerFallback')}
            </Text>
          </View>
          <Pressable onPress={handleSignOut} hitSlop={8}>
            <Text style={styles.signOutLink}>{t('profile.signOut')}</Text>
          </Pressable>
        </View>
      </View>
      {signOutError && <Text style={styles.error}>{signOutError}</Text>}
      <SectionDivider />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('profile.sectionMyProfile')}</Text>

        <View style={styles.creditRow}>
          <Text style={styles.label}>{t('profile.creditLabel')}</Text>
          <CreditPill credit={session ? creditsByUserId[session.user.id] : undefined} />
        </View>

        <Text style={styles.label}>{t('profile.displayNameLabel')}</Text>
        <TextInput
          style={styles.input}
          value={displayNameText}
          onChangeText={setDisplayNameText}
          placeholder={t('profile.displayNamePlaceholder')}
          placeholderTextColor={Court.inkSecondary}
        />

        <Text style={styles.label}>{t('profile.skillLevelLabel')}</Text>
        <SkillBandSelector selectedId={skillBandId} onSelect={setSkillBandId} />

        <Text style={styles.label}>{t('profile.aboutMeLabel')}</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={bioText}
          onChangeText={setBioText}
          placeholder={t('profile.aboutMePlaceholder')}
          placeholderTextColor={Court.inkSecondary}
          multiline
        />

        <Text style={styles.label}>{t('profile.contactInfoLabel')}</Text>
        <TextInput
          style={styles.input}
          value={contactInfoText}
          onChangeText={setContactInfoText}
          placeholder={t('profile.contactInfoPlaceholder')}
          placeholderTextColor={Court.inkSecondary}
        />

        <ActionButton
          label={savingProfile ? t('profile.saving') : t('profile.saveProfile')}
          onPress={handleSaveProfile}
          loading={savingProfile}
          style={styles.saveButton}
        />
        {saveError && <Text style={styles.error}>{saveError}</Text>}
        {saveSuccess && !saveError && <Text style={styles.success}>{t('profile.profileSaved')}</Text>}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('profile.sectionGamesPlaying')}</Text>
        <SectionDivider />
        {loading && <ActivityIndicator color={Court.green} />}
        {!loading && !loadError && attendingEvents.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🏸</Text>
            <Text style={styles.emptyTitle}>{t('profile.noGamesJoinedTitle')}</Text>
            <Text style={styles.emptySubtext}>{t('profile.noGamesJoinedSubtext')}</Text>
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
                        label={t('profile.leaveEvent')}
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
                  <Text style={styles.organizerLabel}>{t('profile.organizedBy', { name: event.organizer.display_name })}</Text>
                  <View style={styles.pillRowSmall}>
                    {event.organizer.skill_level != null && (
                      <Pill label={t(`skillBands.${bandForLevel(event.organizer.skill_level).id}`)} tone="green" />
                    )}
                    <CreditPill credit={creditsByUserId[event.organizer_id]} />
                    {event.organizer.contact_info && <Pill label={event.organizer.contact_info} tone="feather" />}
                  </View>
                  <RatingRow
                    value={myRatingsByEventId[event.id]?.[event.organizer_id] ?? 0}
                    canRate={isPastEvent(event)}
                    onRate={(score) => handleRate(event.id, session.user.id, event.organizer_id, score)}
                  />
                </View>
              )}
              {session && (
                <FellowParticipants
                  attendees={rostersByEventId[event.id] ?? []}
                  currentUserId={session.user.id}
                  canRate={isPastEvent(event)}
                  credits={creditsByUserId}
                  myRatings={myRatingsByEventId[event.id] ?? {}}
                  onRate={(rateeId, score) => handleRate(event.id, session.user.id, rateeId, score)}
                />
              )}
            </View>
          ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('profile.sectionMyEvents')}</Text>
        <SectionDivider />
        {loading && <ActivityIndicator color={Court.green} />}
        {!loading && loadError && <Text style={styles.error}>{loadError}</Text>}
        {!loading && !loadError && myEvents.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🏸</Text>
            <Text style={styles.emptyTitle}>{t('profile.noGamesOrganizedTitle')}</Text>
            <Text style={styles.emptySubtext}>{t('profile.noGamesOrganizedSubtext')}</Text>
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
                        label={t('profile.removeOutdatedEvent')}
                        onPress={() => handleRemoveOutdated(event)}
                        variant="danger"
                        loading={removingEventId === event.id}
                      />
                    ) : (
                      <Text style={styles.upcomingLabel}>{t('profile.upcoming')}</Text>
                    )
                  }
                />
              </Pressable>
              {session && (
                <AttendeeRoster
                  eventId={event.id}
                  attendees={rostersByEventId[event.id] ?? []}
                  canRate={isPastEvent(event)}
                  credits={creditsByUserId}
                  myRatings={myRatingsByEventId[event.id] ?? {}}
                  onRate={(rateeId, score) => handleRate(event.id, session.user.id, rateeId, score)}
                  onDecided={(userId, status) => handleDecided(event.id, userId, status)}
                />
              )}
            </View>
          ))}
      </View>
    </ScrollView>
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
  creditRow: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
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
});
