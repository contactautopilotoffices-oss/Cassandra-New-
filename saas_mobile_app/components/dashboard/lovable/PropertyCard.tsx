import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ImageBackground,
  Pressable,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  ZoomIn,
} from 'react-native-reanimated';
import { Property } from './types';
import {
  fontSans,
  STATUS_COLORS,
  getSkyGradient,
} from './constants';
import { Ionicons } from '@expo/vector-icons';
import PulseDot from './PulseDot';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface PropertyCardProps {
  property: Property;
  index: number;
  onPress: () => void;
}

const PropertyCard = React.memo(({ property, index, onPress }: PropertyCardProps) => {
  const pressScale = useSharedValue(1);
  const gradient = getSkyGradient(property.name);
  const hasImage = !!property.image_url;

  // Derive status from open tickets
  const open = property.openTickets ?? 0;
  const resolved = property.resolvedTickets ?? 0;
  
  const health: 'good' | 'warning' | 'critical' =
    open > 15 ? 'critical' : open > 5 ? 'warning' : 'good';
  const statusText =
    open > 15 ? 'Critical' : open > 5 ? 'Watch' : 'Optimal';
  const statusColor =
    health === 'good' ? STATUS_COLORS.optimal :
    health === 'warning' ? STATUS_COLORS.warning :
    STATUS_COLORS.critical;

  const onPressIn = () => {
    pressScale.value = withSpring(0.975, { damping: 15, stiffness: 200 });
  };
  const onPressOut = () => {
    pressScale.value = withSpring(1, { damping: 15, stiffness: 200 });
  };

  const pressStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: pressScale.value },
      { translateY: withSpring(pressScale.value < 1 ? -8 : 0, { damping: 15, stiffness: 200 }) }
    ],
  }));

  return (
    <Animated.View entering={ZoomIn.delay(index * 80).duration(500)}>
      <AnimatedPressable
        style={[styles.propertyCard, pressStyle]}
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
      >
        {hasImage ? (
          <ImageBackground
            source={{ uri: property.image_url! }}
            style={styles.cardImageBg}
            resizeMode="cover"
          >
            <LinearGradient
              colors={['rgba(0,0,0,0.00)', 'rgba(0,0,0,0.65)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.cardOverlay}
            >
              <CardContent property={property} />
            </LinearGradient>
          </ImageBackground>
        ) : (
          <LinearGradient
            colors={gradient as any}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.cardGradient}
          >
            <CardContent property={property} />
          </LinearGradient>
        )}
      </AnimatedPressable>
    </Animated.View>
  );
});

function CardContent({
  property,
}: {
  property: Property;
}) {
  const open = property.openTickets;
  const resolved = property.resolvedTickets;
  const statusColor =
    property.healthStatus === 'good' ? STATUS_COLORS.optimal :
    property.healthStatus === 'warning' ? STATUS_COLORS.warning :
    STATUS_COLORS.critical;
  
  const statusText = property.healthStatus === 'good' ? 'Optimal' : property.healthStatus === 'warning' ? 'Watch' : 'Critical';

  return (
    <View style={styles.cardInner}>
      {/* Background Progress for Checklist */}
      <View style={styles.cardProgressBg}>
        <View style={[styles.cardProgressFill, { width: `${property.checklist.percent}%` }]} />
      </View>

      <View style={styles.cardTopRow}>
        <View style={styles.cardLeft}>
          <Text style={styles.cardName} numberOfLines={1}>
            {property.name}
          </Text>
          <View style={styles.cardInfoRow}>
            <Text style={styles.cardCode}>{property.code}</Text>
            <View style={styles.dot} />
            <Text style={styles.cardChecklistLabel}>{property.checklist.percent}% Complete</Text>
          </View>
        </View>
        <View style={styles.cardRight}>
           <Text style={styles.cardMetric}>{open}</Text>
           <Text style={styles.cardMetricLabel}>OPEN</Text>
        </View>
      </View>

      <View style={styles.cardBottomRow}>
        <View style={styles.statusRow}>
          <PulseDot color={statusColor} />
          <Text style={styles.cardStatus}>{statusText.toUpperCase()}</Text>
        </View>
        
        {/* Real-time Energy Bubble */}
        <View style={styles.energyBubble}>
          <Ionicons name="flash" size={12} color="#FFD60A" />
          <Text style={styles.energyText}>
            {property.energy.electricity > 0 ? `${property.energy.electricity} kVAh` : `${property.energy.diesel} L`}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  propertyCard: {
    borderRadius: 24,
    overflow: 'hidden',
    height: 120,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  cardGradient: { 
    flex: 1, 
    padding: 18, 
    justifyContent: 'space-between' 
  },
  cardImageBg: { 
    ...StyleSheet.absoluteFillObject, 
    borderRadius: 24 
  },
  cardOverlay: { 
    ...StyleSheet.absoluteFillObject, 
    padding: 18,
    justifyContent: 'space-between'
  },
  cardInner: { 
    flex: 1, 
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  cardProgressBg: {
    position: 'absolute',
    bottom: -18,
    left: -18,
    right: -18,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  cardProgressFill: {
    height: '100%',
    backgroundColor: 'rgba(31, 194, 110, 0.4)',
  },
  cardTopRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center' 
  },
  cardLeft: { 
    flex: 1, 
    paddingRight: 12 
  },
  cardRight: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardName: {
        fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  cardInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 6,
  },
  cardCode: {
        fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.45)',
  },
  cardChecklistLabel: {
        fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.35)',
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  cardMetric: {
        fontSize: 32,
    fontWeight: '300',
    color: '#FFFFFF',
    letterSpacing: -1,
  },
  cardMetricLabel: {
        fontSize: 8,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.3)',
    marginTop: -4,
    letterSpacing: 1,
  },
  cardBottomRow: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    marginTop: 12,
  },
  statusRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 8 
  },
  cardStatus: {
        fontSize: 11,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 0.5,
  },
  energyBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,214,10,0.15)',
    gap: 4,
  },
  energyText: {
        fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

export default PropertyCard;
