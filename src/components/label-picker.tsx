import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { LabelChip } from '@/components/label-chip';
import { ThemedText } from '@/components/themed-text';
import { LabelColors, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAddLabel, useLabels } from '@/lib/queries/labels';

type Props = {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
};

export function LabelPicker({ selectedIds, onChange }: Props) {
  const theme = useTheme();
  const { data: labels = [] } = useLabels();
  const addLabel = useAddLabel();
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter((l) => l !== id) : [...selectedIds, id]);
  };

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    setError(null);
    try {
      // Cycle the palette so consecutive new labels are visually distinct.
      const color = LabelColors[labels.length % LabelColors.length];
      const label = await addLabel.mutateAsync({ name, color });
      onChange([...selectedIds, label.id]);
      setNewName('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create that label.');
    }
  };

  return (
    <View style={styles.container}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        Labels
      </ThemedText>

      {labels.length ? (
        <View style={styles.chips}>
          {labels.map((label) => (
            <LabelChip
              key={label.id}
              label={label}
              selected={selectedIds.includes(label.id)}
              onPress={() => toggle(label.id)}
            />
          ))}
        </View>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          No labels yet — create one below.
        </ThemedText>
      )}

      <View
        style={[
          styles.newRow,
          { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        ]}>
        <TextInput
          value={newName}
          onChangeText={setNewName}
          onSubmitEditing={create}
          placeholder="New label"
          placeholderTextColor={theme.textSecondary}
          returnKeyType="done"
          style={[styles.input, { color: theme.text }]}
        />
        <Pressable
          onPress={create}
          disabled={!newName.trim() || addLabel.isPending}
          hitSlop={8}
          accessibilityLabel="Create label">
          <Ionicons
            name="add-circle"
            size={24}
            color={newName.trim() ? theme.tint : theme.textSecondary}
          />
        </Pressable>
      </View>

      {error ? (
        <ThemedText type="small" style={{ color: theme.danger }}>
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  newRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.three,
    minHeight: 44,
  },
  input: {
    flex: 1,
    fontSize: 16,
    outlineStyle: 'none',
  } as object,
});
