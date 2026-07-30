import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SKILL_BANDS, type SkillBandId } from '@/lib/skill-bands';
import { useI18n } from '@/lib/i18n';
import { Court, Font, Radius, Space } from '@/constants/badminton-theme';

type SkillBandSelectorProps = {
  selectedId: SkillBandId | null;
  onSelect: (id: SkillBandId) => void;
};

// Replaces a native Picker dropdown with a row of tappable chips: the whole
// band list is 7 items, short enough to show at once, and a row of chips
// reads as "pick one" at a glance instead of requiring a tap-to-reveal
// interaction the way a native dropdown does.
export function SkillBandSelector({ selectedId, onSelect }: SkillBandSelectorProps) {
  const { t } = useI18n();
  return (
    <View style={styles.row}>
      {SKILL_BANDS.map((band) => {
        const selected = band.id === selectedId;
        return (
          <Pressable
            key={band.id}
            onPress={() => onSelect(band.id)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[styles.chip, selected && styles.chipSelected]}
          >
            <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{t(`skillBands.${band.id}`)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
  chip: {
    paddingVertical: Space.xs + 2,
    paddingHorizontal: Space.md,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
    borderColor: Court.line,
    backgroundColor: Court.shuttle,
  },
  chipSelected: {
    borderColor: Court.green,
    backgroundColor: Court.greenTint,
  },
  chipLabel: {
    fontSize: 13,
    fontFamily: Font.display,
    color: Court.inkSecondary,
  },
  chipLabelSelected: {
    color: Court.greenDark,
  },
});
