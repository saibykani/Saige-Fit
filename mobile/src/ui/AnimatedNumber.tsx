import React, { useEffect } from 'react';
import { StyleProp, TextInput, TextStyle } from 'react-native';
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/tokens';

const ATextInput = Animated.createAnimatedComponent(TextInput);

/** Number that counts up/down smoothly whenever `value` changes. Runs on the UI thread. */
export function AnimatedNumber({ value, decimals = 0, suffix = '', prefix = '', style, duration = 900 }: {
  value: number; decimals?: number; suffix?: string; prefix?: string; style?: StyleProp<TextStyle>; duration?: number;
}) {
  const t = useTheme();
  const sv = useSharedValue(0);
  useEffect(() => {
    sv.value = withTiming(value, { duration, easing: Easing.out(Easing.cubic) });
  }, [value, duration, sv]);
  const props = useAnimatedProps(() => {
    const text = `${prefix}${sv.value.toFixed(decimals)}${suffix}`;
    return { text, defaultValue: text } as any;
  });
  return (
    <ATextInput
      editable={false}
      pointerEvents="none"
      underlineColorAndroid="transparent"
      defaultValue={`${prefix}${value.toFixed(decimals)}${suffix}`}
      animatedProps={props}
      style={[{ fontFamily: fonts.display, fontSize: 28, color: t.text, padding: 0, margin: 0 }, style]}
    />
  );
}
