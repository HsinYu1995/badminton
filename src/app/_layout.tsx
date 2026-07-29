import { SplashScreen, Stack } from 'expo-router';
import { useFonts, LeagueSpartan_700Bold, LeagueSpartan_800ExtraBold } from '@expo-google-fonts/league-spartan';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { AppSplashScreen } from '@/components/app-splash-screen';
import { computeSplashProgress } from '@/lib/splash-progress';

SplashScreen.preventAutoHideAsync();

// Hides the native (image-only) splash as soon as fonts are loaded - the
// app is ready to render *something* at that point - handing off to
// AppSplashScreen, which stays up with a real loading bar until auth has
// also resolved.
function SplashScreenController({ fontsLoaded }: { fontsLoaded: boolean }) {
  if (fontsLoaded) {
    SplashScreen.hide();
  }
  return null;
}

function RootNavigator() {
  const { session } = useAuth();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="event/[id]" options={{ headerShown: true, title: 'Event details' }} />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}

function AppBody({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { isLoading } = useAuth();
  const ready = fontsLoaded && !isLoading;

  return ready ? <RootNavigator /> : <AppSplashScreen progress={computeSplashProgress(fontsLoaded, isLoading)} />;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ LeagueSpartan_700Bold, LeagueSpartan_800ExtraBold });

  return (
    <AuthProvider>
      <SplashScreenController fontsLoaded={fontsLoaded} />
      <AppBody fontsLoaded={fontsLoaded} />
    </AuthProvider>
  );
}
