import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useUserId } from '@/lib/auth';
import { confirmDestructive } from '@/lib/confirm';
import { inviteUrl } from '@/lib/invites';
import { useLibrary } from '@/lib/library';
import {
  useCreateInvite,
  useCreateLibrary,
  useLeaveLibrary,
  useLibraryInvites,
  useLibraryMembers,
  useRemoveMember,
  useRenameLibrary,
  useRevokeInvite,
} from '@/lib/queries/libraries';
import type { LibraryInvite } from '@/lib/types';

const NEVER = null;
const A_WEEK = 24 * 7;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {title.toUpperCase()}
      </ThemedText>
      {children}
    </View>
  );
}

function expiryLabel(invite: LibraryInvite): string {
  if (!invite.expires_at) return 'Never expires';
  const expires = new Date(invite.expires_at);
  if (expires.getTime() < Date.now()) return 'Expired';
  return `Expires ${expires.toLocaleDateString()}`;
}

export default function ShelfScreen() {
  const theme = useTheme();
  const router = useRouter();
  const userId = useUserId();
  const { memberships, active, activeLibraryId, setActiveLibraryId, loading } = useLibrary();

  const { data: members = [] } = useLibraryMembers(activeLibraryId);
  const { data: invites = [] } = useLibraryInvites(activeLibraryId);
  const createInvite = useCreateInvite(activeLibraryId);
  const revokeInvite = useRevokeInvite(activeLibraryId);
  const removeMember = useRemoveMember(activeLibraryId);
  const renameLibrary = useRenameLibrary();
  const createLibrary = useCreateLibrary();
  const leaveLibrary = useLeaveLibrary();

  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [newShelfName, setNewShelfName] = useState('');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (loading || !active) {
    return (
      <View style={[styles.centered, { backgroundColor: theme.background }]}>
        <ActivityIndicator />
      </View>
    );
  }

  const isOwner = active.role === 'owner';
  const canLeave = members.length > 1;

  const copy = async (token: string) => {
    await Clipboard.setStringAsync(inviteUrl(token));
    setCopiedToken(token);
    setStatus('Link copied to the clipboard.');
  };

  const create = async (ttlHours: number | null) => {
    setError(null);
    setStatus(null);
    try {
      const token = await createInvite.mutateAsync(ttlHours);
      // Creating a link you then have to hunt for is a wasted step, so it goes straight
      // to the clipboard.
      await copy(token);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create an invite link.');
    }
  };

  const revoke = (invite: LibraryInvite) => {
    confirmDestructive(
      'Revoke this link?',
      'Anyone who still has it will no longer be able to join. People who already joined stay on the shelf.',
      () => revokeInvite.mutate(invite.token),
      'Revoke'
    );
  };

  const remove = (memberId: string, email: string | null) => {
    confirmDestructive(
      `Remove ${email ?? 'this person'}?`,
      'They lose access to this shelf. The games they added stay.',
      () => removeMember.mutate(memberId),
      'Remove'
    );
  };

  const saveName = () => {
    const name = draftName.trim();
    setRenaming(false);
    if (name && name !== active.library.name) {
      renameLibrary.mutate({ id: active.library.id, name });
    }
  };

  const addShelf = async () => {
    const name = newShelfName.trim();
    if (!name) return;
    setError(null);
    try {
      const id = await createLibrary.mutateAsync(name);
      setNewShelfName('');
      setActiveLibraryId(id);
      setStatus(`Switched to "${name}".`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create that shelf.');
    }
  };

  const leave = () => {
    confirmDestructive(
      `Leave "${active.library.name}"?`,
      'You will need a new invite link to get back in. Nothing on the shelf is deleted.',
      async () => {
        setError(null);
        try {
          await leaveLibrary.mutateAsync(active.library.id);
          const fallback = memberships.find((m) => m.library.id !== active.library.id);
          if (fallback) setActiveLibraryId(fallback.library.id);
          router.back();
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Could not leave that shelf.');
        }
      },
      'Leave'
    );
  };

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled">
      <Section title="This shelf">
        {renaming ? (
          <View style={styles.row}>
            <Field
              value={draftName}
              onChangeText={setDraftName}
              autoFocus
              onSubmitEditing={saveName}
              containerStyle={styles.flex}
            />
            <Button title="Save" onPress={saveName} />
          </View>
        ) : (
          <View style={styles.row}>
            <ThemedText type="default" style={styles.flex}>
              {active.library.name}
            </ThemedText>
            {isOwner ? (
              <Pressable
                onPress={() => {
                  setDraftName(active.library.name);
                  setRenaming(true);
                }}
                hitSlop={8}
                accessibilityLabel="Rename shelf">
                <ThemedText type="small" themeColor="textSecondary">
                  Rename
                </ThemedText>
              </Pressable>
            ) : null}
          </View>
        )}
        <ThemedText type="small" themeColor="textSecondary">
          {active.library.is_personal ? 'Your own shelf' : 'Shared shelf'} · you are{' '}
          {isOwner ? 'an owner' : 'a member'}
        </ThemedText>
      </Section>

      <Section title={`People (${members.length})`}>
        {members.map((member) => (
          <View
            key={member.user_id}
            style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <View style={styles.flex}>
              <ThemedText type="small">
                {member.email ?? 'Unknown'}
                {member.user_id === userId ? ' (you)' : ''}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {member.role === 'owner' ? 'Owner' : 'Member'}
              </ThemedText>
            </View>
            {isOwner && member.user_id !== userId ? (
              <Pressable
                onPress={() => remove(member.user_id, member.email)}
                hitSlop={8}
                accessibilityLabel={`Remove ${member.email ?? 'member'}`}>
                <Ionicons name="person-remove-outline" size={20} color={theme.danger} />
              </Pressable>
            ) : null}
          </View>
        ))}
      </Section>

      <Section title="Invite links">
        <ThemedText type="small" themeColor="textSecondary">
          Anyone with the link can join this shelf and edit it, so share it the way you would
          share a key.
        </ThemedText>

        <View style={styles.row}>
          <Button
            title="New link · 7 days"
            onPress={() => create(A_WEEK)}
            loading={createInvite.isPending}
            style={styles.flex}
          />
          <Button
            title="New link · no expiry"
            variant="secondary"
            onPress={() => create(NEVER)}
            style={styles.flex}
          />
        </View>

        {invites.length === 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            No active links.
          </ThemedText>
        ) : null}

        {invites.map((invite) => (
          <View
            key={invite.token}
            style={[styles.invite, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
            <ThemedText type="code" selectable numberOfLines={2}>
              {inviteUrl(invite.token)}
            </ThemedText>
            <View style={styles.row}>
              <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
                {expiryLabel(invite)}
              </ThemedText>
              <Pressable onPress={() => copy(invite.token)} hitSlop={8} accessibilityLabel="Copy link">
                <ThemedText type="small" themeColor="tint">
                  {copiedToken === invite.token ? 'Copied' : 'Copy'}
                </ThemedText>
              </Pressable>
              <Pressable onPress={() => revoke(invite)} hitSlop={8} accessibilityLabel="Revoke link">
                <ThemedText type="small" style={{ color: theme.danger }}>
                  Revoke
                </ThemedText>
              </Pressable>
            </View>
          </View>
        ))}
      </Section>

      <Section title="Your shelves">
        {memberships.map((membership) => {
          const selected = membership.library.id === activeLibraryId;
          return (
            <Pressable
              key={membership.library.id}
              onPress={() => setActiveLibraryId(membership.library.id)}
              style={[
                styles.card,
                {
                  backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement,
                  borderColor: selected ? theme.tint : theme.border,
                },
              ]}>
              <View style={styles.flex}>
                <ThemedText type="small">{membership.library.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {membership.library.is_personal ? 'Your own shelf' : 'Shared'}
                  {membership.member_count > 1 ? ` · ${membership.member_count} people` : ''}
                </ThemedText>
              </View>
              {selected ? <Ionicons name="checkmark" size={20} color={theme.tint} /> : null}
            </Pressable>
          );
        })}

        <View style={styles.row}>
          <Field
            value={newShelfName}
            onChangeText={setNewShelfName}
            placeholder="New shelf name"
            onSubmitEditing={addShelf}
            containerStyle={styles.flex}
          />
          <Button
            title="Create"
            onPress={addShelf}
            disabled={!newShelfName.trim()}
            loading={createLibrary.isPending}
          />
        </View>
      </Section>

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

      {!active.library.is_personal ? (
        <Button
          title="Leave this shelf"
          variant="danger"
          onPress={leave}
          disabled={!canLeave}
        />
      ) : null}
      {!active.library.is_personal && !canLeave ? (
        <ThemedText type="small" themeColor="textSecondary">
          You are the only person on this shelf, so there is no one to leave it to.
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
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.three,
  },
  invite: {
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: Spacing.three,
  },
});
