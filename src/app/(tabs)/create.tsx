import { useState } from 'react';
import { Text, TextInput, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';
import { type SkillBandId } from '@/lib/skill-bands';
import { validateEventDraft } from '@/lib/event-draft';
import { VenuePicker, type Venue } from '@/components/venue-picker';
import { Court, Font, Radius, Space } from '@/constants/badminton-theme';
import { ActionButton } from '@/components/action-button';
import { SkillBandSelector } from '@/components/skill-band-selector';
import { SectionDivider } from '@/components/section-divider';
import { FieldCard } from '@/components/field-card';
import { DatePickerField } from '@/components/date-picker-field';

export default function CreateEventScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const { t } = useI18n();

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
      setSubmitError(t('create.mustBeSignedIn'));
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
      setSubmitError(t(`errors.${result.errorKey}`));
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
      setSubmitError(err instanceof Error ? err.message : t('create.couldNotCreate'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>{t('create.headerTitle')}</Text>
      <Text style={styles.subtitle}>{t('create.subtitle')}</Text>
      <SectionDivider />

      <Text style={styles.label}>{t('create.eventTitleLabel')}</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder={t('create.eventTitlePlaceholder')} placeholderTextColor={Court.inkSecondary} />

      <Text style={styles.label}>{t('create.descriptionLabel')}</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        value={description}
        onChangeText={setDescription}
        placeholder={t('create.descriptionPlaceholder')}
        placeholderTextColor={Court.inkSecondary}
        multiline
      />

      <Text style={styles.label}>{t('create.venueLabel')}</Text>
      <VenuePicker selectedVenueId={venue?.id ?? null} onSelect={setVenue} />

      <Text style={styles.label}>{t('create.playersLabel')}</Text>
      <TextInput
        style={styles.input}
        value={headcountText}
        onChangeText={setHeadcountText}
        keyboardType="number-pad"
      />

      <Text style={styles.label}>{t('create.feeLabel')}</Text>
      <TextInput style={styles.input} value={feeText} onChangeText={setFeeText} keyboardType="number-pad" />

      <FieldCard icon="📅" label={t('create.dateLabel')}>
        <DatePickerField value={date} onChange={setDate} />
      </FieldCard>

      <Text style={styles.label}>{t('create.startTimeLabel')}</Text>
      <TextInput
        style={styles.input}
        value={startTimeText}
        onChangeText={setStartTimeText}
        placeholder={t('create.startTimePlaceholder')}
        placeholderTextColor={Court.inkSecondary}
        keyboardType="numbers-and-punctuation"
        maxLength={5}
      />

      <Text style={styles.label}>{t('create.durationLabel')}</Text>
      <TextInput
        style={styles.input}
        value={durationMinutesText}
        onChangeText={setDurationMinutesText}
        keyboardType="number-pad"
      />

      <Text style={styles.label}>{t('create.skillFromLabel')}</Text>
      <SkillBandSelector selectedId={fromBandId} onSelect={setFromBandId} />

      <Text style={styles.label}>{t('create.skillToLabel')}</Text>
      <SkillBandSelector selectedId={toBandId} onSelect={setToBandId} />

      <ActionButton
        label={submitting ? t('create.creating') : t('create.submit')}
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
