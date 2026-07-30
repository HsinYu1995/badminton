import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';
import { ActionButton } from '@/components/action-button';
import { Court, Font, Radius, Space } from '@/constants/badminton-theme';

export default function LoginScreen() {
  const { signInWithGoogle, signInAsGuest } = useAuth();
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);

  // Plays once on mount: the net "pulls taut" (posts already in place, tape
  // scaling in from the center), then the scene copy and action buttons
  // settle in just after - arriving courtside a beat before the choice of
  // how to play. Skipped entirely under Reduce Motion.
  const netScale = useRef(new Animated.Value(0)).current;
  const contentRise = useRef(new Animated.Value(16)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return;
      if (reduced) {
        netScale.setValue(1);
        contentRise.setValue(0);
        contentOpacity.setValue(1);
        return;
      }
      Animated.sequence([
        Animated.timing(netScale, { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.parallel([
          Animated.timing(contentOpacity, { toValue: 1, duration: 360, useNativeDriver: true }),
          Animated.timing(contentRise, { toValue: 0, duration: 360, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ]),
      ]).start();
    });
    return () => {
      cancelled = true;
    };
  }, [netScale, contentRise, contentOpacity]);

  async function handleGooglePress() {
    setError(null);
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.signInFailed'));
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleGuestPress() {
    setError(null);
    setGuestLoading(true);
    try {
      await signInAsGuest();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.signInFailed'));
    } finally {
      setGuestLoading(false);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.hero}>
        <Animated.View style={[styles.net, { transform: [{ scaleX: netScale }] }]}>
          <View style={styles.netPost} />
          <View style={styles.netTape} />
          <View style={styles.netPost} />
        </Animated.View>
        <View style={styles.netCordWrap}>
          <View style={styles.netCord} />
        </View>

        <Animated.View style={{ opacity: contentOpacity, transform: [{ translateY: contentRise }] }}>
          <Text style={styles.title}>{t('auth.heroTitle')}</Text>
          <Text style={styles.subtitle}>{t('auth.heroSubtitle')}</Text>
        </Animated.View>
      </View>

      <Animated.View style={[styles.actions, { opacity: contentOpacity, transform: [{ translateY: contentRise }] }]}>
        <Text style={styles.eyebrow}>{t('auth.signIn')}</Text>
        <ActionButton
          label={t('auth.signInWithGoogle')}
          onPress={handleGooglePress}
          loading={googleLoading}
          style={styles.stretch}
        />
        <ActionButton
          label={t('auth.continueAsGuest')}
          onPress={handleGuestPress}
          variant="ghost"
          loading={guestLoading}
          style={styles.stretch}
        />
        {error && (
          <View style={styles.errorPill}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <View style={styles.baseline}>
          <View style={styles.baselineThick} />
          <View style={styles.baselineThin} />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Same deep court-green as the splash screen, on purpose - the native
  // splash hands off to the JS splash hands off to this screen, and none of
  // the three should read as a different app.
  screen: {
    flex: 1,
    backgroundColor: Court.greenDeep,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.xl,
  },
  hero: {
    alignItems: 'center',
    marginBottom: Space.xl,
  },
  // The net a player walks up to before a rally - the same thick/thin line
  // pairing as SectionDivider's doubled sidelines, recolored for this dark
  // backdrop and scaled up into the screen's actual hero graphic, with a
  // pair of posts standing in for what the tape is strung between.
  net: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 220,
  },
  netPost: {
    width: 3,
    height: 16,
    borderRadius: Radius.sm,
    backgroundColor: Court.feather,
  },
  netTape: {
    flex: 1,
    height: 3,
    borderRadius: Radius.pill,
    backgroundColor: Court.shuttle,
    marginHorizontal: Space.xs,
  },
  netCordWrap: {
    width: 140,
    marginTop: 3,
    marginBottom: Space.lg,
  },
  netCord: {
    height: 2,
    borderRadius: Radius.pill,
    backgroundColor: Court.feather,
  },
  title: {
    fontFamily: Font.displayBlack,
    fontSize: 32,
    color: Court.shuttle,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    color: Court.shuttle,
    opacity: 0.8,
    textAlign: 'center',
    marginTop: Space.xs,
    maxWidth: 260,
  },
  actions: {
    width: '100%',
    maxWidth: 340,
    gap: Space.sm,
  },
  eyebrow: {
    fontFamily: Font.display,
    fontSize: 13,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: Court.feather,
    textAlign: 'center',
    marginBottom: Space.xs,
  },
  stretch: {
    alignSelf: 'stretch',
  },
  errorPill: {
    backgroundColor: Court.dangerTint,
    borderRadius: Radius.md,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.md,
    marginTop: Space.xs,
  },
  errorText: {
    color: Court.danger,
    fontSize: 13,
    textAlign: 'center',
  },
  // A quiet echo of the net pairing, sitting just past the actions like a
  // court's far baseline right behind where you'd stand to serve - bookends
  // the hero's net without stretching apart into two disconnected marks.
  baseline: {
    alignItems: 'center',
    gap: 3,
    opacity: 0.45,
    marginTop: Space.xl,
  },
  baselineThick: {
    width: 40,
    height: 3,
    borderRadius: Radius.pill,
    backgroundColor: Court.shuttle,
  },
  baselineThin: {
    width: 24,
    height: 2,
    borderRadius: Radius.pill,
    backgroundColor: Court.feather,
  },
});
