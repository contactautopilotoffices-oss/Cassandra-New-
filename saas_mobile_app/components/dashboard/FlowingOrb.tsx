'use client';

/**
 * FlowingOrb — Crystal energy orb with rose/lavender palette
 *
 * Rose primary (#ff6b9d) with lavender accent (#c084fc).
 * Slightly faster animation, more energetic motion profile.
 * GPU-rendered via expo-gl — all animation on GPU via GLSL.
 */

import React from 'react';
import CrystalOrbCore from './CrystalOrbCore';

export default function FlowingOrb() {
  return (
    <CrystalOrbCore
      size={70}
      primaryColor="#ff6b9d"
      secondaryColor="#c084fc"
      speed={1.4}
      intensity={1.0}
    />
  );
}
