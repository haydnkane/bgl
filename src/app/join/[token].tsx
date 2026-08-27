import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { clearPendingInvite, rememberPendingInvite } from '@/lib/invites';
import { useLibrary } from '@/lib/library';
import { useInvitePreview, useRedeemInvite } from '@/lib/queries/libraries';

/**
 * The landing screen for an invite link. Reachable signed out — the whole point is that
 * the recipient can see what they have been invited to before deciding to make an account.
 */
export default function JoinScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token: string }>();
  const { session } = useAuth();
  const { setActiveLibraryId } = useLibrary();

  const { data: preview, isPending, error } = useInvitePreview(token);
  const redeem = useRedeemInvite();
  const [joinError, setJoinError] = useState<string | null>(null);

  // Arriving here with a session means the round trip through sign-up is over, so the
  // remembered token has done its job.
  useEffect(() => {
    if (session) clearPendingInvite();
  }, [session]);

  const openLibrary = (libraryId: string) => {
    setActiveLibraryId(libraryId);
    router.replace('/');
  };

  const join = async () => {
    setJoinError(null);
    try {
      const libraryId = await redeem.mutateAsync(token);
      openLibrary(libraryId);
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : 'Could not join that shelf.');
    }
  };

  const signInToJoin = async () => {
    await rememberPendingInvite(token);
    router.replace('/sign-in');
  };

  if (isPending) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator />
      </View>
    );
  }

  if (error || !preview) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <EmptyState
          icon="help-circle-outline"
          title="That link is not valid"
          message="Check that you copied all of it, or ask whoever shared it for a new one."
        />
      </View>
    );
  }

  const members = `${preview.member_count} ${preview.member_count === 1 ? 'member' : 'members'}`;

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.scroll}>
      <View
        style={[
          styles.card,
          { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        ]}>
        <ThemedText type="small" themeColor="textSecondary">
          You have been invited to a shared shelf
        </ThemedText>
        <ThemedText type="subtitle">{preview.library_name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {members}
        </ThemedText>
      </View>

      {preview.status === 'revoked' ? (
        <ThemedText type="small" style={{ color: theme.danger }}>
          This link has been revoked. Ask for a new one.
        </ThemedText>
      ) : null}

      {preview.status === 'expired' ? (
        <ThemedText type="small" style={{ color: theme.danger }}>
          This link has expired. Ask for a new one.
        </ThemedText>
      ) : null}

      {preview.status === 'already_member' ? (
        <>
          <ThemedText type="small" themeColor="textSecondary">
            You are already on this shelf.
          </ThemedText>
          <Button title="Open it" onPress={() => openLibrary(preview.library_id)} />
        </>
      ) : null}

      {preview.status === 'ok' ? (
        session ? (
          <>
            <ThemedText type="small" themeColor="textSecondary">
              Joining lets you add, edit and remove games on this shelf, alongside everyone
              else on it.
            </ThemedText>
            <Button title="Join this shelf" onPress={join} loading={redeem.isPending} />
          </>
        ) : (
          <>
            <ThemedText type="small" themeColor="textSecondary">
              You need an account to join. We will bring you straight back here afterwards.
            </ThemedText>
            <Button title="Sign in or sign up to join" onPress={signInToJoin} />
          </>
        )
      ) : null}

      {joinError ? (
        <ThemedText type="small" style={{ color: theme.danger }}>
          {joinError}
        </ThemedText>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    padding: Spacing.three,
    gap: Spacing.three,
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    marginHorizontal: 'auto',
  },
  card: {
    gap: Spacing.one,
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.four,
  },
});
