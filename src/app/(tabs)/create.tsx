import { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { Picker } from '@expo/ui/community/picker';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { SKILL_BANDS, type SkillBandId } from '@/lib/skill-bands';
import { VenuePicker, type Venue } from '@/components/venue-picker';

function combineDateAndTime(date: Date, time: Date): Date {
  const combined = new Date(date);
  combined.setHours(time.getHours(), time.getMinutes(), 0, 0);
  return combined;
}

export default function CreateEventScreen() {
  const { session } = useAuth();
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [venue, setVenue] = useState<Venue | null>(null);
  const [headcountText, setHeadcountText] = useState('8');
  const [feeText, setFeeText] = useState('0');
  const [date, setDate] = useState(new Date());
  const [startTime, setStartTime] = useState(new Date());
  const [durationMinutesText, setDurationMinutesText] = useState('90');
  const [fromBandId, setFromBandId] = useState<SkillBandId>('novice');
  const [toBandId, setToBandId] = useState<SkillBandId>('professional');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit() {
    setSubmitError(null);

    if (!session) {
      setSubmitError('You must be signed in to create an event.');
      return;
    }
    if (!title.trim()) {
      setSubmitError('Title is required.');
      return;
    }
    if (!venue) {
      setSubmitError('Please select or add a venue.');
      return;
    }
    const headcountMax = parseInt(headcountText, 10);
    if (!Number.isInteger(headcountMax) || headcountMax <= 0) {
      setSubmitError('Number of people must be a positive whole number.');
      return;
    }
    const fee = feeText.trim() === '' ? 0 : Number(feeText);
    if (!Number.isInteger(fee) || fee < 0) {
      setSubmitError('Fee must be zero or a positive whole number.');
      return;
    }
    const durationMinutes = parseInt(durationMinutesText, 10);
    if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
      setSubmitError('Duration must be a positive number of minutes.');
      return;
    }
    const fromIndex = SKILL_BANDS.findIndex((band) => band.id === fromBandId);
    const toIndex = SKILL_BANDS.findIndex((band) => band.id === toBandId);
    if (fromIndex > toIndex) {
      setSubmitError('Skill range "from" must not be above "to".');
      return;
    }
    const startDateTime = combineDateAndTime(date, startTime);
    if (startDateTime.getTime() <= Date.now()) {
      setSubmitError('Start time must be in the future.');
      return;
    }
    const endDateTime = new Date(startDateTime.getTime() + durationMinutes * 60_000);

    setSubmitting(true);
    try {
      const { error } = await supabase.from('events').insert({
        organizer_id: session.user.id,
        venue_id: venue.id,
        title: title.trim(),
        description: description.trim() || null,
        fee,
        start_time: startDateTime.toISOString(),
        end_time: endDateTime.toISOString(),
        headcount_max: headcountMax,
        skill_min: SKILL_BANDS[fromIndex].min,
        skill_max: SKILL_BANDS[toIndex].max,
      });
      if (error) throw error;
      router.replace('/');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Could not create event.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Create event</Text>

      <Text style={styles.label}>Title</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Friendly doubles" />

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={description}
        onChangeText={setDescription}
        placeholder="Optional details for players"
        multiline
      />

      <Text style={styles.label}>Venue</Text>
      <VenuePicker selectedVenueId={venue?.id ?? null} onSelect={setVenue} />

      <Text style={styles.label}>Number of people</Text>
      <TextInput
        style={styles.input}
        value={headcountText}
        onChangeText={setHeadcountText}
        keyboardType="number-pad"
      />

      <Text style={styles.label}>Fee (NT$)</Text>
      <TextInput style={styles.input} value={feeText} onChangeText={setFeeText} keyboardType="number-pad" />

      <Text style={styles.label}>Date</Text>
      <DateTimePicker mode="date" value={date} onValueChange={(_event, newDate) => setDate(newDate)} />

      <Text style={styles.label}>Start time</Text>
      <DateTimePicker mode="time" value={startTime} onValueChange={(_event, newTime) => setStartTime(newTime)} />

      <Text style={styles.label}>Duration (minutes)</Text>
      <TextInput
        style={styles.input}
        value={durationMinutesText}
        onChangeText={setDurationMinutesText}
        keyboardType="number-pad"
      />

      <Text style={styles.label}>Skill range: from</Text>
      <Picker selectedValue={fromBandId} onValueChange={(value) => setFromBandId(value as SkillBandId)}>
        {SKILL_BANDS.map((band) => (
          <Picker.Item key={band.id} label={band.label} value={band.id} />
        ))}
      </Picker>

      <Text style={styles.label}>Skill range: to</Text>
      <Picker selectedValue={toBandId} onValueChange={(value) => setToBandId(value as SkillBandId)}>
        {SKILL_BANDS.map((band) => (
          <Picker.Item key={band.id} label={band.label} value={band.id} />
        ))}
      </Picker>

      <Pressable style={styles.submitButton} disabled={submitting} onPress={handleSubmit}>
        <Text style={styles.submitButtonText}>{submitting ? 'Creating...' : 'Create event'}</Text>
      </Pressable>
      {submitError && <Text style={styles.error}>{submitError}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 4 },
  title: { fontSize: 24, fontWeight: '600', marginBottom: 12 },
  label: { fontWeight: '600', marginTop: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, marginTop: 4 },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  submitButton: { backgroundColor: '#208AEF', padding: 14, borderRadius: 8, alignItems: 'center', marginTop: 20 },
  submitButtonText: { color: '#fff', fontWeight: '600' },
  error: { color: 'red', marginTop: 8 },
});
