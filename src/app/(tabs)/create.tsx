import { View, Text, StyleSheet } from 'react-native';

export default function CreateEventScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create event</Text>
      <Text>Event creation form goes here (next plan).</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  title: { fontSize: 24, fontWeight: '600' },
});
