import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, View, useColorScheme } from 'react-native';

import { AuthProvider, useAuth } from '@/lib/auth';
import { takePendingInvite } from '@/lib/invites';
import { LibraryProvider } from '@/lib/library';

SplashScreen.preventAutoHideAsync();

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // The library changes rarely and is small; avoid refetch churn when switching tabs.
        staleTime: 60_000,
        retry: 1,
      },
    },
  });
}

/**
 * Sends signed-out visitors to /sign-in and signed-in ones back to the library.
 *
 * /join/[token] is exempt: someone following an invite link has to be able to see what
 * they were invited to before they have an account.
 */
function AuthGate() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  // Guards the async hop below against a second run landing on '/' after the first has
  // already routed to the invite.
  const handledSignIn = useRef(false);

  useEffect(() => {
    if (loading) return;
    SplashScreen.hideAsync();

    const onSignIn = segments[0] === 'sign-in';
    const isPublic = onSignIn || segments[0] === 'join';

    if (!session) {
      handledSignIn.current = false;
      if (!isPublic) router.replace('/sign-in');
      return;
    }

    if (onSignIn && !handledSignIn.current) {
      handledSignIn.current = true;
      // An invite followed while signed out resumes here, once there is a session to
      // redeem it with.
      takePendingInvite().then((token) => {
        router.replace(token ? { pathname: '/join/[token]', params: { token } } : '/');
      });
    }
  }, [session, loading, segments, router]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="sign-in" options={{ headerShown: false }} />
      <Stack.Screen name="game/new" options={{ title: 'Add game', presentation: 'modal' }} />
      <Stack.Screen name="game/[id]" options={{ title: 'Game' }} />
      <Stack.Screen name="shelf" options={{ title: 'Shelf & sharing', presentation: 'modal' }} />
      <Stack.Screen name="join/[token]" options={{ title: 'Join a shelf' }} />
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
