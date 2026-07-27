import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Court, Font, Space } from '@/constants/badminton-theme';
import { useI18n, pluralize } from '@/lib/i18n';

type StarRatingProps = {
  // 0 = nothing selected yet ("starting from 0" - not yet rated this pass).
  value: number;
  onChange: (score: number) => void;
  disabled?: boolean;
};

const STAR_VALUES = [1, 2, 3, 4, 5];

// A tap-to-select 0-5 star row. Submitting a score is always 1-5 (the
// ratings table's check constraint) - 0 is only ever the picker's own
// unselected starting state, never a value that gets sent anywhere.
export function StarRating({ value, onChange, disabled }: StarRatingProps) {
  const { t, locale } = useI18n();
  return (
    <View style={styles.row} accessibilityRole="adjustable" accessibilityLabel={t('starRating.accessibilityLabel', { value })}>
      {STAR_VALUES.map((star) => (
        <Pressable
          key={star}
          disabled={disabled}
          onPress={() => onChange(star)}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={t('starRating.rateStars', { star, unit: pluralize(star, 'star', 'stars', locale) })}
        >
          <Text style={[styles.star, star <= value ? styles.starFilled : styles.starEmpty, disabled && styles.starDisabled]}>
            {star <= value ? '★' : '☆'}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 2 },
  star: { fontSize: 18, fontFamily: Font.display },
  starFilled: { color: Court.featherDark },
  starEmpty: { color: Court.line },
  starDisabled: { opacity: 0.5 },
});
