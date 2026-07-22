// src/components/event-list-item.tsx
import { View, Text, StyleSheet } from 'react-native';
import { skillBandForLevel } from '@/lib/skill-bands';

export type DiscoverEvent = {
  id: string;
  title: string;
  venue_name: string;
  distance_meters: number | null;
  start_time: string;
  fee: number;
  skill_min: number;
  skill_max: number;
};

function formatStartTime(startTime: string): string {
  return new Date(startTime).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatFee(fee: number): string {
  return fee === 0 ? 'Free' : `NT$ ${fee}`;
}

function formatSkillRange(skillMin: number, skillMax: number): string {
  return `${skillBandForLevel(skillMin).label}-${skillBandForLevel(skillMax).label}`;
}

export function EventListItem({ event }: { event: DiscoverEvent }) {
  const venueLine =
    event.distance_meters === null
      ? event.venue_name
      : `${event.venue_name} - ${(event.distance_meters / 1000).toFixed(1)} km`;

  return (
    <View style={styles.row}>
      <Text style={styles.title}>{event.title}</Text>
      <Text style={styles.venue}>{venueLine}</Text>
      <Text style={styles.meta}>
        {formatStartTime(event.start_time)} - {formatFee(event.fee)}
      </Text>
      <Text style={styles.skill}>Skill: {formatSkillRange(event.skill_min, event.skill_max)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', gap: 2, marginBottom: 8 },
  title: { fontWeight: '600', fontSize: 16 },
  venue: { color: '#333' },
  meta: { color: '#666' },
  skill: { color: '#666' },
});
