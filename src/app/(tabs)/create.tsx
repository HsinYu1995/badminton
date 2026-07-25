import { useState } from 'react';
import { Text, TextInput, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { SKILL_BANDS, type SkillBandId } from '@/lib/skill-bands';
import { VenuePicker, type Venue } from '@/components/venue-picker';
import { Court, Font, Radius, Space } from '@/constants/badminton-theme';
import { ActionButton } from '@/components/action-button';
import { SkillBandSelector } from '@/components/skill-band-selector';
import { SectionDivider } from '@/components/section-divider';

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
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>🏸 Host a game</Text>
      <Text style={styles.subtitle}>Fill in the details so players know what to expect</Text>
      <SectionDivider />

      <Text style={styles.label}>Event title</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Friendly doubles" placeholderTextColor={Court.inkSecondary} />

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={description}
        onChangeText={setDescription}
        placeholder="Optional details for players"
        placeholderTextColor={Court.inkSecondary}
        multiline
      />

      <Text style={styles.label}>📍 Venue</Text>
      <VenuePicker selectedVenueId={venue?.id ?? null} onSelect={setVenue} />

      <Text style={styles.label}>👥 Number of players</Text>
      <TextInput
        style={styles.input}
        value={headcountText}
        onChangeText={setHeadcountText}
        keyboardType="number-pad"
      />

      <Text style={styles.label}>💰 Fee (NT$, 0 for free)</Text>
      <TextInput style={styles.input} value={feeText} onChangeText={setFeeText} keyboardType="number-pad" />

      <Text style={styles.label}>📅 Date</Text>
      <DateTimePicker mode="date" value={date} onValueChange={(_event, newDate) => setDate(newDate)} presentation="inline" display="spinner" />

      <Text style={styles.label}>🕒 Start time</Text>
      <DateTimePicker mode="time" value={startTime} onValueChange={(_event, newTime) => setStartTime(newTime)} presentation="inline" display="spinner" />

      <Text style={styles.label}>⏱️ Duration (minutes)</Text>
      <TextInput
        style={styles.input}
        value={durationMinutesText}
        onChangeText={setDurationMinutesText}
        keyboardType="number-pad"
      />

      <Text style={styles.label}>🏆 Skill range: from</Text>
      <SkillBandSelector selectedId={fromBandId} onSelect={setFromBandId} />

      <Text style={styles.label}>🏆 Skill range: to</Text>
      <SkillBandSelector selectedId={toBandId} onSelect={setToBandId} />

      <ActionButton
        label={submitting ? 'Creating...' : 'Create event'}
        onPress={handleSubmit}
        loading={submitting}
        style={styles.submitButton}
      />
      {submitError && <Text style={styles.error}>{submitError}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: Court.greenTint },
  container: { padding: Space.lg, gap: 4, paddingBottom: Space.xl * 2 },
  title: { fontSize: 28, fontFamily: Font.displayBlack, color: Court.ink, marginBottom: 2 },
  subtitle: { color: Court.inkSecondary, marginBottom: Space.md },
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
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  submitButton: { marginTop: Space.xl, alignSelf: 'stretch' },
  error: { color: Court.danger, marginTop: Space.sm },
});
