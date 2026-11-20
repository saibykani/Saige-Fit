import React, { useEffect } from 'react';
import { Platform, StyleProp, Text, TextInput, TextStyle } from 'react-native';
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { fonts } from '@/theme/tokens';

const ATextInput = Animated.createAnimatedComponent(TextInput);

/** Number that counts up/down smoothly whenever `value` changes. Runs on the UI thread. */
type Props = { value: number; decimals?: number; suffix?: string; prefix?: string; style?: StyleProp<TextStyle>; duration?: number };

export function AnimatedNumber(props: Props) {
  // Browsers ignore the animated `text` prop on TextInput, so on web show the final value directly.
  return Platform.OS === 'web' ? <StaticNumber {...props} /> : <NativeAnimatedNumber {...props} />;
}

function StaticNumber({ value, decimals = 0, suffix = '', prefix = '', style }: Props) {
  const t = useTheme();
  return <Text style={[{ fontFamily: fonts.display, fontSize: 28, color: t.text }, style]}>{`${prefix}${(Number(value) || 0).toFixed(decimals)}${suffix}`}</Text>;
}

function NativeAnimatedNumber({ value, decimals = 0, suffix = '', prefix = '', style, duration = 900 }: Props) {
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
