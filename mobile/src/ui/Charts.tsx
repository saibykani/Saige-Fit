import React, { useEffect, useMemo, useState } from 'react';
import { View, LayoutChangeEvent } from 'react-native';
import Svg, { Defs, G, Line, LinearGradient, Path, Rect, Stop, Circle, Text as SvgText } from 'react-native-svg';
import Animated, { Easing, useAnimatedProps, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useTheme } from '@/theme/ThemeProvider';

const APath = Animated.createAnimatedComponent(Path);
const ARect = Animated.createAnimatedComponent(Rect);

export type Point = { x: number; y: number; label?: string };

function smooth(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M${pts[0].x},${pts[0].y}`;
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
  }
  return d;
}

/** Smooth area/line chart whose stroke draws itself in. `data` = plain numbers (null = gap) with optional x labels. */
export function AreaChart({ data, labels, height = 160, color, unit = '', yPad = 0.1, goal }: {
  data: (number | null)[]; labels?: string[]; height?: number; color?: string; unit?: string; yPad?: number; goal?: number;
}) {
  const t = useTheme();
  const [w, setW] = useState(0);
  const col = color ?? t.accent;
  const progress = useSharedValue(0);
  const key = data.join(',');
  useEffect(() => {
    progress.value = 0;
    progress.value = withDelay(150, withTiming(1, { duration: 1300, easing: Easing.out(Easing.cubic) }));
  }, [key, progress]);
  const pad = { l: 8, r: 8, t: 14, b: labels ? 22 : 8 };
  const geo = useMemo(() => {
    const vals = data.filter((v): v is number => v !== null);
    if (!w || vals.length === 0) return null;
    let lo = Math.min(...vals, ...(goal !== undefined ? [goal] : []));
    let hi = Math.max(...vals, ...(goal !== undefined ? [goal] : []));
    if (hi === lo) { hi += 1; lo -= 1; }
    const span = hi - lo;
    lo -= span * yPad; hi += span * yPad;
    const iw = w - pad.l - pad.r, ih = height - pad.t - pad.b;
    const n = data.length;
    const X = (i: number) => pad.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
    const Y = (v: number) => pad.t + ih - ((v - lo) / (hi - lo)) * ih;
    const pts = data.map((v, i) => (v === null ? null : { x: X(i), y: Y(v) })).filter(Boolean) as { x: number; y: number }[];
    const line = smooth(pts);
    const area = pts.length > 1 ? `${line} L${pts[pts.length - 1].x},${height - pad.b} L${pts[0].x},${height - pad.b} Z` : '';
    return { pts, line, area, goalY: goal !== undefined ? Y(goal) : null, X };
  }, [data, w, height, goal, yPad]);

  const lineProps = useAnimatedProps(() => ({ strokeDashoffset: 1 - progress.value }));
  const fillProps = useAnimatedProps(() => ({ opacity: progress.value * 0.9 }));
  const last = geo?.pts[geo.pts.length - 1];
  const gid = useMemo(() => `a${Math.random().toString(36).slice(2, 8)}`, []);

  return (
    <View onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)} style={{ height }}>
      {geo && (
        <Svg width={w} height={height}>
          <Defs>
            <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={col} stopOpacity={0.35} />
              <Stop offset="1" stopColor={col} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          {[0.25, 0.5, 0.75].map((f) => (
            <Line key={f} x1={pad.l} x2={w - pad.r} y1={pad.t + (height - pad.t - pad.b) * f} y2={pad.t + (height - pad.t - pad.b) * f}
              stroke={t.border} strokeWidth={1} />
          ))}
          {geo.goalY !== null && (
            <Line x1={pad.l} x2={w - pad.r} y1={geo.goalY} y2={geo.goalY} stroke={t.textFaint} strokeDasharray="4 5" strokeWidth={1} />
          )}
          {geo.area ? <APath d={geo.area} fill={`url(#${gid})`} animatedProps={fillProps} /> : null}
          <APath d={geo.line} stroke={col} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round"
            {...({ pathLength: 1 } as any)} strokeDasharray="1" animatedProps={lineProps} />
          {last && <Circle cx={last.x} cy={last.y} r={5} fill={col} stroke={t.bg} strokeWidth={2} />}
          {labels && labels.map((l, i) => (
            (labels.length <= 8 || i % Math.ceil(labels.length / 6) === 0) ?
              <SvgText key={i} x={geo.X(i)} y={height - 5} fill={t.textFaint} fontSize={10} textAnchor="middle">{l}</SvgText> : null
          ))}
        </Svg>
      )}
    </View>
  );
}

/** Bars that grow in with a stagger. Optional target line. */
export function BarChart({ data, labels, height = 150, color, target, highlightLast = true }: {
  data: number[]; labels?: string[]; height?: number; color?: string; target?: number; highlightLast?: boolean;
}) {
  const t = useTheme();
  const [w, setW] = useState(0);
  const col = color ?? t.accent;
  const max = Math.max(1, ...data, target ?? 0) * 1.1;
  const pad = { t: 8, b: labels ? 22 : 4 };
  const ih = height - pad.t - pad.b;
  const bw = w && data.length ? Math.min(34, (w / data.length) * 0.58) : 0;
  const step = w && data.length ? w / data.length : 0;
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height }}>
      {w > 0 && (
        <Svg width={w} height={height}>
          {target !== undefined && (
            <Line x1={0} x2={w} y1={pad.t + ih - (target / max) * ih} y2={pad.t + ih - (target / max) * ih}
              stroke={t.textFaint} strokeDasharray="4 5" strokeWidth={1} />
          )}
          {data.map((v, i) => (
            <Bar key={i} x={i * step + (step - bw) / 2} bw={bw} base={pad.t + ih} h={(v / max) * ih} i={i}
              fill={highlightLast && i !== data.length - 1 ? t.surfaceAlt : col} />
          ))}
          {labels?.map((l, i) => (
            <SvgText key={i} x={i * step + step / 2} y={height - 5} fill={t.textFaint} fontSize={10} textAnchor="middle">{l}</SvgText>
          ))}
        </Svg>
      )}
    </View>
  );
}

function Bar({ x, bw, base, h, i, fill }: { x: number; bw: number; base: number; h: number; i: number; fill: string }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = 0;
    p.value = withDelay(i * 60, withTiming(1, { duration: 700, easing: Easing.out(Easing.back(1.4)) }));
  }, [h, i, p]);
  const props = useAnimatedProps(() => ({ y: base - h * p.value, height: Math.max(0, h * p.value) }));
  return <ARect x={x} width={bw} rx={Math.min(8, bw / 2)} fill={fill} animatedProps={props} />;
}

/** Tiny inline sparkline. */
export function Sparkline({ data, width = 80, height = 28, color }: { data: number[]; width?: number; height?: number; color?: string }) {
  const t = useTheme();
  if (data.length < 2) return <View style={{ width, height }} />;
  const lo = Math.min(...data), hi = Math.max(...data), span = hi - lo || 1;
  const pts = data.map((v, i) => ({ x: (i / (data.length - 1)) * width, y: height - 3 - ((v - lo) / span) * (height - 6) }));
  return <Svg width={width} height={height}><G><Path d={smooth(pts)} stroke={color ?? t.accent} strokeWidth={2} fill="none" strokeLinecap="round" /></G></Svg>;
}
