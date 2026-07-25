import { View, StyleSheet } from 'react-native';
import { Court, Radius, Space } from '@/constants/badminton-theme';

// A badminton court's sidelines are drawn as a close parallel pair (singles
// line inside doubles line) - this echoes that instead of a plain hairline,
// so section breaks read as "court signage" rather than a generic divider.
export function SectionDivider() {
  return (
    <View style={styles.wrap} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.lineThick} />
      <View style={styles.lineThin} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 3, marginVertical: Space.sm },
  lineThick: { height: 3, borderRadius: Radius.pill, backgroundColor: Court.green, width: 40 },
  lineThin: { height: 2, borderRadius: Radius.pill, backgroundColor: Court.feather, width: 24 },
});
