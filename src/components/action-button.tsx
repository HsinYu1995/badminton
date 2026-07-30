import { Pressable, Text, StyleSheet, ActivityIndicator, type ViewStyle } from 'react-native';
import { Court, Font, Radius, Space } from '@/constants/badminton-theme';

type Variant = 'primary' | 'outline' | 'danger' | 'muted' | 'ghost';

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
  // outline's green-on-transparent reads fine on this app's usual cream
  // surfaces but disappears on a dark court-green one (login's hero) -
  // ghost is the same shape in the cream/shuttle ink instead.
  ghost: { bg: 'transparent', fg: Court.shuttle, border: Court.shuttle },
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
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: colors.bg, borderColor: colors.border ?? 'transparent' },
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
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
  pressed: {
    transform: [{ scale: 0.96 }],
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    fontFamily: Font.display,
    fontSize: 15,
  },
});
