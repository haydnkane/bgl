import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { useUserId } from '@/lib/auth';
import { ensurePersonalLibrary, librariesKey, useMyLibraries } from '@/lib/queries/libraries';
import type { LibraryMembership } from '@/lib/types';

/** Per user, so two accounts on one device do not inherit each other's choice. */
const storageKey = (userId: string) => `boardgame-shelf.activeLibrary.${userId}`;

type LibraryState = {
  memberships: LibraryMembership[];
  active: LibraryMembership | null;
  activeLibraryId: string | null;
  setActiveLibraryId: (id: string) => void;
  /** True until we know which shelf to show. Games and labels do not query before then. */
  loading: boolean;
  error: Error | null;
};

const LibraryContext = createContext<LibraryState>({
  memberships: [],
  active: null,
  activeLibraryId: null,
  setActiveLibraryId: () => {},
  loading: true,
  error: null,
});

/**
 * Both pieces of local state below are tagged with the user they were derived for, rather
 * than being cleared by an effect when the account changes. Signing out and back in as
 * someone else therefore cannot leave the previous user's shelf briefly selected.
 */
type ForUser<T> = { userId: string; value: T };

export function LibraryProvider({ children }: { children: ReactNode }) {
  const userId = useUserId();
  const queryClient = useQueryClient();
  const { data: memberships, error } = useMyLibraries();

  const [stored, setStored] = useState<ForUser<string | null> | null>(null);
  const [bootstrapFailure, setBootstrapFailure] = useState<ForUser<Error> | null>(null);
  const bootstrapped = useRef<string | null>(null);

  const storageRead = stored !== null && stored.userId === userId;
  const storedId = storageRead ? stored.value : null;
  const bootstrapError =
    bootstrapFailure && bootstrapFailure.userId === userId ? bootstrapFailure.value : null;

  // Read the remembered shelf. Nothing queries until this has resolved, so signing in
  // never loads the wrong shelf first.
  useEffect(() => {
    if (userId === null) return;

    let cancelled = false;
    AsyncStorage.getItem(storageKey(userId))
      .then((value) => {
        if (!cancelled) setStored({ userId, value });
      })
      .catch(() => {
        // An unreadable preference should fall back to the default shelf, not hang.
        if (!cancelled) setStored({ userId, value: null });
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  // A user who has never opened the app, or who has left every shared shelf, has no
  // library at all. Give them their personal one.
  useEffect(() => {
    if (userId === null || memberships === undefined || memberships.length > 0) return;
    if (bootstrapped.current === userId) return;
    bootstrapped.current = userId;

    ensurePersonalLibrary()
      .then(() => queryClient.invalidateQueries({ queryKey: librariesKey }))
      .catch((e: unknown) =>
        setBootstrapFailure({
          userId,
          value: e instanceof Error ? e : new Error('Could not create your shelf.'),
        })
      );
  }, [userId, memberships, queryClient]);

  const activeLibraryId = useMemo(() => {
    if (!storageRead || !memberships || memberships.length === 0) return null;
    if (storedId && memberships.some((m) => m.library.id === storedId)) return storedId;
    // Falls back to the personal shelf — including when the remembered one was a shared
    // shelf the user has since left, or been removed from.
    return (memberships.find((m) => m.library.is_personal) ?? memberships[0]).library.id;
  }, [memberships, storedId, storageRead]);

  const setActiveLibraryId = useCallback(
    (id: string) => {
      if (userId === null) return;
      setStored({ userId, value: id });
      AsyncStorage.setItem(storageKey(userId), id).catch(() => {});
    },
    [userId]
  );

  const value = useMemo<LibraryState>(() => {
    const list = memberships ?? [];
    const signedOut = userId === null;
    const awaitingBootstrap = list.length === 0 && bootstrapError === null;

    return {
      memberships: list,
      active: list.find((m) => m.library.id === activeLibraryId) ?? null,
      activeLibraryId,
      setActiveLibraryId,
      loading: !signedOut && (!storageRead || memberships === undefined || awaitingBootstrap),
      error: bootstrapError ?? (error as Error | null),
    };
  }, [memberships, userId, activeLibraryId, setActiveLibraryId, storageRead, bootstrapError, error]);

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary() {
  return useContext(LibraryContext);
}

/** The shelf every games/labels query is scoped to. Null until one is known. */
export function useActiveLibraryId() {
  return useContext(LibraryContext).activeLibraryId;
}
