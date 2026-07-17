import { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useAuth } from '@/lib/auth-context';

export default function ProfileScreen() {
  const { signOut } = useAuth();
  const [error, setError] = useState<string | null>(null);

  async function handleSignOut() {
    setError(null);
    try {
      await signOut();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-out failed');
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Profile</Text>
      <Text>Profile + skill tier editing goes here (next plan).</Text>
      <Pressable style={styles.button} onPress={handleSignOut}>
        <Text style={styles.buttonText}>Sign out</Text>
      </Pressable>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  title: { fontSize: 24, fontWeight: '600' },
  button: { backgroundColor: '#ef4444', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8, marginTop: 16 },
  buttonText: { color: '#fff', fontWeight: '600' },
  error: { color: 'red' },
});
