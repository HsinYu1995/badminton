import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { supabase } from '../../lib/supabase';

export default function DiscoverScreen() {
  const [loading, setLoading] = useState(true);
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('events')
      .select('*', { count: 'exact', head: true })
      .then(({ count, error }) => {
        if (error) setError(error.message);
        else setCount(count ?? 0);
        setLoading(false);
      });
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Discover</Text>
      {loading && <ActivityIndicator />}
      {!loading && error && <Text>Connection error: {error}</Text>}
      {!loading && !error && <Text>Connected to Supabase. {count} event(s) in the database.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  title: { fontSize: 24, fontWeight: '600' },
});
