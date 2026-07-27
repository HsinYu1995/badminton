import { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet } from 'react-native';
import * as Location from 'expo-location';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';

export type Venue = {
  id: string;
  name: string;
  address: string;
};

type VenuePickerProps = {
  selectedVenueId: string | null;
  onSelect: (venue: Venue) => void;
};

export function VenuePicker({ selectedVenueId, onSelect }: VenuePickerProps) {
  const { session } = useAuth();
  const { t } = useI18n();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showNewVenueForm, setShowNewVenueForm] = useState(false);
  const [newVenueName, setNewVenueName] = useState('');
  const [newVenueAddress, setNewVenueAddress] = useState('');
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locatingInProgress, setLocatingInProgress] = useState(false);
  const [savingVenue, setSavingVenue] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('venues')
      .select('id, name, address')
      .order('name')
      .then(({ data, error }) => {
        if (error) setLoadError(error.message);
        else setVenues(data ?? []);
        setLoading(false);
      });
  }, []);

  async function handleUseCurrentLocation() {
    setLocationError(null);
    setLocatingInProgress(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setLocationError(t('venuePicker.locationPermissionRequired'));
        return;
      }
      const position = await Location.getCurrentPositionAsync();
      setCoords({ latitude: position.coords.latitude, longitude: position.coords.longitude });
    } catch (err) {
      setLocationError(err instanceof Error ? err.message : t('venuePicker.couldNotGetLocation'));
    } finally {
      setLocatingInProgress(false);
    }
  }

  async function handleSaveVenue() {
    if (!session || !coords || !newVenueName.trim() || !newVenueAddress.trim()) return;
    setSavingVenue(true);
    setSaveError(null);
    try {
      const { data, error } = await supabase
        .from('venues')
        .insert({
          name: newVenueName.trim(),
          address: newVenueAddress.trim(),
          location: `SRID=4326;POINT(${coords.longitude} ${coords.latitude})`,
          created_by: session.user.id,
        })
        .select('id, name, address')
        .single();
      if (error) throw error;
      setVenues((prev) => [...prev, data]);
      onSelect(data);
      setShowNewVenueForm(false);
      setNewVenueName('');
      setNewVenueAddress('');
      setCoords(null);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t('venuePicker.couldNotSaveVenue'));
    } finally {
      setSavingVenue(false);
    }
  }

  if (loading) return <ActivityIndicator />;
  if (loadError) return <Text style={styles.error}>{t('venuePicker.couldNotLoadVenues', { error: loadError })}</Text>;

  return (
    <View style={styles.container}>
      {venues.map((venue) => (
        <Pressable
          key={venue.id}
          style={[styles.venueRow, selectedVenueId === venue.id && styles.venueRowSelected]}
          onPress={() => onSelect(venue)}
        >
          <Text style={styles.venueName}>{venue.name}</Text>
          <Text style={styles.venueAddress}>{venue.address}</Text>
        </Pressable>
      ))}

      {!showNewVenueForm && (
        <Pressable style={styles.addVenueRow} onPress={() => setShowNewVenueForm(true)}>
          <Text style={styles.addVenueText}>{t('venuePicker.addNewVenue')}</Text>
        </Pressable>
      )}

      {showNewVenueForm && (
        <View style={styles.newVenueForm}>
          <TextInput
            style={styles.input}
            placeholder={t('venuePicker.venueNamePlaceholder')}
            value={newVenueName}
            onChangeText={setNewVenueName}
          />
          <TextInput
            style={styles.input}
            placeholder={t('venuePicker.addressPlaceholder')}
            value={newVenueAddress}
            onChangeText={setNewVenueAddress}
          />
          <Pressable style={styles.locationButton} onPress={handleUseCurrentLocation} disabled={locatingInProgress}>
            <Text style={styles.locationButtonText}>
              {locatingInProgress ? t('venuePicker.gettingLocation') : coords ? t('venuePicker.locationCaptured') : t('venuePicker.useCurrentLocation')}
            </Text>
          </Pressable>
          {locationError && (
            <View>
              <Text style={styles.error}>{locationError}</Text>
              <Pressable onPress={handleUseCurrentLocation}>
                <Text style={styles.retryText}>{t('venuePicker.retry')}</Text>
              </Pressable>
            </View>
          )}
          <Pressable
            style={styles.saveButton}
            disabled={!coords || !newVenueName.trim() || !newVenueAddress.trim() || savingVenue}
            onPress={handleSaveVenue}
          >
            <Text style={styles.saveButtonText}>{savingVenue ? t('venuePicker.saving') : t('venuePicker.saveVenue')}</Text>
          </Pressable>
          {saveError && <Text style={styles.error}>{saveError}</Text>}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  venueRow: { padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#ddd' },
  venueRowSelected: { borderColor: '#208AEF', backgroundColor: '#eaf4ff' },
  venueName: { fontWeight: '600' },
  venueAddress: { color: '#666' },
  addVenueRow: { padding: 12 },
  addVenueText: { color: '#208AEF', fontWeight: '600' },
  newVenueForm: { gap: 8, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#ddd' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 8 },
  locationButton: { backgroundColor: '#208AEF', padding: 10, borderRadius: 8, alignItems: 'center' },
  locationButtonText: { color: '#fff', fontWeight: '600' },
  saveButton: { backgroundColor: '#22c55e', padding: 10, borderRadius: 8, alignItems: 'center' },
  saveButtonText: { color: '#fff', fontWeight: '600' },
  error: { color: 'red' },
  retryText: { color: '#208AEF' },
});
