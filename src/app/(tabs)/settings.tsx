import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { Field } from '@/components/field';
import { RolePicker } from '@/components/role-picker';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useUserId } from '@/lib/auth';
import { confirmDestructive } from '@/lib/confirm';
import { useLibrary } from '@/lib/library';
import {
  useAllowUser,
  useDisallowUser,
  useSetPersonRole,
  useShelfPeople,
} from '@/lib/queries/libraries';
import { ROLE_LABELS, type LibraryRole, type ShelfPerson } from '@/lib/types';
import { normalizeUsername, usernameProblem } from '@/lib/username';

/** Your own row carries no picker, so it is the one place the role has to be spelled out. */
function personStatus(person: ShelfPerson, isYou: boolean): string {
  if (isYou) return `${ROLE_LABELS[person.role]} · you`;
  return person.user_id ? 'Signed in' : 'Has not signed in yet';
}

/** Who can use the collection, and what each of them may do. */
export default function SettingsScreen() {
  const theme = useTheme();
  const userId = useUserId();
  const { loading, canManagePeople } = useLibrary();

  const { data: people = [], isLoading: peopleLoading } = useShelfPeople(canManagePeople);
  const allowUser = useAllowUser();
  const disallowUser = useDisallowUser();
  const setPersonRole = useSetPersonRole();

  const [newUsername, setNewUsername] = useState('');
  const [newRole, setNewRole] = useState<LibraryRole>('admin');
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator />
      </View>
    );
  }

  // The cog is only shown to owners, but the route can still be reached directly.
  if (!canManagePeople) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <EmptyState
          icon="lock-closed-outline"
          title="Owners only"
          message="Only an owner can see who is on the collection and what they may do."
        />
      </View>
    );
  }

  if (peopleLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator />
      </View>
    );
  }

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
      await allowUser.mutateAsync({ username, role: newRole });
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

  const changeRole = (person: ShelfPerson, role: LibraryRole) => {
    if (role === person.role) return;
    setError(null);
    setStatus(null);
    setPersonRole.mutate(
      { username: person.username, role },
      {
        onError: (e) =>
          setError(e instanceof Error ? e.message : 'Could not change what they may do.'),
        onSuccess: () => setStatus(`Updated "${person.username}".`),
      }
    );
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
          Everyone listed here shares the same collection. What each of them may do with it
          is set here.
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
              <View style={styles.cardHead}>
                <View style={styles.flex}>
                  <ThemedText type="small" style={styles.username}>
                    {person.username}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {personStatus(person, isYou)}
                  </ThemedText>
                </View>
                {isYou ? null : (
                  <Pressable
                    onPress={() => remove(person)}
                    hitSlop={8}
                    accessibilityLabel={`Remove ${person.username}`}>
                    <Ionicons name="person-remove-outline" size={20} color={theme.danger} />
                  </Pressable>
                )}
              </View>

              {/* Your own row has no picker: the database refuses a self-demotion, so
                  offering one would only produce an error. */}
              {isYou ? null : (
                <RolePicker
                  compact
                  value={person.role}
                  onChange={(role) => changeRole(person, role)}
                  disabled={setPersonRole.isPending}
                />
              )}
            </View>
          );
        })}
      </View>

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
        <RolePicker value={newRole} onChange={setNewRole} />
      </View>

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
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.three,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
