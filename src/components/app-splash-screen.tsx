import { View, Text, StyleSheet } from 'react-native';
import { Court, Font, Radius, Space } from '@/constants/badminton-theme';
import { useI18n } from '@/lib/i18n';

type AppSplashScreenProps = {
  progress: number;
};

// Shown for the (typically sub-second) window between the native splash
// hiding and the app being ready to render - the native splash is a single
// static image with no room for a progress readout, so this JS-rendered
// screen is where the "related image + loading bar" actually lives. The
// 🏸 badge reuses the same glyph as the tab icon and every empty state
// elsewhere in the app rather than a new binary image asset.
export function AppSplashScreen({ progress }: AppSplashScreenProps) {
  const { t } = useI18n();
  return (
    <View style={styles.screen} testID="app-splash-screen">
      <View style={styles.badge}>
        <Text style={styles.badgeEmoji}>🏸</Text>
      </View>
      <Text style={styles.title}>{t('splash.title')}</Text>
      <Text style={styles.subtitle}>{t('splash.subtitle')}</Text>
      <View style={styles.track} testID="app-splash-progress-track">
        <View style={[styles.fill, { width: `${progress}%` }]} testID="app-splash-progress-fill" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Court.greenDeep,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.sm,
  },
  badge: {
    width: 96,
    height: 96,
    borderRadius: Radius.pill,
    backgroundColor: Court.greenTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.md,
  },
  badgeEmoji: { fontSize: 48 },
  title: { fontFamily: Font.displayBlack, fontSize: 26, color: Court.shuttle },
  subtitle: { color: Court.shuttle, opacity: 0.8, marginBottom: Space.lg },
  track: {
    width: 160,
    height: 6,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(247, 245, 238, 0.25)',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: Radius.pill,
    backgroundColor: Court.feather,
  },
});
