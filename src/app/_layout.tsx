import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View, useColorScheme } from 'react-native';

import { LockedOut } from '@/components/locked-out';
import { AuthProvider, useAuth } from '@/lib/auth';
import { LibraryProvider, useLibrary } from '@/lib/library';

SplashScreen.preventAutoHideAsync();

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // The shelf changes rarely and is small; avoid refetch churn when switching tabs.
        staleTime: 60_000,
        retry: 1,
      },
    },
  });
}

/**
 * Sends signed-out visitors to /sign-in and signed-in ones back to the shelf, and holds
 * back the app itself until we know the account is allowed on the shelf at all.
 */
function AuthGate() {
  const { session, loading } = useAuth();
  const { loading: joining, lockedOut, retry } = useLibrary();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    SplashScreen.hideAsync();

    if (!session) {
      if (segments[0] !== 'sign-in') router.replace('/sign-in');
      return;
    }

    if (segments[0] === 'sign-in') router.replace('/');
  }, [session, loading, segments, router]);

  if (loading || (session && joining)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (session && lockedOut) {
    return <LockedOut reason={lockedOut} onRetry={retry} />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="sign-in" />
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [queryClient] = useState(makeQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <LibraryProvider>
          <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
            <AuthGate />
          </ThemeProvider>
        </LibraryProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
