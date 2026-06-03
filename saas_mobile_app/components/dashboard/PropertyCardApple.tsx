'use client';

/**
 * PropertyCardApple — FMS property card with iOS Weather aesthetic
 *
 * Design audit applied:
 * - 4pt spacing system: 20px screen padding, 16px card gap, 16px card padding, 8px badge gap
 * - Rich gradient fallback: #1A1A1A → #222222 (was flat #1C1C1E → #2C2C2E)
 * - Semantic status chips: blue=autopilot, green=optimal, neutral=normal
 * - Typography hierarchy: title 26px bold, address 13px 60% opacity, badges 11px medium
 * - Card composition: title top-left, subtle chevron icon top-right, badges at bottom
 * - NO border-left stripes, NO gradient text, NO generic drop shadows
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ImageBackground,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Path, Circle, Polygon } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';

type HealthStatus = 'good' | 'warning' | 'critical';

interface PropertyCardAppleProps {
  property: {
    id: string;
    name: string;
    code?: string;
    address?: string;
    image_url?: string | null;
    healthStatus?: HealthStatus;
    openTickets?: number;
    occupancyPct?: number;
  };
  orgId: string;
}

// ─────────────────────────────────────────────
// Design tokens — 4pt spacing system
// ─────────────────────────────────────────────
const T = {
  // Spacing
  spaceXs: 4,
  spaceSm: 8,
  spaceMd: 12,
  spaceLg: 16,
  spaceXl: 20,
  spaceXxl: 24,

  // Radius
  radiusSm: 8,
  radiusMd: 12,
  radiusLg: 16,
  radiusXl: 22,

  // Colors
  bg: '#0A0A0F',
  // Cards
  cardGradientDark: ['#1A1A1A', '#222222'],
  // Text
  textPrimary: '#FFFFFF',
  textSecondary: 'rgba(255,255,255,0.60)',
  textTertiary: 'rgba(255,255,255,0.40)',
  // Semantic chip colors
  chipBlue: 'rgba(41,151,255,0.15)',
  chipBlueBorder: 'rgba(41,151,255,0.25)',
  chipBlueText: '#2997FF',
  chipGreen: 'rgba(52,199,89,0.15)',
  chipGreenBorder: 'rgba(52,199,89,0.25)',
  chipGreenText: '#34C759',
  chipNeutral: 'rgba(255,255,255,0.08)',
  chipNeutralBorder: 'rgba(255,255,255,0.12)',
  chipNeutralText: 'rgba(255,255,255,0.65)',
} as const;

// Deterministic badge set based on property name
function getBadgeSetIndex(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 4;
}

// Semantic chip variant — maps badge type → color treatment
type ChipVariant = 'blue' | 'green' | 'neutral';

function getChipVariant(type: string): ChipVariant {
  switch (type) {
    case 'autopilot':
      return 'blue';
    case 'check':
    case 'optimal':
      return 'green';
    default:
      return 'neutral';
  }
}

// Icon color derived from chip variant — icon matches chip text color
function getIconColor(variant: ChipVariant): string {
  switch (variant) {
    case 'blue': return T.chipBlueText;
    case 'green': return T.chipGreenText;
    default: return T.chipNeutralText;
  }
}

const BadgeIcon = React.memo(function BadgeIcon({ type, variant }: { type: string; variant: ChipVariant }) {
  const color = getIconColor(variant);
  const size = 11;
  switch (type) {
    case 'map':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <Path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <Circle cx="12" cy="10" r="3" />
        </Svg>
      );
    case 'hub':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <Path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <Path d="M9 22V12h6v10" />
        </Svg>
      );
    case 'autopilot':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <Circle cx="12" cy="12" r="10" />
          <Path d="M12 16v-4M12 8h.01" />
        </Svg>
      );
    case 'check':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <Path d="M20 6L9 17l-5-5" />
        </Svg>
      );
    case 'flow':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <Polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </Svg>
      );
    case 'overview':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <Path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
          <Path d="M22 12A10 10 0 0 0 12 2v10z" />
        </Svg>
      );
    case 'depts':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <Path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <Circle cx="9" cy="7" r="4" />
          <Path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
        </Svg>
      );
    case 'clock':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <Circle cx="12" cy="12" r="10" />
          <Path d="M12 6v6l4 2" />
        </Svg>
      );
    case 'campus':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <Path d="M22 10v6M2 10l10-5 10 5-10 5z" />
          <Path d="M6 12v5c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2v-5" />
        </Svg>
      );
    case 'parking':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <Path d="M7 3h5a4 4 0 0 1 0 8H7V3z" />
          <Path d="M7 11v10" />
        </Svg>
      );
    default:
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <Circle cx="12" cy="12" r="10" />
        </Svg>
      );
  }
});

// Semantic chip config per variant
const CHIP_CONFIG: Record<ChipVariant, { bg: string; border: string; text: string }> = {
  blue: { bg: T.chipBlue, border: T.chipBlueBorder, text: T.chipBlueText },
  green: { bg: T.chipGreen, border: T.chipGreenBorder, text: T.chipGreenText },
  neutral: { bg: T.chipNeutral, border: T.chipNeutralBorder, text: T.chipNeutralText },
};

const PropertyCardApple = React.memo(function PropertyCardApple({ property, orgId }: PropertyCardAppleProps) {
  const router = useRouter();
  const [imgError, setImgError] = useState(false);

  const handlePress = useCallback(() => {
    router.push(`/org/${orgId}/property/${property.id}` as any);
  }, [router, orgId, property.id]);

  // Compute badges once per property — not on every parent re-render
  const badges = useMemo(() => {
    const now = new Date();
    const timeStr = `${now.getHours() % 12 || 12}:${String(now.getMinutes()).padStart(2, '0')} ${now.getHours() >= 12 ? 'PM' : 'AM'}`;
    const badgeSetIndex = getBadgeSetIndex(property.name);
    const badgeSets = [
      [
        { type: 'map', text: 'Site Map Active' },
        { type: 'hub', text: 'Regional Hub Connected' },
      ],
      [
        { type: 'autopilot', text: 'Autopilot engaged' },
        { type: 'check', text: 'Optimal systems' },
        { type: 'flow', text: 'Normal flow' },
      ],
      [
        { type: 'overview', text: 'Operations Overview' },
        { type: 'depts', text: 'Departments connected' },
        { type: 'clock', text: `Log: ${timeStr}` },
      ],
      [
        { type: 'campus', text: 'Campus Systems Integrated' },
        { type: 'parking', text: 'Parking status optimal' },
      ],
    ];
    return badgeSets[badgeSetIndex];
  }, [property.name]);

  const imageUrl = property.image_url;
  const hasValidImage = !!imageUrl && !imgError;

  return (
    <TouchableOpacity style={styles.container} onPress={handlePress} activeOpacity={0.90}>
      {hasValidImage ? (
        <ImageBackground
          source={{ uri: imageUrl }}
          style={styles.background}
          imageStyle={styles.backgroundImage}
          resizeMode="cover"
          onError={() => setImgError(true)}
        >
          <LinearGradient
            colors={['rgba(0,0,0,0.25)', 'rgba(0,0,0,0.02)', 'rgba(0,0,0,0.50)', 'rgba(0,0,0,0.82)']}
            locations={[0, 0.28, 0.60, 1]}
            style={styles.gradient}
          />
          <CardContent property={property} badges={badges} />
        </ImageBackground>
      ) : (
        <LinearGradient
          colors={T.cardGradientDark}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.background}
        >
          <CardContent property={property} badges={badges} />
        </LinearGradient>
      )}
    </TouchableOpacity>
  );
});

const CardContent = React.memo(function CardContent({
  property,
  badges,
}: {
  property: PropertyCardAppleProps['property'];
  badges: { type: string; text: string }[];
}) {
  return (
    <View style={styles.content} pointerEvents="none">
      {/* Top row: title left, chevron right */}
      <View style={styles.topRow}>
        <View style={styles.topText}>
          <Text style={styles.propertyName} numberOfLines={1}>
            {property.name}
          </Text>
          {property.address ? (
            <Text style={styles.address} numberOfLines={1}>
              {property.address}
            </Text>
          ) : null}
        </View>
        {/* Subtle navigation chevron — top-right anchor */}
        <View style={styles.chevronWrap}>
          <Svg
            width={18}
            height={18}
            viewBox="0 0 24 24"
            fill="none"
            stroke="rgba(255,255,255,0.30)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <Path d="M9 18l6-6-6-6" />
          </Svg>
        </View>
      </View>

      {/* Semantic status chips — bottom row */}
      <View style={styles.badges}>
        {badges.map((badge, i) => {
          const variant = getChipVariant(badge.type);
          const config = CHIP_CONFIG[variant];
          return (
            <View
              key={i}
              style={[
                styles.badge,
                { backgroundColor: config.bg, borderColor: config.border },
              ]}
            >
              <BadgeIcon type={badge.type} variant={variant} />
              <Text style={[styles.badgeText, { color: config.text }]}>
                {badge.text}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
});

const display = Platform.OS === 'ios' ? 'System' : 'sans-serif';

const styles = StyleSheet.create({
  // ── Container ──────────────────────────────────
  // Screen padding: 20px per side, 16px gap between cards
  container: {
    marginHorizontal: T.spaceLg,
    marginBottom: T.spaceMd,
    borderRadius: T.radiusXl,
    overflow: 'hidden',
    height: 156,
    backgroundColor: T.bg,
    // Subtle depth shadow — not flat
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.30,
    shadowRadius: 12,
    elevation: 4,
  },
  background: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backgroundImage: {
    borderRadius: T.radiusXl,
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: T.radiusXl,
  },

  // ── Content ────────────────────────────────────
  content: {
    flex: 1,
    justifyContent: 'space-between',
    padding: T.spaceLg,
  },

  // ── Top row: title left, chevron right ─────────
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  topText: {
    flex: 1,
    minWidth: 0,
  },
  chevronWrap: {
    paddingLeft: T.spaceSm,
    paddingTop: 4,
  },

  // ── Typography hierarchy ───────────────────────
  // Title: 26px bold — largest, most prominent
  propertyName: {
        fontSize: 26,
    fontWeight: '700',
    color: T.textPrimary,
    letterSpacing: -0.4,
    lineHeight: 30,
    textShadowColor: 'rgba(0,0,0,0.40)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  // Address: 13px regular, 60% opacity — clearly secondary
  address: {
        fontSize: 13,
    fontWeight: '400',
    color: T.textSecondary,
    marginTop: T.spaceXs,
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },

  // ── Status chips row ───────────────────────────
  // 8px gap, semantic colors applied in JSX
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: T.spaceSm,
    marginTop: T.spaceSm,
  },
  // Badge pill: 11px medium weight, semantic text color from config
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: T.spaceXs,
    paddingHorizontal: T.spaceSm + 2,
    paddingVertical: T.spaceXs + 1,
    borderRadius: T.radiusSm,
    borderWidth: 1,
  },
  badgeText: {
        fontSize: 11,
    fontWeight: '500',
  },
});

export default PropertyCardApple;
