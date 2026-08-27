import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';
import { normalizeUsername, toAuthEmail, usernameProblem } from '@/lib/username';

type Mode = 'sign-in' | 'sign-up';

export default function SignInScreen() {
  const theme = useTheme();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isSignUp = mode === 'sign-up';

  const submit = async () => {
    const name = normalizeUsername(username);
    // Existing accounts were made with a real address; anything without an "@" is a
    // username and gets turned into one — see lib/username.ts.
    if (!name.includes('@')) {
      const problem = usernameProblem(name);
      if (problem) {
        setError(problem);
        return;
      }
    }

    setBusy(true);
    setError(null);
    setNotice(null);

    const email = toAuthEmail(name);

    if (mode === 'sign-in') {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(
          signInError.message.toLowerCase().includes('invalid login')
            ? 'That username and password do not match an account.'
            : signInError.message
        );
      }
      // On success the auth listener in AuthProvider takes us to the shelf — or to the
      // "not on the shelf" screen, if nobody has added this username yet.
    } else {
      const { data, error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) {
        setError(
          signUpError.message.toLowerCase().includes('not allowed')
            ? 'New accounts are turned off for this app. Ask whoever runs it to enable sign-ups.'
            : signUpError.message
        );
      } else if (!data.session) {
        // Usernames become addresses at a domain that does not exist, so a confirmation
        // email can never arrive. This is a project setting, not something to wait out.
        setNotice(
          'This app needs email confirmation switched off in Supabase before username accounts can be created.'
        );
        setMode('sign-in');
      }
    }

    setBusy(false);
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        style={styles.safe}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.card}>
            <ThemedText type="subtitle">Board Game Shelf</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {isSignUp
                ? 'Pick a username and a password. You will need someone already on the shelf to have added that username.'
                : 'Sign in to reach the shelf.'}
            </ThemedText>

            <Field
              label="Username"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              placeholder="haydn"
              hint={isSignUp ? 'No email address needed.' : undefined}
            />
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              onSubmitEditing={submit}
              hint={isSignUp ? 'At least six characters.' : undefined}
            />

            {error ? (
              <ThemedText type="small" style={{ color: theme.danger }}>
                {error}
              </ThemedText>
            ) : null}

            {notice ? (
              <ThemedText type="small" themeColor="textSecondary">
                {notice}
              </ThemedText>
            ) : null}

            <Button title={isSignUp ? 'Create account' : 'Sign in'} onPress={submit} loading={busy} />

            <Pressable
              onPress={() => {
                setMode(isSignUp ? 'sign-in' : 'sign-up');
                setError(null);
                setNotice(null);
              }}
              hitSlop={8}
              style={styles.toggle}>
              <ThemedText type="small" themeColor="textSecondary">
                {isSignUp ? 'Already have an account? Sign in' : 'First time here? Create an account'}
              </ThemedText>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing.four,
  },
  card: {
    gap: Spacing.three,
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    marginHorizontal: 'auto',
    maxHeight: MaxContentWidth,
  },
  toggle: {
    alignItems: 'center',
  },
});
