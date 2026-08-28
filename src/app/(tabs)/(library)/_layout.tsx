import { Stack } from 'expo-router';

import { useTheme } from '@/hooks/use-theme';

/**
 * A game opens on top of the shelf rather than beside it, so the bottom toolbar stays
 * put while you read one — and the shelf you came from is still there behind it.
 */
export default function LibraryStackLayout() {
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.text,
        contentStyle: { backgroundColor: theme.background },
      }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="game/[id]" options={{ title: 'Game' }} />
    </Stack>
  );
}
