import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { ACTIVE_PARTICIPANT_STATUSES, isPastEvent, type EventListItem } from '@/lib/events';
import { bandForLevel, SKILL_BANDS, type SkillBandId } from '@/lib/skill-bands';
import { Court, Font, Radius, Space } from '@/constants/badminton-theme';
import { EventCard } from '@/components/event-card';
import { ActionButton } from '@/components/action-button';
import { SkillBandSelector } from '@/components/skill-band-selector';
import { SectionDivider } from '@/components/section-divider';

const EVENT_COLUMNS = 'id, organizer_id, title, start_time, end_time, headcount_max, skill_min, skill_max, fee, venues(name)';

type ProfileRow = {
  display_name: string;
  skill_level: number | null;
  bio: string | null;
  contact_info: string | null;
};

export default function ProfileScreen() {
  const { session, signOut } = useAuth();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [myEvents, setMyEvents] = useState<EventListItem[]>([]);
  const [participantCounts, setParticipantCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [removingEventId, setRemovingEventId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

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
    setLoadError(null);

    const [{ data: profileData, error: profileErr }, { data: eventsData, error: eventsErr }] = await Promise.all([
      supabase.from('profiles').select('display_name, skill_level, bio, contact_info').eq('id', session.user.id).single(),
      supabase.from('events').select(EVENT_COLUMNS).eq('organizer_id', session.user.id).order('start_time'),
    ]);

    if (profileErr) setLoadError(profileErr.message);
    else {
      setProfile(profileData);
      setDisplayNameText(profileData.display_name);
      setBioText(profileData.bio ?? '');
      setContactInfoText(profileData.contact_info ?? '');
      setSkillBandId(profileData.skill_level != null ? bandForLevel(profileData.skill_level).id : null);
    }

    if (eventsErr) setLoadError((prev) => prev ?? eventsErr.message);
    else {
      const loadedEvents = (eventsData as unknown as EventListItem[] | null) ?? [];
      setMyEvents(loadedEvents);

      const eventIds = loadedEvents.map((event) => event.id);
      if (eventIds.length > 0) {
        const { data: participantRows } = await supabase
          .from('event_participants')
          .select('event_id, status')
          .in('event_id', eventIds)
          .in('status', ACTIVE_PARTICIPANT_STATUSES);
        const counts: Record<string, number> = {};
        for (const row of participantRows ?? []) {
          counts[row.event_id] = (counts[row.event_id] ?? 0) + 1;
        }
        setParticipantCounts(counts);
      } else {
        setParticipantCounts({});
      }
    }

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
            <EventCard
              key={event.id}
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
});
