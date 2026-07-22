// src/app/(tabs)/index.tsx
import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import * as Location from 'expo-location';
import { Picker } from '@expo/ui/community/picker';
import { supabase } from '@/lib/supabase';
import { EventListItem, type DiscoverEvent } from '@/components/event-list-item';

const RADIUS_OPTIONS_KM = [5, 10, 20, 50] as const;
const DEFAULT_RADIUS_KM = 50;

export default function DiscoverScreen() {
  const [events, setEvents] = useState<DiscoverEvent[] | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [locationEnabled, setLocationEnabled] = useState(false);
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM);
  const [enablingLocation, setEnablingLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  async function fetchWithLocation(km: number) {
    const requestId = ++requestIdRef.current;
    setEvents(null);
    setFetchError(null);
    try {
      const position = await Location.getCurrentPositionAsync();
      const { data, error } = await supabase.rpc('discover_events', {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        radius_meters: km * 1000,
      });
      if (requestId !== requestIdRef.current) return;
      if (error) throw error;
      setEvents(data ?? []);
      setLocationEnabled(true);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setLocationError(err instanceof Error ? err.message : 'Could not get current location.');
      setLocationEnabled(false);
      await fetchWithoutLocation();
    }
  }

  async function fetchWithoutLocation() {
    const requestId = ++requestIdRef.current;
    setEvents(null);
    setFetchError(null);
    const { data, error } = await supabase.rpc('discover_events', {});
    if (requestId !== requestIdRef.current) return;
    if (error) setFetchError(error.message);
    else setEvents(data ?? []);
  }

  useEffect(() => {
    Location.getForegroundPermissionsAsync().then((permission) => {
      if (permission.granted) fetchWithLocation(DEFAULT_RADIUS_KM);
      else fetchWithoutLocation();
    });
  }, []);

  async function handleEnableLocation() {
    setLocationError(null);
    setEnablingLocation(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setLocationError('Location permission is required to filter by distance.');
        return;
      }
      await fetchWithLocation(radiusKm);
    } catch (err) {
      setLocationError(err instanceof Error ? err.message : 'Could not get current location.');
    } finally {
      setEnablingLocation(false);
    }
  }

  function handleRadiusChange(value: string) {
    const km = Number(value);
    setRadiusKm(km);
    fetchWithLocation(km);
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Discover</Text>

      {!locationEnabled && (
        <View style={styles.locationBanner}>
          <Text style={styles.locationBannerText}>Enable location to filter by distance</Text>
          <Pressable style={styles.enableButton} onPress={handleEnableLocation} disabled={enablingLocation}>
            <Text style={styles.enableButtonText}>{enablingLocation ? 'Enabling...' : 'Enable'}</Text>
          </Pressable>
          {locationError && (
            <View>
              <Text style={styles.error}>{locationError}</Text>
              <Pressable onPress={handleEnableLocation}>
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}

      {locationEnabled && (
        <View style={styles.distanceFilter}>
          <Text style={styles.label}>Max distance</Text>
          <Picker selectedValue={String(radiusKm)} onValueChange={handleRadiusChange}>
            {RADIUS_OPTIONS_KM.map((km) => (
              <Picker.Item key={km} label={`${km} km`} value={String(km)} />
            ))}
          </Picker>
        </View>
      )}

      {events === null && !fetchError && <ActivityIndicator style={styles.spinner} />}
      {fetchError && <Text style={styles.error}>{fetchError}</Text>}
      {events !== null && events.length === 0 && <Text style={styles.emptyText}>No upcoming events</Text>}
      {events !== null && events.map((event) => <EventListItem key={event.id} event={event} />)}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 4 },
  title: { fontSize: 24, fontWeight: '600', marginBottom: 12 },
  label: { fontWeight: '600' },
  locationBanner: { backgroundColor: '#eaf4ff', borderRadius: 8, padding: 12, gap: 8, marginBottom: 12 },
  locationBannerText: { color: '#333' },
  enableButton: { backgroundColor: '#208AEF', padding: 10, borderRadius: 8, alignItems: 'center' },
  enableButtonText: { color: '#fff', fontWeight: '600' },
  distanceFilter: { marginBottom: 12 },
  spinner: { marginTop: 24 },
  emptyText: { color: '#666', marginTop: 24, textAlign: 'center' },
  error: { color: 'red', marginTop: 8 },
  retryText: { color: '#208AEF' },
});
