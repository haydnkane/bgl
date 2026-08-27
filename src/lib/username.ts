/**
 * Usernames.
 *
 * Supabase Auth identifies an account by email address, but nobody in a family needs a
 * mailbox to reach a shelf. So a username is turned into an address in a domain that can
 * never exist, and that address is what Auth stores. Nothing is ever sent to it — email
 * confirmation has to stay switched off in the Supabase dashboard for this to work.
 *
 * `.invalid` is reserved by RFC 2606 precisely so it can never be registered.
 *
 * The database holds the same constant in `public.username_domain()` (see
 * supabase/migrations/0005_single_shelf.sql). Change one and you must change the other, or
 * accounts stop matching their allowlist entries.
 */
export const USERNAME_DOMAIN = 'shelf.invalid';

/** Lowercase, no surrounding space. Everything else compares against this form. */
export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase();
}

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{1,31}$/;

/** Mirrors the check constraint on `allowed_users.username`. */
export function isValidUsername(input: string): boolean {
  return USERNAME_PATTERN.test(normalizeUsername(input));
}

/** Why a username was rejected, in the words the sign-in screen shows. */
export function usernameProblem(input: string): string | null {
  const name = normalizeUsername(input);
  if (name.length === 0) return 'Enter a username.';
  if (name.length < 2) return 'A username needs at least two characters.';
  if (name.length > 32) return 'A username can be at most 32 characters.';
  if (!USERNAME_PATTERN.test(name)) {
    return 'Use letters, numbers, dots, dashes and underscores, starting with a letter or number.';
  }
  return null;
}

/**
 * What to hand Supabase Auth.
 *
 * An input containing `@` is passed through as a real address, so the accounts that
 * existed before usernames keep working — `public.shelf_username()` resolves both forms to
 * the same allowlist key.
 */
export function toAuthEmail(input: string): string {
  const name = normalizeUsername(input);
  return name.includes('@') ? name : `${name}@${USERNAME_DOMAIN}`;
}

/** The inverse, for showing an account back to its owner. */
export function fromAuthEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const address = email.toLowerCase();
  const [local, domain] = address.split('@');
  return domain === USERNAME_DOMAIN ? local : address;
}
