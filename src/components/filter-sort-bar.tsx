import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { LabelChip } from '@/components/label-chip';
import { MinStarsChip } from '@/components/min-stars-chip';
import { ThemedText } from '@/components/themed-text';
import { UserHeartChip } from '@/components/user-heart-chip';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  defaultDirectionFor,
  MIN_STARS_OPTIONS,
  SORT_OPTIONS,
  type FilterState,
  type SortKey,
} from '@/lib/filter';
import type { Label } from '@/lib/types';

/** A person who can have hearted something: on the shelf, and signed in at least once. */
export type HeartFilterPerson = { userId: string; name: string };

type Props = {
  labels: Label[];
  /** Shown before the labels, current user first. Empty until the people list loads. */
  people: HeartFilterPerson[];
  state: FilterState;
  onChange: (next: FilterState) => void;
};

export function FilterSortBar({ labels, people, state, onChange }: Props) {
  const theme = useTheme();

  const toggleHeartedBy = (userId: string) => {
    const selected = state.heartedBy.includes(userId);
    onChange({
      ...state,
      heartedBy: selected
        ? state.heartedBy.filter((id) => id !== userId)
        : [...state.heartedBy, userId],
    });
  };

  const toggleLabel = (id: string) => {
    const selected = state.labelIds.includes(id);
    onChange({
      ...state,
      labelIds: selected ? state.labelIds.filter((l) => l !== id) : [...state.labelIds, id],
    });
  };

  // The thresholds nest, so they behave as one choice: a second tap on the active one clears it.
  const toggleMinStars = (minStars: number) => {
    onChange({ ...state, minStars: state.minStars === minStars ? null : minStars });
  };

  // The mode only says something once a group has two pills in it; one pill matches the same either way.
  const showMatchMode = state.labelIds.length > 1 || state.heartedBy.length > 1;

  const setSort = (key: SortKey) => {
    // Tapping the active sort flips direction; tapping a new one opens on whichever end of
    // it is the interesting one.
    onChange(
      key === state.sortKey
        ? { ...state, sortDirection: state.sortDirection === 'asc' ? 'desc' : 'asc' }
        : { ...state, sortKey: key, sortDirection: defaultDirectionFor(key) }
    );
  };

  return (
    <View style={styles.container}>
      {/* Unconditional: the star pills stand on their own, even on a shelf with no labels or people. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}>
        {people.map((person) => (
          <UserHeartChip
            key={person.userId}
            name={person.name}
            selected={state.heartedBy.includes(person.userId)}
            onPress={() => toggleHeartedBy(person.userId)}
          />
        ))}
        {labels.map((label) => (
          <LabelChip
            key={label.id}
            label={label}
            selected={state.labelIds.includes(label.id)}
            onPress={() => toggleLabel(label.id)}
          />
        ))}
        {MIN_STARS_OPTIONS.map((minStars) => (
          <MinStarsChip
            key={minStars}
            minStars={minStars}
            selected={state.minStars === minStars}
            onPress={() => toggleMinStars(minStars)}
          />
        ))}
      </ScrollView>

      <View style={styles.controlsRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {SORT_OPTIONS.map((option) => {
            const active = option.key === state.sortKey;
            return (
              <Pressable
                key={option.key}
                onPress={() => setSort(option.key)}
                style={({ pressed }) => [
                  styles.sortChip,
                  {
                    backgroundColor: active ? theme.backgroundSelected : theme.backgroundElement,
                    borderColor: active ? theme.tint : theme.border,
                  },
                  pressed && styles.pressed,
                ]}>
                <ThemedText type="small" themeColor={active ? 'text' : 'textSecondary'}>
                  {option.label}
                </ThemedText>
                {active ? (
                  <Ionicons
                    name={state.sortDirection === 'asc' ? 'arrow-up' : 'arrow-down'}
                    size={12}
                    color={theme.text}
                  />
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>

        {showMatchMode ? (
          <Pressable
            onPress={() =>
              onChange({ ...state, matchMode: state.matchMode === 'any' ? 'all' : 'any' })
            }
            style={({ pressed }) => [
              styles.sortChip,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border },
              pressed && styles.pressed,
            ]}>
            <ThemedText type="small" themeColor="textSecondary">
              Match {state.matchMode}
            </ThemedText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingRight: Spacing.three,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  sortChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    borderWidth: 1,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
  },
  pressed: {
    opacity: 0.7,
  },
});
