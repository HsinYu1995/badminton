import { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';
import { SkillBandSelector } from '@/components/skill-band-selector';
import { SKILL_BANDS, type SkillBandId } from '@/lib/skill-bands';
import { ActionButton } from '@/components/action-button';
import { Court, Space } from '@/constants/badminton-theme';

export default function GuestSkillPickScreen() {
  const { session, markGuestSkillPicked } = useAuth();
  const { t } = useI18n();
  const [skillBandId, setSkillBandId] = useState<SkillBandId | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleContinue() {
    if (!session || !skillBandId) return;
    setSaving(true);
    setError(null);
    try {
      const band = SKILL_BANDS.find((b) => b.id === skillBandId);
      const { error: updateErr } = await supabase.from('profiles').update({ skill_level: band?.min ?? null }).eq('id', session.user.id);
      if (updateErr) throw updateErr;
      markGuestSkillPicked();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('guestSkillPick.couldNotSave'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('guestSkillPick.title')}</Text>
      <Text style={styles.subtitle}>{t('guestSkillPick.subtitle')}</Text>
      <SkillBandSelector selectedId={skillBandId} onSelect={setSkillBandId} />
      {error && <Text style={styles.error}>{error}</Text>}
      <ActionButton
        label={saving ? t('guestSkillPick.saving') : t('guestSkillPick.continue')}
        onPress={handleContinue}
        loading={saving}
        disabled={!skillBandId}
        style={styles.continueButton}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: Space.lg, justifyContent: 'center', gap: Space.md },
  title: { fontSize: 22, fontWeight: '700', color: Court.ink },
  subtitle: { fontSize: 14, color: Court.inkSecondary, marginBottom: Space.sm },
  error: { color: Court.danger },
  continueButton: { marginTop: Space.lg, alignSelf: 'stretch' },
});
