import { Text, View, StyleSheet, type ViewStyle } from 'react-native';
import { Court, Radius, Space } from '@/constants/badminton-theme';

type PillProps = {
  label: string;
  tone?: 'green' | 'feather' | 'neutral' | 'danger';
  style?: ViewStyle;
};

const TONES = {
  green: { bg: Court.greenTint, fg: Court.greenDark },
  feather: { bg: '#FCEFD9', fg: Court.featherDark },
  neutral: { bg: Court.line, fg: Court.inkSecondary },
  danger: { bg: Court.dangerTint, fg: Court.danger },
} as const;

export function Pill({ label, tone = 'neutral', style }: PillProps) {
  const colors = TONES[tone];
  return (
    <View style={[styles.pill, { backgroundColor: colors.bg }, style]}>
      <Text style={[styles.label, { color: colors.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
    borderRadius: Radius.pill,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
  },
});
