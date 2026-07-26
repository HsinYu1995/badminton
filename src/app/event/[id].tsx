import { View, Text, StyleSheet } from 'react-native';
import { Court, Space } from '@/constants/badminton-theme';

// Fleshed out in a later task (event detail: full event info via
// getEventDetail) - registered now so RootLayout's Stack.Screen has a
// matching route file from the start.
export default function EventDetailScreen() {
  return (
    <View style={styles.screen}>
      <Text style={styles.placeholder}>Loading event...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Court.greenTint, alignItems: 'center', justifyContent: 'center', padding: Space.lg },
  placeholder: { color: Court.inkSecondary },
});
