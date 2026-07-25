import { SplashScreen, Stack } from 'expo-router';
import { useFonts, LeagueSpartan_700Bold, LeagueSpartan_800ExtraBold } from '@expo-google-fonts/league-spartan';
import { AuthProvider, useAuth } from '@/lib/auth-context';

SplashScreen.preventAutoHideAsync();

function SplashScreenController({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { isLoading } = useAuth();
  if (!isLoading && fontsLoaded) {
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
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ LeagueSpartan_700Bold, LeagueSpartan_800ExtraBold });

  return (
    <AuthProvider>
      <SplashScreenController fontsLoaded={fontsLoaded} />
      {fontsLoaded && <RootNavigator />}
    </AuthProvider>
  );
}
