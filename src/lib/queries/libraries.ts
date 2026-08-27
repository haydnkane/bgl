import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useUserId } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import type {
  InvitePreview,
  Library,
  LibraryInvite,
  LibraryMember,
  LibraryMembership,
  LibraryRole,
} from '@/lib/types';

/** Invalidation prefix; live keys are scoped below — see queries/games.ts for why. */
export const librariesKey = ['libraries'] as const;
export const userLibrariesKey = (userId: string) => [...librariesKey, userId] as const;
export const membersKey = (libraryId: string) => ['library-members', libraryId] as const;
export const invitesKey = (libraryId: string) => ['library-invites', libraryId] as const;

type MembershipRow = {
  role: LibraryRole;
  joined_at: string;
  /** `library_members(count)` comes back as a one-element array of aggregates. */
  libraries: (Library & { library_members: { count: number }[] }) | null;
};

/** Every shelf the signed-in user belongs to: their own, plus any they have joined. */
export function useMyLibraries() {
  const userId = useUserId();
  return useQuery({
    queryKey: userLibrariesKey(userId ?? 'signed-out'),
    enabled: userId !== null,
    queryFn: async (): Promise<LibraryMembership[]> => {
      const { data, error } = await supabase
        .from('library_members')
        .select(
          'role, joined_at, libraries(id, name, created_by, is_personal, created_at, library_members(count))'
        )
        .eq('user_id', userId!);
      if (error) throw error;

      return (data as unknown as MembershipRow[])
        .filter((row) => row.libraries !== null)
        .map((row) => {
          const { library_members, ...library } = row.libraries!;
          return {
            library,
            role: row.role,
            joined_at: row.joined_at,
            member_count: library_members[0]?.count ?? 1,
          };
        })
        // Your own shelf first, then joined ones alphabetically — a stable order that does
        // not shuffle when someone renames a shelf you are on.
        .sort((a, b) => {
          if (a.library.is_personal !== b.library.is_personal) return a.library.is_personal ? -1 : 1;
          return a.library.name.localeCompare(b.library.name, undefined, { sensitivity: 'base' });
        });
    },
  });
}

/**
 * Creates the caller's personal shelf if they have none. Safe to call repeatedly: the
 * function is idempotent server-side.
 */
export async function ensurePersonalLibrary(): Promise<string> {
  const { data, error } = await supabase.rpc('ensure_personal_library');
  if (error) throw error;
  return data as string;
}

export function useCreateLibrary() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string): Promise<string> => {
      const { data, error } = await supabase.rpc('create_library', { name });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: librariesKey }),
  });
}

export function useRenameLibrary() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { error } = await supabase.from('libraries').update({ name: name.trim() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: librariesKey }),
  });
}

export function useLibraryMembers(libraryId: string | null) {
  return useQuery({
    queryKey: membersKey(libraryId ?? 'none'),
    enabled: libraryId !== null,
    queryFn: async (): Promise<LibraryMember[]> => {
      const { data, error } = await supabase.rpc('list_library_members', { lib: libraryId });
      if (error) throw error;
      return (data ?? []) as LibraryMember[];
    },
  });
}

export function useRemoveMember(libraryId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from('library_members')
        .delete()
        .eq('library_id', libraryId!)
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: membersKey(libraryId ?? 'none') }),
  });
}

/** Invite links that have not been revoked. Expired ones are kept so the UI can say so. */
export function useLibraryInvites(libraryId: string | null) {
  return useQuery({
    queryKey: invitesKey(libraryId ?? 'none'),
    enabled: libraryId !== null,
    queryFn: async (): Promise<LibraryInvite[]> => {
      const { data, error } = await supabase
        .from('library_invites')
        .select('*')
        .eq('library_id', libraryId!)
        .is('revoked_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as LibraryInvite[];
    },
  });
}

export function useCreateInvite(libraryId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ttlHours: number | null): Promise<string> => {
      const { data, error } = await supabase.rpc('create_library_invite', {
        lib: libraryId,
        ttl_hours: ttlHours,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: invitesKey(libraryId ?? 'none') }),
  });
}

export function useRevokeInvite(libraryId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (token: string) => {
      const { error } = await supabase
        .from('library_invites')
        .update({ revoked_at: new Date().toISOString() })
        .eq('token', token);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: invitesKey(libraryId ?? 'none') }),
  });
}

/**
 * What an invite link points at, resolved without joining. Runs signed out too — it is
 * what the join screen shows a visitor before they have an account.
 */
export function useInvitePreview(token: string | undefined) {
  const userId = useUserId();
  return useQuery({
    // Keyed on the user as well: "already_member" depends on who is asking.
    queryKey: ['invite-preview', token, userId] as const,
    enabled: !!token,
    retry: false,
    queryFn: async (): Promise<InvitePreview | null> => {
      const { data, error } = await supabase.rpc('library_invite_preview', { tok: token });
      if (error) throw error;
      const rows = (data ?? []) as InvitePreview[];
      // No row means no such token. Deliberately indistinguishable from a typo.
      return rows[0] ?? null;
    },
  });
}

export function useRedeemInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (token: string): Promise<string> => {
      const { data, error } = await supabase.rpc('redeem_library_invite', { tok: token });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: librariesKey }),
  });
}

export function useLeaveLibrary() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (libraryId: string) => {
      const { error } = await supabase.rpc('leave_library', { lib: libraryId });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: librariesKey }),
  });
}
