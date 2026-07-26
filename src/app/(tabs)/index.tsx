import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { View, Text, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import * as Location from 'expo-location';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { ACTIVE_PARTICIPANT_STATUSES, computePlayerCounts, type EventListItem } from '@/lib/events';
import { DISCOVER_PAGE_SIZE, fetchDiscoverPage, type Coordinates } from '@/lib/discover-events';
import { Court, Font, Space } from '@/constants/badminton-theme';
import { EventCard } from '@/components/event-card';
import { SearchBar } from '@/components/search-bar';
import { ActionButton } from '@/components/action-button';
import { SectionDivider } from '@/components/section-divider';

type ParticipantStatus = 'pending' | 'accepted' | 'declined';

export default function DiscoverScreen() {
  const { session } = useAuth();
  const [coords, setCoords] = useState<Coordinates>(null);
  const [events, setEvents] = useState<EventListItem[]>([]);
  const [distances, setDistances] = useState<Record<string, number | null>>({});
  const [myRequests, setMyRequests] = useState<Record<string, ParticipantStatus>>({});
  const [participantCounts, setParticipantCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [joiningEventId, setJoiningEventId] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [cancelingEventId, setCancelingEventId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Best-effort, once per mount - a declined/unavailable location just
  // means every distance_meters comes back null (time-only sort), never
  // an error surfaced to the user.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted) return;
        const position = await Location.getCurrentPositionAsync();
        if (!cancelled) setCoords({ latitude: position.coords.latitude, longitude: position.coords.longitude });
      } catch {
        // No location available - Discover still works, just without distance.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadParticipantCounts(eventIds: string[]) {
    if (eventIds.length === 0) return;
    const { data } = await supabase
      .from('event_participants')
      .select('event_id, status')
      .in('event_id', eventIds)
      .in('status', ACTIVE_PARTICIPANT_STATUSES);
    setParticipantCounts((prev) => ({ ...prev, ...computePlayerCounts(eventIds, data ?? []) }));
  }

  async function loadMyRequests() {
    if (!session) return;
    const { data } = await supabase.from('event_participants').select('event_id, status').eq('user_id', session.user.id);
    const map: Record<string, ParticipantStatus> = {};
    for (const row of data ?? []) {
      map[row.event_id] = row.status;
    }
    setMyRequests(map);
  }

  // Fetches the first page (top 10) fresh - called on every screen focus,
  // same as the previous single-fetch design.
  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { items, hasMore: more } = await fetchDiscoverPage(supabase, coords, 0);
      setEvents(items.map((item) => item.event));
      setDistances(Object.fromEntries(items.map((item) => [item.event.id, item.distanceMeters])));
      setHasMore(more);
      await Promise.all([loadParticipantCounts(items.map((item) => item.event.id)), loadMyRequests()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load events.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords, session]);

  useFocusEffect(
    useCallback(() => {
      loadEvents();
    }, [loadEvents])
  );

  // Infinite scroll: fetches the next 10 while the user scrolls, appending
  // rather than replacing. A short page (fewer than 10 rows) means there's
  // nothing left, so hasMore latches false and further calls no-op.
  const handleLoadMore = useCallback(async () => {
    if (!hasMore || loadingMore || loading) return;
    setLoadingMore(true);
    try {
      const { items, hasMore: more } = await fetchDiscoverPage(supabase, coords, events.length);
      setEvents((prev) => [...prev, ...items.map((item) => item.event)]);
      setDistances((prev) => ({ ...prev, ...Object.fromEntries(items.map((item) => [item.event.id, item.distanceMeters])) }));
      setHasMore(more);
      await Promise.all([loadParticipantCounts(items.map((item) => item.event.id)), loadMyRequests()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load more events.');
    } finally {
      setLoadingMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords, events.length, hasMore, loadingMore, loading, session]);

  async function handleJoin(event: EventListItem) {
    if (!session) return;
    setJoinError(null);
    setJoiningEventId(event.id);
    try {
      const { error: joinErr } = await supabase
        .from('event_participants')
        .insert({ event_id: event.id, user_id: session.user.id, status: 'pending' });
      if (joinErr) throw joinErr;
      // A pending request doesn't occupy a spot until the organizer accepts
      // it - see ACTIVE_PARTICIPANT_STATUSES - so the player count doesn't
      // move here.
      setMyRequests((prev) => ({ ...prev, [event.id]: 'pending' }));
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : 'Could not join event.');
    } finally {
      setJoiningEventId(null);
    }
  }

  async function handleCancelRequest(event: EventListItem) {
    if (!session) return;
    setCancelError(null);
    setCancelingEventId(event.id);
    const wasAccepted = myRequests[event.id] === 'accepted';
    try {
      const { error: cancelErr } = await supabase
        .from('event_participants')
        .delete()
        .eq('event_id', event.id)
        .eq('user_id', session.user.id);
      if (cancelErr) throw cancelErr;
      // Removing the row entirely (not marking it 'declined') lets the
      // organizer see "Join" again immediately, so a cancelled request can
      // be sent again later.
      setMyRequests((prev) => {
        const next = { ...prev };
        delete next[event.id];
        return next;
      });
      // A still-pending request was never counted, so cancelling it doesn't
      // change the count. Only losing an accepted spot frees one up - floor
      // at 1, not 0, since the organizer is always still there.
      if (wasAccepted) {
        setParticipantCounts((prev) => ({ ...prev, [event.id]: Math.max((prev[event.id] ?? 1) - 1, 1) }));
      }
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : 'Could not cancel request.');
    } finally {
      setCancelingEventId(null);
    }
  }

  // Search filters over whatever's currently loaded - it doesn't trigger a
  // fresh server search or auto-load further pages to find a match further
  // down the list (see the design doc's "Search stays client-side" note).
  const visibleEvents = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return events;
    return events.filter(
      (event) => event.title.toLowerCase().includes(needle) || (event.venues?.name ?? '').toLowerCase().includes(needle)
    );
  }, [events, query]);

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
        <FlatList
          testID="discover-list"
          data={visibleEvents}
          keyExtractor={(event) => event.id}
          contentContainerStyle={styles.list}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          initialNumToRender={DISCOVER_PAGE_SIZE * 2}
          ListHeaderComponent={
            <>
              {joinError && <Text style={styles.error}>{joinError}</Text>}
              {cancelError && <Text style={styles.error}>{cancelError}</Text>}
            </>
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>{query ? '🔍' : '🏸'}</Text>
              <Text style={styles.emptyTitle}>{query ? 'No matches' : 'No games yet'}</Text>
              <Text style={styles.emptySubtext}>
                {query ? 'Try a different title or venue.' : 'Be the first to host a pickup game today.'}
              </Text>
            </View>
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.spinner} color={Court.green} /> : null}
          renderItem={({ item: event }) => {
            const isOwnEvent = session?.user.id === event.organizer_id;
            const requestStatus = myRequests[event.id];
            return (
              <EventCard
                event={event}
                participantCount={participantCounts[event.id]}
                distanceMeters={distances[event.id]}
                action={
                  isOwnEvent ? (
                    <Text style={styles.ownEventLabel}>Your event</Text>
                  ) : requestStatus === 'accepted' ? (
                    <ActionButton
                      label="Leave event"
                      onPress={() => handleCancelRequest(event)}
                      variant="danger"
                      loading={cancelingEventId === event.id}
                    />
                  ) : requestStatus === 'pending' ? (
                    <ActionButton
                      label="Cancel request"
                      onPress={() => handleCancelRequest(event)}
                      variant="outline"
                      loading={cancelingEventId === event.id}
                    />
                  ) : requestStatus === 'declined' ? (
                    <ActionButton label="Declined" onPress={() => {}} variant="muted" disabled />
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
          }}
        />
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
