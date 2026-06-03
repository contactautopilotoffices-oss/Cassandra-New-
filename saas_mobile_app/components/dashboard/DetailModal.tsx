'use client';
/**
 * DetailModal — Tile detail bottom sheet with design system tokens
 *
 * Shows:
 *  - 3-column metrics grid
 *  - Custom SVG area chart
 *  - Status breakdown list
 *  - AI analysis section with sparkles
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Platform,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Rect, Line, Circle } from 'react-native-svg';
import {
  SPACING,
  TYPOGRAPHY,
  MODAL_TOKENS,
  STATUS_COLORS,
  CARD_SURFACES,
  type StatusType,
} from '@/constants/designSystem';

export type TileVariant = 'tickets' | 'checklist' | 'health' | 'energy';

export interface ChartPoint {
  label: string;
  value: number;
}

export interface BreakdownItem {
  label: string;
  value: string | number;
  color: string;
}

export interface TileDetail {
  id: string;
  iconName: keyof typeof Ionicons.glyphMap;
  label: string;
  title: string;
  metrics: { label: string; value: string }[];
  chartTitle: string;
  chartData: ChartPoint[];
  chartColor: string;
  trendDirection: 'up' | 'down';
  trendLabel: string;
  breakdownTitle: string;
  breakdown: BreakdownItem[];
  aiAnalysis: string;
}

const fontSans = Platform.OS === 'ios' ? 'System' : 'sans-serif';
const fontDisplay = Platform.OS === 'web' ? 'Poppins' : 'System';
const SCREEN_H = Dimensions.get('window').height;

// ─── Custom SVG area chart ────────────────────────────────────────────────────
interface AreaSvgChartProps {
  data: ChartPoint[];
  color: string;
}

function AreaSvgChart({ data, color }: AreaSvgChartProps) {
  const chartW = 300;
  const chartH = 140;
  const padL = 8;
  const padR = 8;
  const padT = 12;
  const padB = 24;
  const innerW = chartW - padL - padR;
  const innerH = chartH - padT - padB;

  const values = data?.map((d) => d.value) || [0];
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;

  const getX = (i: number) => padL + (i / (data.length - 1)) * innerW;
  const getY = (v: number) => padT + innerH - ((v - minVal) / range) * innerH;

  const pts = data?.map((d, i) => ({ x: getX(i), y: getY(d.value) })) || [];

  const linePath = pts.reduce((acc, pt, i) => {
    if (i === 0) return `M ${pt.x},${pt.y}`;
    const prev = pts[i - 1];
    const cpx1 = prev.x + (pt.x - prev.x) * 0.5;
    const cpx2 = pt.x - (pt.x - prev.x) * 0.5;
    return `${acc} C ${cpx1},${prev.y} ${cpx2},${pt.y} ${pt.x},${pt.y}`;
  }, '');

  const areaPath = `${linePath} L ${pts[pts.length - 1].x},${chartH - padB} L ${pts[0].x},${chartH - padB} Z`;
  const gradientId = `chartGrad_${color.replace(/[^a-z0-9]/gi, '')}`;

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((frac) => {
    const y = padT + frac * innerH;
    return { y, value: Math.round(maxVal - frac * range) };
  });

  return (
    <View style={{ width: chartW, height: chartH }}>
      <Svg width={chartW} height={chartH} viewBox={`0 0 ${chartW} ${chartH}`}>
        <Defs>
          <SvgLinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <Rect x="0" y="0" width={chartW} height={padT + innerH} fill={color} fillOpacity={0.5} />
            <Rect x="0" y={padT + innerH * 0.5} width={chartW} height={padT + innerH * 0.5} fill={color} fillOpacity={0.1} />
            <Rect x="0" y={padT + innerH * 0.8} width={chartW} height={padT + innerH * 0.2} fill={color} fillOpacity={0} />
          </SvgLinearGradient>
        </Defs>

        {gridLines?.map((gl, i) => (
          <Line
            key={i}
            x1={padL}
            y1={gl.y}
            x2={chartW - padR}
            y2={gl.y}
            stroke={CARD_SURFACES.cardBorder}
            strokeWidth={1}
          />
        ))}

        <Path d={areaPath} fill={`url(#${gradientId})`} />
        <Path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {pts?.map((pt, i) => (
          <Circle
            key={i}
            cx={pt.x}
            cy={pt.y}
            r={i === pts.length - 1 ? 4 : 3}
            fill={color}
            stroke="rgba(10,12,20,0.8)"
            strokeWidth={1.5}
          />
        ))}
      </Svg>

      <View style={[StyleSheet.absoluteFill, { top: chartH - padB + SPACING.xs }]}>
        <View style={{ flexDirection: 'row', paddingLeft: padL, paddingRight: padR }}>
          {data?.map((d, i) => (
            <Text
              key={i}
              style={{
                flex: 1,
                textAlign: 'center',
                fontSize: 9,
                color: 'rgba(255,255,255,0.50)',
                              }}
            >
              {d.label}
            </Text>
          ))}
        </View>
      </View>
    </View>
  );
}

function StatusDot({ color }: { color: string }) {
  return (
    <View
      style={[
        styles.statusDot,
        { backgroundColor: color, shadowColor: color, shadowOpacity: 1, shadowRadius: 4, elevation: 3 },
      ]}
    />
  );
}

interface DetailModalProps {
  detail: TileDetail | null;
  onClose: () => void;
}

export default function DetailModal({ detail, onClose }: DetailModalProps) {
  if (!detail) return null;

  return (
    <Modal
      visible={true}
      animationType="slide"
      transparent
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      {/* Backdrop — solid dim */}
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onClose}
      />

      {/* Sheet content — solid bg, occludes everything underneath */}
      <View style={styles.sheetContainer}>
        <View style={styles.sheetContent}>
          <ScrollView
            style={styles.scrollView}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: SPACING.xl }}
          >
            {/* Header */}
            <View style={styles.modalHeader}>
              <View style={styles.headerLeft}>
                <View style={styles.labelRow}>
                  <Ionicons
                    name={detail.iconName}
                    size={14}
                    color="rgba(255,255,255,0.60)"
                  />
                  <Text style={styles.labelText}>{detail.label.toUpperCase()}</Text>
                </View>
                <Text style={styles.titleText}>{detail.title}</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={18} color="rgba(255,255,255,0.80)" />
              </TouchableOpacity>
            </View>

            {/* Metrics row */}
            <View style={styles.metricsRow}>
              {detail.metrics?.map((m) => (
                <View key={m.label} style={styles.metricCell}>
                  <Text style={styles.metricValue}>{m.value}</Text>
                  <Text style={styles.metricLabel}>{m.label.toUpperCase()}</Text>
                </View>
              ))}
            </View>

            {/* Chart card */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{detail.chartTitle}</Text>
                <View
                  style={[
                    styles.trendBadge,
                    {
                      backgroundColor:
                        detail.trendDirection === 'up'
                          ? STATUS_COLORS.optimal.surface
                          : STATUS_COLORS.watch.surface,
                    },
                  ]}
                >
                  <Ionicons
                    name={detail.trendDirection === 'up' ? 'trending-up' : 'trending-down'}
                    size={12}
                    color={detail.trendDirection === 'up' ? STATUS_COLORS.optimal.bg : STATUS_COLORS.watch.bg}
                  />
                  <Text
                    style={[
                      styles.trendText,
                      {
                        color: detail.trendDirection === 'up' ? STATUS_COLORS.optimal.bg : STATUS_COLORS.watch.bg,
                      },
                    ]}
                  >
                    {detail.trendLabel}
                  </Text>
                </View>
              </View>
              <AreaSvgChart data={detail.chartData} color={detail.chartColor} />
            </View>

            {/* Status breakdown */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{detail.breakdownTitle}</Text>
              <View style={styles.breakdownList}>
                {detail.breakdown?.map((item) => (
                  <View key={item.label} style={styles.breakdownRow}>
                    <StatusDot color={item.color} />
                    <Text style={styles.breakdownLabel}>{item.label}</Text>
                    <Text style={[styles.breakdownValue, { color: item.color }]}>
                      {item.value}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            {/* AI Analysis */}
            <View style={styles.aiCard}>
              <View style={styles.aiHeader}>
                <Ionicons name="sparkles" size={16} color="#A78BFA" />
                <Text style={styles.aiTitle}>AI Analysis</Text>
              </View>
              <Text style={styles.aiText}>{detail.aiAnalysis}</Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: MODAL_TOKENS.backdropColor,
  },
  sheetContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    marginTop: SCREEN_H * 0.15, // 85% height
  },
  sheetContent: {
    flex: 1,
    backgroundColor: MODAL_TOKENS.sheetBg,
    borderTopLeftRadius: MODAL_TOKENS.sheetRadius,
    borderTopRightRadius: MODAL_TOKENS.sheetRadius,
    overflow: 'hidden',
  },
  scrollView: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.xl,
    padding: SPACING.xl,
    paddingBottom: 0,
  },
  headerLeft: {
    flex: 1,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  labelText: {
        fontSize: TYPOGRAPHY.caption.fontSize,
    fontWeight: TYPOGRAPHY.caption.fontWeight,
    color: 'rgba(255,255,255,0.60)',
    letterSpacing: TYPOGRAPHY.caption.letterSpacing,
    textTransform: 'uppercase',
  },
  titleText: {
        fontSize: TYPOGRAPHY.title.fontSize,
    fontWeight: TYPOGRAPHY.title.fontWeight,
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: CARD_SURFACES.cardBg,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: CARD_SURFACES.cardBorder,
  },

  // Metrics
  metricsRow: {
    flexDirection: 'row',
    backgroundColor: CARD_SURFACES.cardBg,
    borderRadius: CARD_SURFACES.cardRadius,
    borderWidth: 1,
    borderColor: CARD_SURFACES.cardBorder,
    padding: CARD_SURFACES.cardPadding,
    marginBottom: SPACING.xl,
    marginHorizontal: SPACING.xl,
  },
  metricCell: {
    flex: 1,
    alignItems: 'center',
  },
  metricValue: {
        fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  metricLabel: {
        fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.50)',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: SPACING.xs,
    textAlign: 'center',
  },

  // Cards
  card: {
    backgroundColor: CARD_SURFACES.cardBg,
    borderRadius: CARD_SURFACES.cardRadius,
    borderWidth: 1,
    borderColor: CARD_SURFACES.cardBorder,
    padding: CARD_SURFACES.cardPadding,
    marginBottom: SPACING.xl,
    marginHorizontal: SPACING.xl,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  cardTitle: {
        fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.90)',
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: 8,
  },
  trendText: {
        fontSize: 11,
    fontWeight: '600',
  },

  // Breakdown
  breakdownList: {
    gap: SPACING.md,
    marginTop: SPACING.xs,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  breakdownLabel: {
    flex: 1,
        fontSize: 14,
    color: 'rgba(255,255,255,0.80)',
  },
  breakdownValue: {
        fontSize: 14,
    fontWeight: '600',
  },

  // AI
  aiCard: {
    backgroundColor: 'rgba(167,139,250,0.12)',
    borderRadius: CARD_SURFACES.cardRadius,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.20)',
    padding: CARD_SURFACES.cardPadding,
    marginBottom: SPACING.xl,
    marginHorizontal: SPACING.xl,
  },
  aiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  aiTitle: {
        fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  aiText: {
        fontSize: 13,
    color: 'rgba(255,255,255,0.80)',
    lineHeight: 20,
  },
});
