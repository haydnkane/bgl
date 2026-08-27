import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useUserId } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type { LibraryMembership, LibraryRole, ShelfPerson } from '@/lib/types';
import { normalizeUsername } from '@/lib/username';

/** Invalidation prefix; the live key is scoped to the user — see queries/games.ts for why. */
export const shelfKey = ['shelf'] as const;
export const userShelfKey = (userId: string) => [...shelfKey, userId] as const;
export const peopleKey = ['shelf-people'] as const;

/**
 * The signed-in user's place in the collection, or null if they have none yet.
 *
 * At most one row: there is only ever one library, and one membership of it per person. A
 * null result is the "not allowed in" state, not an error.
 */
export function useMyMembership() {
  const userId = useUserId();
  return useQuery({
    queryKey: userShelfKey(userId ?? 'signed-out'),
    enabled: userId !== null,
    queryFn: async (): Promise<LibraryMembership | null> => {
      const { data, error } = await supabase
        .from('library_members')
        .select('library_id, role, joined_at')
        .eq('user_id', userId!)
        .maybeSingle();
      if (error) throw error;
      return (data as LibraryMembership | null) ?? null;
    },
  });
}

/**
 * Claims the caller's allowlist entry and puts them on the shelf. Idempotent, so the
 * client can call it after every sign-in; it throws when the username is not allowed, and
 * that message is what the locked-out screen shows.
 */
export async function joinShelf(): Promise<string> {
  const { data, error } = await supabase.rpc('join_shelf');
  if (error) throw error;
  return data as string;
}

/** The allowlist: who may use the collection, and which of them have signed in. */
export function useShelfPeople(enabled = true) {
  return useQuery({
    queryKey: peopleKey,
    // Only owners may call the RPC, so asking as anyone else is a guaranteed error.
    enabled,
    queryFn: async (): Promise<ShelfPerson[]> => {
      const { data, error } = await supabase.rpc('list_shelf_people');
      if (error) throw error;
      return (data ?? []) as ShelfPerson[];
    },
  });
}

export function useAllowUser() {
  const queryClient = useQueryClient();
  const userId = useUserId();
  return useMutation({
    mutationFn: async ({ username, role }: { username: string; role: LibraryRole }) => {
      const { error } = await supabase.from('allowed_users').insert({
        username: normalizeUsername(username),
        role,
        // The insert policy requires this to be the caller: an entry always records who
        // let that person in.
        added_by: userId,
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: peopleKey }),
  });
}

/**
 * Changes what someone may do. Goes through an RPC rather than a table write because the
 * role lives in two places — the allowlist and the membership row that RLS reads — and
 * set_person_role() is what keeps them in step.
 */
export function useSetPersonRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ username, role }: { username: string; role: LibraryRole }) => {
      const { error } = await supabase.rpc('set_person_role', {
        uname: username,
        new_role: role,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: peopleKey });
      // Their own role may have changed; the app's affordances follow from it.
      queryClient.invalidateQueries({ queryKey: shelfKey });
    },
  });
}

/**
 * Takes someone off the shelf. A database trigger drops their membership too, so this is
 * the single revoke — there is no separate "remove member".
 */
export function useDisallowUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (username: string) => {
      const { error } = await supabase.from('allowed_users').delete().eq('username', username);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: peopleKey });
      queryClient.invalidateQueries({ queryKey: shelfKey });
    },
  });
}
