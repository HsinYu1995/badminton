import { useState } from 'react';
import { Text, TextInput, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { type SkillBandId } from '@/lib/skill-bands';
import { validateEventDraft } from '@/lib/event-draft';
import { VenuePicker, type Venue } from '@/components/venue-picker';
import { Court, Font, Radius, Space } from '@/constants/badminton-theme';
import { ActionButton } from '@/components/action-button';
import { SkillBandSelector } from '@/components/skill-band-selector';
import { SectionDivider } from '@/components/section-divider';
import { FieldCard } from '@/components/field-card';

export default function CreateEventScreen() {
  const { session } = useAuth();
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [venue, setVenue] = useState<Venue | null>(null);
  const [headcountText, setHeadcountText] = useState('8');
  const [feeText, setFeeText] = useState('0');
  const [date, setDate] = useState(new Date());
  const [startTimeText, setStartTimeText] = useState('');
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

    const result = validateEventDraft({
      title,
      venueId: venue?.id ?? null,
      headcountText,
      feeText,
      durationMinutesText,
      fromBandId,
      toBandId,
      date,
      startTimeText,
    });
    if (!result.ok) {
      setSubmitError(result.error);
      return;
    }
    const event = result.event;

    setSubmitting(true);
    try {
      const { error } = await supabase.from('events').insert({
        organizer_id: session.user.id,
        venue_id: event.venueId,
        title: event.title,
        description: description.trim() || null,
        fee: event.fee,
        start_time: event.startTime.toISOString(),
        end_time: event.endTime.toISOString(),
        headcount_max: event.headcountMax,
        skill_min: event.skillMin,
        skill_max: event.skillMax,
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

      <FieldCard icon="📅" label="Date">
        <DateTimePicker mode="date" value={date} onValueChange={(_event, newDate) => setDate(newDate)} presentation="inline" display="spinner" />
      </FieldCard>

      <Text style={styles.label}>🕒 Start time (24-hour, e.g. 18:30)</Text>
      <TextInput
        style={styles.input}
        value={startTimeText}
        onChangeText={setStartTimeText}
        placeholder="18:30"
        placeholderTextColor={Court.inkSecondary}
        keyboardType="numbers-and-punctuation"
        maxLength={5}
      />

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
