import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

/**
 * The URL to send someone.
 *
 * A link is only useful if it opens on the recipient's device, which usually means a
 * browser: they are unlikely to have the app yet. So the deployed web address wins when
 * one is configured, and Linking.createURL — which produces `boardgameshelf://…` on
 * Android — is the last resort rather than the first choice.
 */
export function inviteUrl(token: string): string {
  const configured = process.env.EXPO_PUBLIC_WEB_URL?.trim().replace(/\/+$/, '');
  if (configured) return `${configured}/join/${token}`;

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/join/${token}`;
  }

  return Linking.createURL(`/join/${token}`);
}

const PENDING_KEY = 'boardgame-shelf.pendingInvite';

/**
 * Someone following an invite link usually has no account yet, so the token has to survive
 * the trip through sign-up. AuthGate picks it up once a session exists.
 */
export function rememberPendingInvite(token: string): Promise<void> {
  return AsyncStorage.setItem(PENDING_KEY, token).catch(() => {});
}

/** Reads and clears the pending token, so a stale one never hijacks a later sign-in. */
export async function takePendingInvite(): Promise<string | null> {
  try {
    const token = await AsyncStorage.getItem(PENDING_KEY);
    if (token) await AsyncStorage.removeItem(PENDING_KEY);
    return token;
  } catch {
    return null;
  }
}

export function clearPendingInvite(): Promise<void> {
  return AsyncStorage.removeItem(PENDING_KEY).catch(() => {});
}
