import { Platform } from 'react-native';

export const fontSans = Platform.OS === 'ios' ? 'System' : 'sans-serif';
export const fontDisplay = Platform.OS === 'web' ? 'Poppins' : 'System';

export const LOVABLE_EMAIL = 'sanyog@gmail.com';
export const MST_TEST_EMAIL = 'srustikarta2022@gmail.com';
export const PROPERTY_ADMIN_TEST_EMAIL = 'lohitexplores@gmail.com';

export const BG = '#060912';

export const STATUS_COLORS = {
  optimal: '#1FC26E',
  warning: '#C4A000',
  critical: '#D9261C',
};

export const GLASS_BG = 'rgba(255,255,255,0.06)';
export const GLASS_BORDER = 'rgba(255,255,255,0.12)';

export const SKY_GRADIENTS = [
  ['#4A6FA5', '#6B8FC4', '#8BAFD4'],
  ['#2D4A6F', '#4A6FA5', '#7A9FC4'],
  ['#5A7A9A', '#8AAABA', '#B0C8D8'],
  ['#3A5A7A', '#5A8AAA', '#8ABACA'],
  ['#4A5A6A', '#6A8A9A', '#9ABABA'],
];

export function getSkyGradient(name: string): string[] {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return SKY_GRADIENTS[Math.abs(hash) % SKY_GRADIENTS.length];
}
