import type { ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Court, Font, Radius, Space } from '@/constants/badminton-theme';

type FieldCardProps = {
  icon: string;
  label: string;
  children: ReactNode;
};

// A themed frame for native, OS-rendered controls (like @expo/ui's
// DateTimePicker) that can't be restyled internally - the border, icon
// badge, and label make the control read as an intentionally embedded
// module of this design system rather than a stray system dialog.
export function FieldCard({ icon, label, children }: FieldCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.iconBadge}>
          <Text style={styles.icon}>{icon}</Text>
        </View>
        <Text style={styles.label}>{label}</Text>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: Space.md,
    borderWidth: 1,
    borderColor: Court.line,
    backgroundColor: Court.shuttle,
    borderRadius: Radius.lg,
    padding: Space.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    marginBottom: Space.xs,
    marginLeft: Space.xs,
  },
  iconBadge: {
    width: 28,
    height: 28,
    borderRadius: Radius.pill,
    backgroundColor: Court.greenTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { fontSize: 14 },
  label: {
    fontFamily: Font.display,
    fontSize: 13,
    color: Court.ink,
  },
});
