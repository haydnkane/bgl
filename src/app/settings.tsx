import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useUserId } from '@/lib/auth';
import { confirmDestructive } from '@/lib/confirm';
import { useLibrary } from '@/lib/library';
import { useAllowUser, useDisallowUser, useShelfPeople } from '@/lib/queries/libraries';
import type { ShelfPerson } from '@/lib/types';
import { normalizeUsername, usernameProblem } from '@/lib/username';

function personStatus(person: ShelfPerson, isYou: boolean): string {
  if (!person.user_id) return 'Has not signed in yet';
  const role = person.role === 'owner' ? 'Owner' : 'Member';
  return isYou ? `${role} · you` : role;
}

/** Who can use the collection. Adding a username lets that person in; removing it locks them out. */
export default function SettingsScreen() {
  const theme = useTheme();
  const userId = useUserId();
  const { role, loading } = useLibrary();

  const { data: people = [], isLoading: peopleLoading } = useShelfPeople();
  const allowUser = useAllowUser();
  const disallowUser = useDisallowUser();

  const [newUsername, setNewUsername] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (loading || peopleLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator />
      </View>
    );
  }

  const isOwner = role === 'owner';

  const add = async () => {
    const username = normalizeUsername(newUsername);
    const problem = usernameProblem(username);
    setStatus(null);
    if (problem) {
      setError(problem);
      return;
    }

    setError(null);
    try {
      await allowUser.mutateAsync({ username });
      setNewUsername('');
      setStatus(`"${username}" can now create an account and sign in.`);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not add that username.';
      // The primary key is the only thing a well-formed name can collide with.
      setError(
        message.toLowerCase().includes('duplicate')
          ? `"${username}" is already on the list.`
          : message
      );
    }
  };

  const remove = (person: ShelfPerson) => {
    confirmDestructive(
      `Remove "${person.username}"?`,
      person.user_id
        ? 'They lose access straight away. The games they added stay.'
        : 'They will no longer be able to create an account with that username.',
      () => {
        setError(null);
        setStatus(null);
        disallowUser.mutate(person.username, {
          onError: (e) =>
            setError(e instanceof Error ? e.message : 'Could not remove that person.'),
          onSuccess: () => setStatus(`Removed "${person.username}".`),
        });
      },
      'Remove'
    );
  };

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled">
      <View style={styles.section}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          {`PEOPLE (${people.length})`}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Everyone listed here shares the same collection and can add, edit and delete games.
        </ThemedText>

        {people.map((person) => {
          const isYou = person.user_id !== null && person.user_id === userId;
          return (
            <View
              key={person.username}
              style={[
                styles.card,
                { backgroundColor: theme.backgroundElement, borderColor: theme.border },
              ]}>
              <View style={styles.flex}>
                <ThemedText type="small" style={styles.username}>
                  {person.username}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {personStatus(person, isYou)}
                </ThemedText>
              </View>
              {isOwner && !isYou ? (
                <Pressable
                  onPress={() => remove(person)}
                  hitSlop={8}
                  accessibilityLabel={`Remove ${person.username}`}>
                  <Ionicons name="person-remove-outline" size={20} color={theme.danger} />
                </Pressable>
              ) : null}
            </View>
          );
        })}
      </View>

      {isOwner ? (
        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            ADD SOMEONE
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Add the username they will use, then tell them to open the app and create an
            account with it. No email address is involved.
          </ThemedText>
          <View style={styles.row}>
            <Field
              value={newUsername}
              onChangeText={setNewUsername}
              placeholder="Username"
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={add}
              containerStyle={styles.flex}
            />
            <Button
              title="Add"
              onPress={add}
              disabled={!newUsername.trim()}
              loading={allowUser.isPending}
            />
          </View>
        </View>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          An owner can add and remove people.
        </ThemedText>
      )}

      {status ? (
        <ThemedText type="small" themeColor="textSecondary">
          {status}
        </ThemedText>
      ) : null}
      {error ? (
        <ThemedText type="small" style={{ color: theme.danger }}>
          {error}
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
    gap: Spacing.four,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    marginHorizontal: 'auto',
    paddingBottom: Spacing.six,
  },
  section: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  flex: {
    flex: 1,
  },
  username: {
    fontWeight: '600',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.three,
  },
});
