import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  minStars: number;
  selected: boolean;
  onPress: () => void;
};

/**
 * Library filter: "show me the games somebody rated this well". Anyone's stars count, so a
 * game a housemate loved surfaces even when the viewer has never scored it.
 */
export function MinStarsChip({ minStars, selected, onPress }: Props) {
  const theme = useTheme();
  // Five is the top of the scale, so "5+" would promise a rating that cannot exist.
  const text = minStars >= 5 ? '5' : `${minStars}+`;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`Games rated ${text} stars or better by anyone`}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? theme.backgroundSelected : theme.backgroundElement,
          borderColor: selected ? theme.star : theme.border,
        },
        pressed && styles.pressed,
      ]}>
      <Ionicons
        name={selected ? 'star' : 'star-outline'}
        size={14}
        color={selected ? theme.star : theme.textSecondary}
      />
      <ThemedText type="small" themeColor={selected ? 'text' : 'textSecondary'}>
        {text}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
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
