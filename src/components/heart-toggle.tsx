import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

type Props = {
  value: boolean;
  /** Omit to render a plain read-out of someone else's heart. */
  onChange?: (hearted: boolean) => void;
  size?: number;
  /** Whose heart this is, for the screen reader. */
  accessibilityName?: string;
};

/** The "I love this one" heart. Separate from the stars: a favourite is not a score. */
export function HeartToggle({ value, onChange, size = 28, accessibilityName }: Props) {
  const theme = useTheme();

  const icon = (
    <Ionicons
      name={value ? 'heart' : 'heart-outline'}
      size={size}
      color={value ? theme.heart : theme.border}
    />
  );

  if (!onChange) {
    return (
      <View
        accessibilityRole="text"
        accessibilityLabel={accessibilityName ? `${accessibilityName} loves this` : 'Loved'}>
        {icon}
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => onChange(!value)}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityState={{ selected: value }}
      accessibilityLabel={value ? 'Remove from your loved games' : 'Add to your loved games'}
      style={({ pressed }) => (pressed ? styles.pressed : undefined)}>
      {icon}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.6,
  },
});
