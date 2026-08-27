import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ROLE_HINTS, ROLE_LABELS, type LibraryRole } from '@/lib/types';

const ORDER: LibraryRole[] = ['member', 'admin', 'owner'];

type Props = {
  value: LibraryRole;
  onChange: (role: LibraryRole) => void;
  disabled?: boolean;
  /** Drops the explanatory line, for the tight row next to a person's name. */
  compact?: boolean;
};

/** Least to most powerful, left to right, so the safe option is where the eye lands first. */
export function RolePicker({ value, onChange, disabled = false, compact = false }: Props) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <View style={[styles.group, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        {ORDER.map((role) => {
          const selected = role === value;
          return (
            <Pressable
              key={role}
              onPress={() => onChange(role)}
              disabled={disabled}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled }}
              accessibilityLabel={`${ROLE_LABELS[role]} — ${ROLE_HINTS[role]}`}
              style={[
                styles.option,
                compact && styles.optionCompact,
                selected && { backgroundColor: theme.tint },
                disabled && styles.disabled,
              ]}>
              <ThemedText
                type={compact ? 'small' : 'smallBold'}
                style={selected ? { color: theme.tintText } : undefined}
                themeColor={selected ? undefined : 'textSecondary'}>
                {ROLE_LABELS[role]}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      {compact ? null : (
        <ThemedText type="small" themeColor="textSecondary">
          {ROLE_HINTS[value]}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.one,
  },
  group: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: Radius.md,
    padding: 2,
    gap: 2,
  },
  option: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.md - 2,
  },
  optionCompact: {
    paddingVertical: Spacing.one,
  },
  disabled: {
    opacity: 0.5,
  },
});
