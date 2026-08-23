import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Copy .env.example to .env.local, fill in your project values, then restart the dev server.'
  );
}

const isWeb = Platform.OS === 'web';
/** Static web rendering runs this module in Node, where there is no localStorage. */
const isBrowser = isWeb && typeof window !== 'undefined';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // On web, supabase-js defaults to localStorage; on native it needs AsyncStorage.
    // During static web rendering there is no storage at all, so sessions stay in memory.
    storage: isWeb ? (isBrowser ? window.localStorage : undefined) : AsyncStorage,
    persistSession: isWeb ? isBrowser : true,
    autoRefreshToken: true,
    // Only the browser can carry an auth callback in the URL fragment.
    detectSessionInUrl: isBrowser,
  },
});
