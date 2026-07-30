import type { ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Court, Font, Radius, Shadow, Space, SkillBandAccents } from '@/constants/badminton-theme';
import { bandForLevel } from '@/lib/skill-bands';
import { formatDistance, formatFee, formatStartTime, isPastEvent, type EventListItem } from '@/lib/events';
import { useI18n } from '@/lib/i18n';
import { Pill } from '@/components/pill';

const SKILL_SCALE_MIN = 1;
const SKILL_SCALE_MAX = 18;

// A thin 1-18 strip with the event's [skill_min, skill_max] segment
// highlighted, so competitiveness reads visually at a glance instead of
// requiring the viewer to parse the numeric range in the pill below.
function SkillGauge({ skillMin, skillMax, color, label }: { skillMin: number; skillMax: number; color: string; label: string }) {
  const scaleSpan = SKILL_SCALE_MAX - SKILL_SCALE_MIN;
  const leftPct = ((skillMin - SKILL_SCALE_MIN) / scaleSpan) * 100;
  const widthPct = ((skillMax - skillMin) / scaleSpan) * 100;
  return (
    <View style={styles.gaugeTrack} accessibilityLabel={label}>
      <View style={[styles.gaugeFill, { left: `${leftPct}%`, width: `${Math.max(widthPct, 4)}%`, backgroundColor: color }]} />
    </View>
  );
}

type EventCardProps = {
  event: EventListItem;
  action?: ReactNode;
  // Count of accepted event_participants rows for this event (the
  // organizer is added separately - see computePlayerCounts). Omitted
  // (rather than defaulted to 0) when the caller hasn't fetched it, so the
  // card falls back to "Up to N players" instead of claiming 0/N.
  participantCount?: number;
  // Meters from the viewer's current location, from Discover's
  // discover_events RPC. Omitted (not shown) when the caller has no
  // location - never fabricated.
  distanceMeters?: number | null;
};

export function EventCard({ event, action, participantCount, distanceMeters }: EventCardProps) {
  const { t, locale } = useI18n();
  const band = bandForLevel(event.skill_min);
  const accent = SkillBandAccents[band.id] ?? Court.green;
  const past = isPastEvent(event);

  return (
    <View style={[styles.card, Shadow.card]}>
      <View style={[styles.accentStripe, { backgroundColor: accent }]} />
      <View style={styles.body}>
        <View style={styles.headerRow}>
          <Text style={styles.title} numberOfLines={2}>
            {event.title}
          </Text>
          {past && <Pill label={t('eventCard.past')} tone="danger" />}
        </View>

        <Text style={styles.meta}>📍 {event.venues?.name ?? t('eventCard.venueTbd')}</Text>
        <Text style={styles.meta}>🕒 {formatStartTime(event.start_time, locale)}</Text>

        <SkillGauge
          skillMin={event.skill_min}
          skillMax={event.skill_max}
          color={accent}
          label={t('eventCard.skillGaugeAccessibilityLabel', { min: event.skill_min, max: event.skill_max, scaleMax: SKILL_SCALE_MAX })}
        />

        <View style={styles.pillRow}>
          <Pill
            label={t('eventCard.skillLabel', { band: t(`skillBands.${band.id}`), min: event.skill_min, max: event.skill_max })}
            tone="green"
          />
          <Pill label={formatFee(event.fee, locale)} tone="feather" />
          <Pill
            label={
              participantCount != null
                ? t('eventCard.playersCountFraction', { count: participantCount, max: event.headcount_max })
                : t('eventCard.playersUpTo', { max: event.headcount_max })
            }
            tone="neutral"
          />
          {distanceMeters != null && <Pill label={formatDistance(distanceMeters, locale)} tone="neutral" />}
        </View>

        {action && <View style={styles.actionRow}>{action}</View>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: Court.shuttle,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    marginBottom: Space.md,
  },
  accentStripe: {
    width: 6,
  },
  body: {
    flex: 1,
    padding: Space.lg,
    gap: Space.xs,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Space.sm,
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontFamily: Font.displayBlack,
    color: Court.ink,
  },
  meta: {
    color: Court.inkSecondary,
    fontSize: 13,
  },
  gaugeTrack: {
    height: 5,
    borderRadius: Radius.pill,
    backgroundColor: Court.line,
    marginTop: Space.sm,
    overflow: 'hidden',
  },
  gaugeFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: Radius.pill,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Space.sm,
    marginTop: Space.sm,
  },
  actionRow: {
    marginTop: Space.md,
    alignItems: 'flex-end',
  },
});
