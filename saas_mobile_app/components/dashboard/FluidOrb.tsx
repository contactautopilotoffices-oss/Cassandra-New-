'use client';

/**
 * FluidOrb — Crystal energy orb with sky/indigo palette
 *
 * Sky blue primary (#38bdf8) with indigo accent (#818cf8).
 * Slower, calmer animation for a serene variant.
 * GPU-rendered via expo-gl — all animation on GPU via GLSL.
 */

import React from 'react';
import CrystalOrbCore from './CrystalOrbCore';

export default function FluidOrb() {
  return (
    <CrystalOrbCore
      size={70}
      primaryColor="#38bdf8"
      secondaryColor="#818cf8"
      speed={0.6}
      intensity={1.0}
    />
  );
}
