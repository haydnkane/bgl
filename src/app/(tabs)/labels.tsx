import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/button';
import { EmptyState } from '@/components/empty-state';
import { Field } from '@/components/field';
import { ThemedText } from '@/components/themed-text';
import { LabelColors, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { confirmDestructive } from '@/lib/confirm';
import { useLibrary } from '@/lib/library';
import { useAddLabel, useDeleteLabel, useLabels, useUpdateLabel } from '@/lib/queries/labels';
import { useGames } from '@/lib/queries/games';
import type { Label } from '@/lib/types';

function ColorSwatches({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const theme = useTheme();
  return (
    <View style={styles.swatches}>
      {LabelColors.map((color) => (
        <Pressable
          key={color}
          onPress={() => onChange(color)}
          accessibilityLabel={`Use colour ${color}`}
          style={[
            styles.swatch,
            { backgroundColor: color, borderColor: value === color ? theme.text : 'transparent' },
          ]}
        />
      ))}
    </View>
  );
}

function LabelRow({ label, usageCount }: { label: Label; usageCount: number }) {
  const theme = useTheme();
  const updateLabel = useUpdateLabel();
  const deleteLabel = useDeleteLabel();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(label.name);

  const save = () => {
    if (name.trim() && name.trim() !== label.name) {
      updateLabel.mutate({ id: label.id, name });
    } else {
      setName(label.name);
    }
    setEditing(false);
  };

  const remove = () => {
    confirmDestructive(
      `Delete "${label.name}"?`,
      usageCount > 0
        ? `It will be removed from ${usageCount} game${usageCount === 1 ? '' : 's'}. The games themselves are kept.`
        : 'This label is not used by any game.',
      () => deleteLabel.mutate(label.id)
    );
  };

  return (
    <View style={[styles.row, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      <View style={styles.rowMain}>
        <View style={styles.nameRow}>
          <View style={[styles.dot, { backgroundColor: label.color }]} />
          {editing ? (
            <TextInput
              value={name}
              onChangeText={setName}
              onBlur={save}
              onSubmitEditing={save}
              autoFocus
              style={[styles.nameInput, { color: theme.text }]}
            />
          ) : (
            <Pressable onPress={() => setEditing(true)} style={styles.nameInput}>
              <ThemedText type="default" style={styles.nameText}>
                {label.name}
              </ThemedText>
            </Pressable>
          )}
        </View>

        <ThemedText type="small" themeColor="textSecondary">
          {usageCount} game{usageCount === 1 ? '' : 's'}
        </ThemedText>

        <ColorSwatches value={label.color} onChange={(color) => updateLabel.mutate({ id: label.id, color })} />
      </View>

      <Pressable onPress={remove} hitSlop={8} accessibilityLabel={`Delete ${label.name}`}>
        <Ionicons name="trash-outline" size={20} color={theme.danger} />
      </Pressable>
    </View>
  );
}

export default function LabelsScreen() {
  const theme = useTheme();
  const { loading: libraryLoading } = useLibrary();
  const { data: labels = [], isLoading: labelsLoading } = useLabels();
  const { data: games = [] } = useGames();
  // The labels query has not run until membership is known — see (tabs)/index.tsx.
  const isLoading = libraryLoading || labelsLoading;
  const addLabel = useAddLabel();

  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<string>(LabelColors[0]);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!newName.trim()) return;
    setError(null);
    try {
      await addLabel.mutateAsync({ name: newName, color: newColor });
      setNewName('');
      setNewColor(LabelColors[(labels.length + 1) % LabelColors.length]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create that label.');
    }
  };

  const usage = (labelId: string) => games.filter((game) => game.labelIds.includes(labelId)).length;

  return (
    <FlatList
      style={{ backgroundColor: theme.background }}
      data={labels}
      keyExtractor={(label) => label.id}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <View style={styles.createBlock}>
          <Field label="New label" value={newName} onChangeText={setNewName} placeholder="Co-op" />
          <ColorSwatches value={newColor} onChange={setNewColor} />
          {error ? (
            <ThemedText type="small" style={{ color: theme.danger }}>
              {error}
            </ThemedText>
          ) : null}
          <Button
            title="Add label"
            onPress={create}
            disabled={!newName.trim()}
            loading={addLabel.isPending}
          />
        </View>
      }
      ListEmptyComponent={
        isLoading ? null : (
          <EmptyState
            icon="pricetags-outline"
            title="No labels yet"
            message="Labels are how you filter the shelf — try Co-op, Heavy, or Two player."
          />
        )
      }
      renderItem={({ item }) => <LabelRow label={item} usageCount={usage(item.id)} />}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    padding: Spacing.three,
    gap: Spacing.two,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  createBlock: {
    gap: Spacing.three,
    marginBottom: Spacing.four,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderWidth: 1,
    borderRadius: Radius.lg,
    padding: Spacing.three,
  },
  rowMain: {
    flex: 1,
    gap: Spacing.two,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  nameInput: {
    flex: 1,
    fontSize: 16,
    outlineStyle: 'none',
  } as object,
  nameText: {
    fontWeight: '600',
  },
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  swatch: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
  },
});
