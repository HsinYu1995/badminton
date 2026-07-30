import { useEffect, useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { supabase } from '@/lib/supabase';
import { getEventDetail, type EventDetail } from '@/lib/profile-data';
import { bandForLevel } from '@/lib/skill-bands';
import { useI18n } from '@/lib/i18n';
import { Court, Font, Radius, Space } from '@/constants/badminton-theme';
import { EventCard } from '@/components/event-card';
import { Pill } from '@/components/pill';

// The tap-through destination for an event card in Profile ("Games I'm
// playing" / "My events") - just the event's own full info (including
// description, which the list cards never show). The roster, organizer
// rating, and credit UI stay inline on Profile where they already lived -
// see docs/superpowers/specs/2026-07-25-discovery-pagination-credit-splash-design.md.
export default function EventDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useI18n();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    getEventDetail(supabase, id).then((result) => {
      if (cancelled) return;
      if (!result) setNotFound(true);
      else setEvent(result);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={Court.green} />
      </View>
    );
  }

  if (notFound || !event) {
    return (
      <View style={styles.centered}>
        <Text style={styles.notFound}>{t('eventDetail.notFound')}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <EventCard event={event} />

      {event.description && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('eventDetail.aboutThisGame')}</Text>
          <Text style={styles.description}>{event.description}</Text>
        </View>
      )}

      {event.organizer && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t('eventDetail.organizedBy', { name: event.organizer.display_name })}</Text>
          <View style={styles.pillRow}>
            {event.organizer.skill_level != null && <Pill label={t(`skillBands.${bandForLevel(event.organizer.skill_level).id}`)} tone="green" />}
            {event.organizer.contact_info && <Pill label={event.organizer.contact_info} tone="feather" />}
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Court.greenTint },
  content: { padding: Space.lg, gap: Space.lg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Court.greenTint },
  notFound: { color: Court.inkSecondary },
  section: { gap: Space.sm },
  sectionTitle: { fontFamily: Font.display, fontSize: 15, color: Court.ink },
  description: { color: Court.inkSecondary, lineHeight: 20 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
});
