import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { signOut } from '@/lib/auth';

/**
 * Shown to a signed-in account that is not on the allowlist. It is a real state rather
 * than an error: the account exists and the password is right, there is just nobody on the
 * shelf who has vouched for the name yet.
 */
export function LockedOut({ reason, onRetry }: { reason: string; onRetry: () => void }) {
  const theme = useTheme();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        <EmptyState icon="lock-closed-outline" title="Not on the shelf" message={reason} />
        <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
          Once someone on the shelf has added your username, come back and try again.
        </ThemedText>
        <Button title="Try again" onPress={onRetry} />
        <Button title="Sign out" variant="secondary" onPress={signOut} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    marginHorizontal: 'auto',
  },
  hint: {
    textAlign: 'center',
  },
});
