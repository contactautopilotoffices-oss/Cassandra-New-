'use client';

/**
 * AuraOrb — Crystal energy orb with amber/coral palette
 *
 * Amber-gold primary (#ffb347) with coral accent (#ff6b35).
 * Medium-speed animation, used as the center nav button on dashboards.
 * GPU-rendered via expo-gl — all animation on GPU via GLSL.
 */

import React from 'react';
import CrystalOrbCore from './CrystalOrbCore';

export default function AuraOrb() {
  return (
    <CrystalOrbCore
      size={70}
      primaryColor="#ffb347"
      secondaryColor="#ff6b35"
      speed={1.0}
      intensity={1.0}
    />
  );
}
