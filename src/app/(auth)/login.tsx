import { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';

export default function LoginScreen() {
  const { signInWithGoogle } = useAuth();
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);

  async function handlePress() {
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.signInFailed'));
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('auth.signIn')}</Text>
      <Pressable style={styles.button} onPress={handlePress}>
        <Text style={styles.buttonText}>{t('auth.signInWithGoogle')}</Text>
      </Pressable>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  title: { fontSize: 24, fontWeight: '600' },
  button: { backgroundColor: '#4285F4', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 },
  buttonText: { color: '#fff', fontWeight: '600' },
  error: { color: 'red' },
});
