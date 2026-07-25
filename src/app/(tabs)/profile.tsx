import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { isPastEvent, type EventListItem } from '@/lib/events';
import { bandForLevel } from '@/lib/skill-bands';
import { Court, Font, Space } from '@/constants/badminton-theme';
import { EventCard } from '@/components/event-card';
import { ActionButton } from '@/components/action-button';
import { Pill } from '@/components/pill';
import { SectionDivider } from '@/components/section-divider';

const EVENT_COLUMNS = 'id, organizer_id, title, start_time, end_time, headcount_max, skill_min, skill_max, fee, venues(name)';

type ProfileRow = {
  display_name: string;
  skill_level: number | null;
};

export default function ProfileScreen() {
  const { session, signOut } = useAuth();
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [myEvents, setMyEvents] = useState<EventListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [removingEventId, setRemovingEventId] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setLoadError(null);

    const [{ data: profileData, error: profileErr }, { data: eventsData, error: eventsErr }] = await Promise.all([
      supabase.from('profiles').select('display_name, skill_level').eq('id', session.user.id).single(),
      supabase.from('events').select(EVENT_COLUMNS).eq('organizer_id', session.user.id).order('start_time'),
    ]);

    if (profileErr) setLoadError(profileErr.message);
    else setProfile(profileData);

    if (eventsErr) setLoadError((prev) => prev ?? eventsErr.message);
    else setMyEvents((eventsData as unknown as EventListItem[] | null) ?? []);

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

  const band = profile?.skill_level != null ? bandForLevel(profile.skill_level) : null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarEmoji}>🏸</Text>
        </View>
        <Text style={styles.name}>{profile?.display_name ?? session?.user.email ?? 'Player'}</Text>
        <Pill label={band ? `${band.label} · Lv ${profile?.skill_level}` : 'Skill level not set'} tone={band ? 'green' : 'neutral'} />
        <ActionButton label="Sign out" onPress={handleSignOut} variant="danger" style={styles.signOutButton} />
        {signOutError && <Text style={styles.error}>{signOutError}</Text>}
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
  header: { alignItems: 'center', gap: Space.sm },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Court.shuttle,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Court.feather,
  },
  avatarEmoji: { fontSize: 32 },
  name: { fontSize: 22, fontFamily: Font.displayBlack, color: Court.ink },
  signOutButton: { marginTop: Space.sm },
  section: { gap: Space.sm },
  sectionTitle: { fontSize: 20, fontFamily: Font.displayBlack, color: Court.ink, marginBottom: 0 },
  emptyState: { alignItems: 'center', marginTop: Space.xl, gap: 4 },
  emptyEmoji: { fontSize: 40, marginBottom: Space.xs },
  emptyTitle: { fontSize: 17, fontFamily: Font.display, color: Court.ink },
  emptySubtext: { color: Court.inkSecondary, textAlign: 'center' },
  error: { color: Court.danger },
  upcomingLabel: { color: Court.green, fontWeight: '700' },
});
