import { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { isPastEvent, type EventListItem } from '@/lib/events';
import { Court, Font, Space } from '@/constants/badminton-theme';
import { EventCard } from '@/components/event-card';
import { SearchBar } from '@/components/search-bar';
import { ActionButton } from '@/components/action-button';
import { SectionDivider } from '@/components/section-divider';

const EVENT_COLUMNS = 'id, organizer_id, title, start_time, end_time, headcount_max, skill_min, skill_max, fee, venues(name)';

type ParticipantStatus = 'pending' | 'accepted' | 'declined';

export default function DiscoverScreen() {
  const { session } = useAuth();
  const [events, setEvents] = useState<EventListItem[]>([]);
  const [myRequests, setMyRequests] = useState<Record<string, ParticipantStatus>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [joiningEventId, setJoiningEventId] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(null);

    const eventsQuery = supabase.from('events').select(EVENT_COLUMNS).order('start_time');
    const { data, error: eventsError } = await eventsQuery;
    if (eventsError) {
      setError(eventsError.message);
      setLoading(false);
      return;
    }
    setEvents((data as unknown as EventListItem[] | null) ?? []);

    try {
      if (session) {
        const { data: participantRows } = await supabase
          .from('event_participants')
          .select('event_id, status')
          .eq('user_id', session.user.id);
        const map: Record<string, ParticipantStatus> = {};
        for (const row of participantRows ?? []) {
          map[row.event_id] = row.status;
        }
        setMyRequests(map);
      }
    } finally {
      setLoading(false);
    }
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      loadEvents();
    }, [loadEvents])
  );

  async function handleJoin(event: EventListItem) {
    if (!session) return;
    setJoinError(null);
    setJoiningEventId(event.id);
    try {
      const { error: joinErr } = await supabase
        .from('event_participants')
        .insert({ event_id: event.id, user_id: session.user.id, status: 'pending' });
      if (joinErr) throw joinErr;
      setMyRequests((prev) => ({ ...prev, [event.id]: 'pending' }));
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Could not join event.');
    } finally {
      setJoiningEventId(null);
    }
  }

  const upcomingEvents = useMemo(() => events.filter((event) => !isPastEvent(event)), [events]);

  const visibleEvents = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return upcomingEvents;
    return upcomingEvents.filter(
      (event) => event.title.toLowerCase().includes(needle) || (event.venues?.name ?? '').toLowerCase().includes(needle)
    );
  }, [upcomingEvents, query]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>🏸 Discover</Text>
        <Text style={styles.subtitle}>Find a pickup game near you</Text>
        <SectionDivider />
        <SearchBar value={query} onChangeText={setQuery} placeholder="Search by title or venue" />
      </View>

      {loading && <ActivityIndicator style={styles.spinner} color={Court.green} />}
      {!loading && error && <Text style={styles.error}>Connection error: {error}</Text>}

      {!loading && !error && (
        <ScrollView contentContainerStyle={styles.list}>
          {visibleEvents.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>{query ? '🔍' : '🏸'}</Text>
              <Text style={styles.emptyTitle}>{query ? 'No matches' : 'No games yet'}</Text>
              <Text style={styles.emptySubtext}>
                {query ? 'Try a different title or venue.' : 'Be the first to host a pickup game today.'}
              </Text>
            </View>
          )}
          {joinError && <Text style={styles.error}>{joinError}</Text>}
          {visibleEvents.map((event) => {
            const isOwnEvent = session?.user.id === event.organizer_id;
            const requestStatus = myRequests[event.id];
            return (
              <EventCard
                key={event.id}
                event={event}
                action={
                  isOwnEvent ? (
                    <Text style={styles.ownEventLabel}>Your event</Text>
                  ) : requestStatus === 'accepted' ? (
                    <ActionButton label="Confirmed" onPress={() => {}} variant="muted" disabled />
                  ) : requestStatus === 'pending' ? (
                    <ActionButton label="Requested" onPress={() => {}} variant="outline" disabled />
                  ) : (
                    <ActionButton
                      label="Join"
                      onPress={() => handleJoin(event)}
                      loading={joiningEventId === event.id}
                    />
                  )
                }
              />
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Court.greenTint },
  header: { padding: Space.lg, gap: Space.sm, backgroundColor: Court.greenTint },
  title: { fontSize: 28, fontFamily: Font.displayBlack, color: Court.ink },
  subtitle: { color: Court.inkSecondary, marginBottom: Space.xs },
  spinner: { marginTop: Space.xl },
  list: { padding: Space.lg, paddingTop: 0 },
  emptyState: { alignItems: 'center', marginTop: Space.xl, gap: 4 },
  emptyEmoji: { fontSize: 40, marginBottom: Space.xs },
  emptyTitle: { fontSize: 17, fontFamily: Font.display, color: Court.ink },
  emptySubtext: { color: Court.inkSecondary, textAlign: 'center' },
  error: { color: Court.danger, marginBottom: Space.sm },
  ownEventLabel: { color: Court.green, fontWeight: '700' },
});
