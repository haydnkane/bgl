import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { supabase } from '@/lib/supabase';

type Mode = 'sign-in' | 'sign-up';

export default function SignInScreen() {
  const theme = useTheme();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);

    if (mode === 'sign-in') {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) setError(signInError.message);
      // On success the auth listener in AuthProvider redirects us to the library.
    } else {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
      });
      if (signUpError) {
        setError(
          signUpError.message.toLowerCase().includes('not allowed')
            ? 'New accounts are turned off for this app. Ask whoever runs it to enable sign-ups.'
            : signUpError.message
        );
      } else if (!data.session) {
        // Email confirmation is on, so there is no session yet.
        setNotice('Check your email for a confirmation link, then sign in.');
        setMode('sign-in');
      }
    }

    setBusy(false);
  };

  const isSignUp = mode === 'sign-up';

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
                ? 'Create an account to start a shelf, or to join one you have been invited to.'
                : 'Sign in to reach your collection.'}
            </ThemedText>

            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              placeholder="you@example.com"
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
                {isSignUp ? 'Already have an account? Sign in' : 'New here? Create an account'}
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
