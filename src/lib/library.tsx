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
import { joinShelf, shelfKey, useMyMembership } from '@/lib/queries/libraries';
import type { LibraryRole } from '@/lib/types';

type LibraryState = {
  libraryId: string | null;
  role: LibraryRole | null;
  /** True until we know whether this account is allowed in. Nothing queries before then. */
  loading: boolean;
  /**
   * Set when the account is signed in but not on the allowlist — the message is the one
   * the database gave, naming the username that was refused.
   */
  lockedOut: string | null;
  error: Error | null;
  /** Retries the join, for when someone has just been added to the allowlist. */
  retry: () => void;
};

const LibraryContext = createContext<LibraryState>({
  libraryId: null,
  role: null,
  loading: true,
  lockedOut: null,
  error: null,
  retry: () => {},
});

/**
 * Tagged with the user it was derived for, rather than cleared by an effect when the
 * account changes. Signing out and back in as someone else therefore cannot show the
 * previous user's lockout message.
 */
type ForUser<T> = { userId: string; value: T };

/**
 * There is one shelf, so there is nothing to choose: this resolves whether the signed-in
 * account is on it, and joins it — through the allowlist — if not.
 */
export function LibraryProvider({ children }: { children: ReactNode }) {
  const userId = useUserId();
  const queryClient = useQueryClient();
  const { data: membership, error } = useMyMembership();

  const [refusal, setRefusal] = useState<ForUser<string> | null>(null);
  // One join attempt per account per app run; `retry` bumps this to allow another.
  const attempted = useRef<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const lockedOut = refusal && refusal.userId === userId ? refusal.value : null;

  useEffect(() => {
    if (userId === null || membership === undefined || membership !== null) return;

    const marker = `${userId}:${attempt}`;
    if (attempted.current === marker) return;
    attempted.current = marker;

    joinShelf()
      .then(() => queryClient.invalidateQueries({ queryKey: shelfKey }))
      .catch((e: unknown) =>
        setRefusal({
          userId,
          value: e instanceof Error ? e.message : 'You are not on the shelf.',
        })
      );
  }, [userId, membership, attempt, queryClient]);

  const retry = useCallback(() => {
    setRefusal(null);
    setAttempt((n) => n + 1);
  }, []);

  const value = useMemo<LibraryState>(() => {
    const signedOut = userId === null;
    // `membership === null` means the join above is still in flight; it resolves into
    // either a membership or a refusal.
    const awaitingJoin = membership === null && lockedOut === null;

    return {
      libraryId: membership?.library_id ?? null,
      role: membership?.role ?? null,
      loading: !signedOut && (membership === undefined || awaitingJoin),
      lockedOut,
      error: (error as Error | null) ?? null,
      retry,
    };
  }, [membership, userId, lockedOut, error, retry]);

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary() {
  return useContext(LibraryContext);
}

/** The shelf every games/labels query is scoped to. Null until membership is known. */
export function useLibraryId() {
  return useContext(LibraryContext).libraryId;
}
