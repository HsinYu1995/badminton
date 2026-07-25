import { Pressable, Text, StyleSheet, ActivityIndicator, type ViewStyle } from 'react-native';
import { Court, Radius, Space } from '@/constants/badminton-theme';

type Variant = 'primary' | 'outline' | 'danger' | 'muted';

type ActionButtonProps = {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
};

const VARIANTS: Record<Variant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: Court.feather, fg: '#3A2600' },
  outline: { bg: 'transparent', fg: Court.green, border: Court.green },
  danger: { bg: Court.dangerTint, fg: Court.danger, border: Court.danger },
  muted: { bg: Court.line, fg: Court.inkSecondary },
};

export function ActionButton({ label, onPress, variant = 'primary', disabled, loading, style }: ActionButtonProps) {
  const colors = VARIANTS[variant];
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      disabled={isDisabled}
      onPress={onPress}
      style={[
        styles.button,
        { backgroundColor: colors.bg, borderColor: colors.border ?? 'transparent' },
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.fg} size="small" />
      ) : (
        <Text style={[styles.label, { color: colors.fg }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: Space.sm + 2,
    paddingHorizontal: Space.lg,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 100,
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    fontWeight: '700',
    fontSize: 14,
  },
});
