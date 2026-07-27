import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Court, Radius, Space } from '@/constants/badminton-theme';
import { useI18n } from '@/lib/i18n';

type SearchBarProps = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
};

export function SearchBar({ value, onChangeText, placeholder }: SearchBarProps) {
  const { t } = useI18n();
  return (
    <View style={styles.wrap}>
      <Text style={styles.icon}>🔍</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? t('searchBar.defaultPlaceholder')}
        placeholderTextColor={Court.inkSecondary}
        accessibilityLabel={t('searchBar.accessibilityLabel')}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Court.shuttle,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Court.line,
    paddingLeft: Space.md,
    paddingRight: Space.lg,
  },
  icon: {
    fontSize: 15,
    marginRight: Space.xs,
    opacity: 0.7,
  },
  input: {
    flex: 1,
    height: 44,
    fontSize: 15,
    color: Court.ink,
  },
});
