/**
 * SVG-based chart components for mobile reports.
 * Uses react-native-svg directly (victory-native uses Skia which is incompatible with Expo SDK 54 / React 19).
 */
import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Svg, { Rect, Line, Text as SvgText, G } from 'react-native-svg';

const W = Dimensions.get('window').width;
const CHART_WIDTH = W - 64;
const CHART_HEIGHT = 180;
const BAR_GAP = 4;

// ---- Bar Chart ----
export interface BarChartData {
  labels: string[];
  series: { label: string; data: number[]; color: string }[];
}

export function BarChart({ data, title }: { data: BarChartData; title?: string }) {
  const { labels, series } = data;
  if (!labels.length) return null;

  const allValues = series.flatMap(s => s.data);
  const maxVal = Math.max(...allValues, 1);
  const groupWidth = (CHART_WIDTH - 32) / labels.length;
  const barWidth = Math.max(4, (groupWidth - BAR_GAP * (series.length + 1)) / series.length);
  const chartInnerHeight = CHART_HEIGHT - 40;

  return (
    <View style={$styles.chartWrap}>
      {title && <Text style={$styles.chartTitle}>{title}</Text>}
      <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
        {/* Y-axis grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((frac, i) => {
          const y = 8 + chartInnerHeight * (1 - frac);
          const val = Math.round(maxVal * frac);
          return (
            <G key={i}>
              <Line x1={28} y1={y} x2={CHART_WIDTH - 4} y2={y} stroke="rgba(112,143,150,0.15)" strokeWidth={1} />
              <SvgText x={24} y={y + 4} fontSize={9} fill="#708F96" textAnchor="end">{val}</SvgText>
            </G>
          );
        })}
        {/* Bars */}
        {labels.map((label, li) => {
          const groupX = 28 + BAR_GAP + li * groupWidth;
          return (
            <G key={li}>
              {series.map((s, si) => {
                const barHeight = Math.max(2, (s.data[li] / maxVal) * chartInnerHeight);
                const barX = groupX + si * (barWidth + 2);
                const barY = 8 + chartInnerHeight - barHeight;
                return (
                  <Rect
                    key={si}
                    x={barX}
                    y={barY}
                    width={barWidth}
                    height={barHeight}
                    rx={2}
                    fill={s.color}
                  />
                );
              })}
              <SvgText
                x={groupX + groupWidth / 2 - BAR_GAP}
                y={CHART_HEIGHT - 4}
                fontSize={9}
                fill="#708F96"
                textAnchor="middle"
                fontWeight="600"
              >
                {label.length > 8 ? label.slice(0, 7) + '…' : label}
              </SvgText>
            </G>
          );
        })}
      </Svg>
      {/* Legend */}
      <View style={$styles.legendRow}>
        {series.map((s, i) => (
          <View key={i} style={$styles.legendItem}>
            <View style={[$styles.legendDot, { backgroundColor: s.color }]} />
            <Text style={$styles.legendLabel}>{s.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ---- Line Chart ----
export interface LineChartData {
  labels: string[];
  series: { label: string; data: number[]; color: string }[];
}

export function LineChart({ data, title }: { data: LineChartData; title?: string }) {
  const { labels, series } = data;
  if (!labels.length) return null;

  const allValues = series.flatMap(s => s.data);
  const maxVal = Math.max(...allValues, 1);
  const chartInnerHeight = CHART_HEIGHT - 40;
  const chartInnerWidth = CHART_WIDTH - 40;
  const stepX = chartInnerWidth / Math.max(labels.length - 1, 1);

  return (
    <View style={$styles.chartWrap}>
      {title && <Text style={$styles.chartTitle}>{title}</Text>}
      <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
        {/* Grid lines */}
        {[0, 0.5, 1].map((frac, i) => {
          const y = 8 + chartInnerHeight * (1 - frac);
          const val = Math.round(maxVal * frac);
          return (
            <G key={i}>
              <Line x1={20} y1={y} x2={CHART_WIDTH - 4} y2={y} stroke="rgba(112,143,150,0.15)" strokeWidth={1} />
              <SvgText x={16} y={y + 4} fontSize={9} fill="#708F96" textAnchor="end">{val}</SvgText>
            </G>
          );
        })}
        {/* Series area + dots */}
        {series.map((s) => (
          <G key={s.label}>
            {s.data.map((v, i) => {
              const cx = 20 + i * stepX;
              const cy = 8 + chartInnerHeight - (v / maxVal) * chartInnerHeight;
              return (
                <G key={i}>
                  <Rect x={cx - 2} y={cy - 2} width={4} height={4} rx={2} fill={s.color} />
                  <SvgText x={cx} y={cy - 6} fontSize={8} fill="#708F96" textAnchor="middle">{v}</SvgText>
                </G>
              );
            })}
          </G>
        ))}
        {/* X labels */}
        {labels.filter((_, i) => i % Math.ceil(labels.length / 6) === 0).map((label, li, arr) => {
          const idx = li * Math.ceil(labels.length / 6);
          const x = 20 + idx * stepX;
          return (
            <SvgText key={li} x={x} y={CHART_HEIGHT - 4} fontSize={8} fill="#708F96" textAnchor="middle">
              {label}
            </SvgText>
          );
        })}
      </Svg>
      {/* Legend */}
      <View style={$styles.legendRow}>
        {series.map((s, i) => (
          <View key={i} style={$styles.legendItem}>
            <View style={[$styles.legendDot, { backgroundColor: s.color }]} />
            <Text style={$styles.legendLabel}>{s.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ---- KPI Card ----
export function KPICard({ label, value, sub, color, trend }: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  trend?: { value: number; label: string };
}) {
  return (
    <View style={$styles.kpiCard}>
      <Text style={$styles.kpiLabel}>{label}</Text>
      <Text style={[$styles.kpiValue, { color: color || '#1A2332' }]}>{value}</Text>
      {sub && <Text style={$styles.kpiSub}>{sub}</Text>}
      {trend && (
        <View style={$styles.kpiTrendRow}>
          <Text style={[$styles.kpiTrend, { color: trend.value >= 0 ? '#22C55E' : '#EF4444' }]}>
            {trend.value >= 0 ? '+' : ''}{trend.value}%
          </Text>
          <Text style={$styles.kpiTrendLabel}> {trend.label}</Text>
        </View>
      )}
    </View>
  );
}

const $styles = StyleSheet.create({
  chartWrap: { marginBottom: 16 },
  chartTitle: {  fontSize: 13, color: '#1A2332', marginBottom: 8 },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: {  fontSize: 11, color: '#708F96' },
  kpiCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 3,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  kpiLabel: {  fontSize: 11, color: '#708F96', marginBottom: 2 },
  kpiValue: {  fontSize: 22, marginBottom: 2 },
  kpiSub: {  fontSize: 10, color: '#708F96' },
  kpiTrendRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  kpiTrend: {  fontSize: 11 },
  kpiTrendLabel: {  fontSize: 10, color: '#708F96' },
});
