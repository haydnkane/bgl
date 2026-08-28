import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const STARS = [1, 2, 3, 4, 5];

type Props = {
  /** 1-5, or null for unrated. */
  value: number | null;
  /**
   * Omit to render a plain read-out. When given, every star is tappable — the fifth is
   * five, the first is one — and tapping the current score clears it, which is the only
   * way back to unrated.
   */
  onChange?: (stars: number | null) => void;
  size?: number;
  /** Whose score this is, for the screen reader: "Your rating", "sam's rating". */
  accessibilityName?: string;
};

/** Five stars, filled up to `value`. Interactive when `onChange` is given. */
export function StarRating({ value, onChange, size = 28, accessibilityName }: Props) {
  const theme = useTheme();
  const gap = size >= 20 ? Spacing.one : 0;

  return (
    <View
      style={[styles.row, { gap }]}
      accessibilityRole={onChange ? undefined : 'text'}
      accessibilityLabel={
        accessibilityName
          ? `${accessibilityName}: ${value === null ? 'not rated' : `${value} of 5`}`
          : undefined
      }>
      {STARS.map((star) => {
        const filled = value !== null && star <= value;
        const icon = (
          <Ionicons
            name={filled ? 'star' : 'star-outline'}
            size={size}
            color={filled ? theme.star : theme.border}
          />
        );

        if (!onChange) return <View key={star}>{icon}</View>;
        return (
          <Pressable
            key={star}
            // Tapping the star you already gave takes the rating away again.
            onPress={() => onChange(value === star ? null : star)}
            hitSlop={size >= 20 ? 4 : 0}
            accessibilityRole="button"
            accessibilityState={{ selected: filled }}
            accessibilityLabel={`Rate ${star} of 5`}
            style={({ pressed }) => (pressed ? styles.pressed : undefined)}>
            {icon}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
});
