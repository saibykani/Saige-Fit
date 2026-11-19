import React, { useEffect } from 'react';
import { View } from 'react-native';
import Svg, { ClipPath, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import Animated, { Easing, useAnimatedProps, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';
import { AnimatedNumber, Text } from '@/ui';

const APath = Animated.createAnimatedComponent(Path);
const W = 210;
const H = 270;
const R = 38;

/** Glass that fills with a gently sloshing wave. */
export function WaterGlass({ value, target }: { value: number; target: number }) {
  const t = useTheme();
  const pct = target > 0 ? Math.min(1, value / target) : 0;
  const level = useSharedValue(0);
  const phase = useSharedValue(0);

  useEffect(() => { phase.value = withRepeat(withTiming(Math.PI * 2, { duration: 2800, easing: Easing.linear }), -1); }, [phase]);
  useEffect(() => { level.value = withTiming(pct, { duration: 1300, easing: Easing.out(Easing.cubic) }); }, [pct, level]);

  const wave = (offset: number, amp: number) => () => {
    'worklet';
    const y0 = H - level.value * (H - 8);
    const a = amp * Math.min(1, level.value * 8);
    let d = `M0 ${H} L0 ${y0}`;
    for (let x = 0; x <= W; x += 6) d += ` L${x} ${y0 + Math.sin((x / W) * Math.PI * 2 + phase.value + offset) * a}`;
    return { d: `${d} L${W} ${H} Z` };
  };
  const back = useAnimatedProps(wave(1.6, 8));
  const front = useAnimatedProps(wave(0, 6));

  return (
    <View style={{ width: W, height: H, alignSelf: 'center' }} accessible accessibilityLabel={`${Math.round(value)} of ${Math.round(target)} millilitres`}>
      <Svg width={W} height={H}>
        <Defs>
          <ClipPath id="glass"><Rect x={0} y={0} width={W} height={H} rx={R} /></ClipPath>
          <LinearGradient id="wf" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={t.water} stopOpacity={0.95} />
            <Stop offset="1" stopColor={t.accent2} stopOpacity={0.9} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={W} height={H} rx={R} fill={t.surfaceAlt} />
        <APath clipPath="url(#glass)" fill={t.water} fillOpacity={0.4} animatedProps={back} />
        <APath clipPath="url(#glass)" fill="url(#wf)" animatedProps={front} />
        <Rect x={1.5} y={1.5} width={W - 3} height={H - 3} rx={R} fill="none" stroke={t.border} strokeWidth={3} />
      </Svg>
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
        <AnimatedNumber value={Math.round(pct * 100)} suffix="%" style={{ fontSize: 52, color: '#fff', textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 8, textShadowOffset: { width: 0, height: 1 } }} />
        <Text v="caption" style={{ color: '#fff', textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 6 }}>{Math.round(value)} / {Math.round(target)} ml</Text>
      </View>
    </View>
  );
}
