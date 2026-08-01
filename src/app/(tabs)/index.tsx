import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { View, Text, FlatList, ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import * as Location from 'expo-location';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { ACTIVE_PARTICIPANT_STATUSES, computePlayerCounts, type EventListItem } from '@/lib/events';
import { selectOrThrow } from '@/lib/mutations';
import { DISCOVER_PAGE_SIZE, fetchDiscoverPage, type Coordinates } from '@/lib/discover-events';
import { Court, Font, Space } from '@/constants/badminton-theme';
import { useI18n, pluralize } from '@/lib/i18n';
import { EventCard } from '@/components/event-card';
import { SearchBar } from '@/components/search-bar';
import { ActionButton } from '@/components/action-button';
import { SectionDivider } from '@/components/section-divider';

type ParticipantStatus = 'pending' | 'accepted' | 'declined';

export default function DiscoverScreen() {
  const { t, locale } = useI18n();
  const { session, signOut } = useAuth();
  const router = useRouter();
  const [coords, setCoords] = useState<Coordinates>(null);
  const [events, setEvents] = useState<EventListItem[]>([]);
  const [distances, setDistances] = useState<Record<string, number | null>>({});
  const [myRequests, setMyRequests] = useState<Record<string, ParticipantStatus>>({});
  const [participantCounts, setParticipantCounts] = useState<Record<string, number>>({});
  // Always mirrors participantCounts - read at the top of loadEvents/
  // handleLoadMore (before the next fetch overwrites it) so the
  // filled-since-you-applied diff below compares against the truly latest
  // counts rather than a stale closure from whenever the callback was built.
  const participantCountsRef = useRef<Record<string, number>>({});
  // How many *more* people have been accepted, per event, since the last
  // time this screen saw that event's count, for events where the viewer's
  // own request is still pending - see notePendingSpotsFilled. Cleared once
  // the viewer's own request resolves (accepted/declined) or disappears.
  const [filledSinceApplied, setFilledSinceApplied] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [joiningEventId, setJoiningEventId] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [cancelingEventId, setCancelingEventId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [guestExitError, setGuestExitError] = useState<string | null>(null);

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

  async function loadParticipantCounts(eventIds: string[]): Promise<Record<string, number>> {
    if (eventIds.length === 0) return {};
    const { data } = await supabase
      .from('event_participants')
      .select('event_id, status')
      .in('event_id', eventIds)
      .in('status', ACTIVE_PARTICIPANT_STATUSES);
    const counts = computePlayerCounts(eventIds, data ?? []);
    setParticipantCounts((prev) => {
      const merged = { ...prev, ...counts };
      participantCountsRef.current = merged;
      return merged;
    });
    return counts;
  }

  async function loadMyRequests(): Promise<Record<string, ParticipantStatus>> {
    if (!session) return {};
    const { data } = await supabase.from('event_participants').select('event_id, status').eq('user_id', session.user.id);
    const map: Record<string, ParticipantStatus> = {};
    for (const row of data ?? []) {
      map[row.event_id] = row.status;
    }
    setMyRequests(map);
    return map;
  }

  // Compares the counts fetched *before* this refresh against the ones just
  // fetched, for every event the viewer currently has a pending request on -
  // if it went up, the organizer accepted someone else while the viewer was
  // still waiting. Accumulates rather than resetting each refresh, since the
  // underlying fact ("N people got in ahead of you") stays true until your
  // own request resolves one way or the other. Not a push notification -
  // this only updates when Discover itself refetches (on focus, or the next
  // page load), same as every other piece of state on this screen.
  function notePendingSpotsFilled(
    previousCounts: Record<string, number>,
    newCounts: Record<string, number>,
    newRequests: Record<string, ParticipantStatus>
  ) {
    setFilledSinceApplied((prev) => {
      const next: Record<string, number> = {};
      for (const [eventId, status] of Object.entries(newRequests)) {
        if (status !== 'pending') continue;
        const before = previousCounts[eventId];
        const after = newCounts[eventId];
        const increase = before != null && after != null && after > before ? after - before : 0;
        const total = (prev[eventId] ?? 0) + increase;
        if (total > 0) next[eventId] = total;
      }
      return next;
    });
  }

  // Fetches the first page (top 10) fresh - called on every screen focus,
  // same as the previous single-fetch design. Only the very first load (per
  // mount) shows the full-screen spinner and blanks the list - refocusing
  // the tab afterward refetches quietly in the background so switching back
  // to Discover doesn't feel like a fresh, slow load every time.
  const hasLoadedOnceRef = useRef(false);
  const loadEvents = useCallback(async () => {
    const isFirstLoad = !hasLoadedOnceRef.current;
    if (isFirstLoad) setLoading(true);
    setError(null);
    const previousCounts = participantCountsRef.current;
    try {
      const { items, hasMore: more } = await fetchDiscoverPage(supabase, coords, 0);
      setEvents(items.map((item) => item.event));
      setDistances(Object.fromEntries(items.map((item) => [item.event.id, item.distanceMeters])));
      setHasMore(more);
      const [newCounts, newRequests] = await Promise.all([
        loadParticipantCounts(items.map((item) => item.event.id)),
        loadMyRequests(),
      ]);
      notePendingSpotsFilled(previousCounts, newCounts, newRequests);
      hasLoadedOnceRef.current = true;
    } catch (err) {
      setError(err instanceof Error ? err.message : t('discover.couldNotLoadEvents'));
    } finally {
      if (isFirstLoad) setLoading(false);
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
    const previousCounts = participantCountsRef.current;
    try {
      const { items, hasMore: more } = await fetchDiscoverPage(supabase, coords, events.length);
      setEvents((prev) => [...prev, ...items.map((item) => item.event)]);
      setDistances((prev) => ({ ...prev, ...Object.fromEntries(items.map((item) => [item.event.id, item.distanceMeters])) }));
      setHasMore(more);
      const [newCounts, newRequests] = await Promise.all([
        loadParticipantCounts(items.map((item) => item.event.id)),
        loadMyRequests(),
      ]);
      notePendingSpotsFilled(previousCounts, newCounts, newRequests);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('discover.couldNotLoadMoreEvents'));
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
      setJoinError(err instanceof Error ? err.message : t('discover.couldNotJoin'));
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
      await selectOrThrow(
        supabase.from('event_participants').delete().eq('event_id', event.id).eq('user_id', session.user.id).select('user_id'),
        t('discover.requestAlreadyWithdrawn')
      );
      // Removing the row entirely (not marking it 'declined') lets the
      // organizer see "Join" again immediately, so a cancelled request can
      // be sent again later.
      setMyRequests((prev) => {
        const next = { ...prev };
        delete next[event.id];
        return next;
      });
      setFilledSinceApplied((prev) => {
        const next = { ...prev };
        delete next[event.id];
        return next;
      });
      // A still-pending request was never counted, so cancelling it doesn't
      // change the count. Only losing an accepted spot frees one up -
      // re-fetched from computePlayerCounts's source of truth rather than
      // hand-decremented, so this never drifts from how the count is
      // computed everywhere else.
      if (wasAccepted) {
        await loadParticipantCounts([event.id]);
      }
    } catch (err) {
      setCancelError(err instanceof Error ? err.message : t('discover.couldNotCancel'));
    } finally {
      setCancelingEventId(null);
    }
  }

  async function handleGuestExit() {
    setGuestExitError(null);
    try {
      await signOut();
    } catch (err) {
      setGuestExitError(err instanceof Error ? err.message : t('discover.guestExitFailed'));
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
        <Text style={styles.title}>{t('discover.headerTitle')}</Text>
        <Text style={styles.subtitle}>{t('discover.subtitle')}</Text>
        {session?.user.is_anonymous && (
          <Pressable onPress={handleGuestExit} hitSlop={8}>
            <Text style={styles.guestExitLink}>{t('discover.guestExit')}</Text>
          </Pressable>
        )}
        {guestExitError && <Text style={styles.error}>{guestExitError}</Text>}
        <SectionDivider />
        <SearchBar value={query} onChangeText={setQuery} placeholder={t('discover.searchPlaceholder')} />
      </View>

      {loading && <ActivityIndicator style={styles.spinner} color={Court.green} />}
      {!loading && error && <Text style={styles.error}>{t('discover.connectionError', { error })}</Text>}

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
              <Text style={styles.emptyTitle}>{query ? t('discover.noMatchesTitle') : t('discover.noGamesTitle')}</Text>
              <Text style={styles.emptySubtext}>
                {query ? t('discover.noMatchesSubtext') : t('discover.noGamesSubtext')}
              </Text>
            </View>
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.spinner} color={Court.green} /> : null}
          renderItem={({ item: event }) => {
            const isOwnEvent = session?.user.id === event.organizer_id;
            const requestStatus = myRequests[event.id];
            return (
              <Pressable onPress={() => router.push({ pathname: '/event/[id]', params: { id: event.id } })}>
                <EventCard
                  event={event}
                  participantCount={participantCounts[event.id]}
                  distanceMeters={distances[event.id]}
                  action={
                    isOwnEvent ? (
                      <Text style={styles.ownEventLabel}>{t('discover.yourEvent')}</Text>
                    ) : requestStatus === 'accepted' ? (
                      <ActionButton
                        label={t('discover.leaveEvent')}
                        onPress={() => handleCancelRequest(event)}
                        variant="danger"
                        loading={cancelingEventId === event.id}
                      />
                    ) : requestStatus === 'pending' ? (
                      <View style={styles.pendingAction}>
                        {filledSinceApplied[event.id] > 0 && (
                          <Text style={styles.filledNotice}>
                            {t('discover.spotsFilledNotice', {
                              count: filledSinceApplied[event.id],
                              spot: pluralize(filledSinceApplied[event.id], 'spot', 'spots', locale),
                            })}
                          </Text>
                        )}
                        <ActionButton
                          label={t('discover.cancelRequest')}
                          onPress={() => handleCancelRequest(event)}
                          variant="outline"
                          loading={cancelingEventId === event.id}
                        />
                      </View>
                    ) : requestStatus === 'declined' ? (
                      // A declined row can be self-deleted by its requester (see
                      // participants_self_delete in 20260725064939_participants_self_delete.sql,
                      // exercised by tests/integration/participant-decision.test.mjs) - reusing
                      // handleCancelRequest here just removes the row, which brings the Join
                      // button back so they can send a fresh request.
                      <ActionButton
                        label={t('discover.requestAgain')}
                        onPress={() => handleCancelRequest(event)}
                        variant="outline"
                        loading={cancelingEventId === event.id}
                      />
                    ) : (
                      <ActionButton
                        label={t('discover.join')}
                        onPress={() => handleJoin(event)}
                        loading={joiningEventId === event.id}
                      />
                    )
                  }
                />
              </Pressable>
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
  guestExitLink: { fontFamily: Font.display, fontSize: 12, color: Court.danger },
  spinner: { marginTop: Space.xl },
  list: { padding: Space.lg, paddingTop: 0 },
  emptyState: { alignItems: 'center', marginTop: Space.xl, gap: 4 },
  emptyEmoji: { fontSize: 40, marginBottom: Space.xs },
  emptyTitle: { fontSize: 17, fontFamily: Font.display, color: Court.ink },
  emptySubtext: { color: Court.inkSecondary, textAlign: 'center' },
  error: { color: Court.danger, marginBottom: Space.sm },
  ownEventLabel: { color: Court.green, fontWeight: '700' },
  pendingAction: { alignItems: 'flex-end', gap: 4 },
  filledNotice: { fontSize: 12, color: Court.inkSecondary, textAlign: 'right', maxWidth: 160 },
});
