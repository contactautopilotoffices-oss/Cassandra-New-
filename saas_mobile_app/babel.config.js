module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      'babel-plugin-transform-import-meta',
      'react-native-reanimated/plugin',
      [
        'module-resolver',
        {
          root: ['./'],
          alias: {
            '@': '.',
            '@/app': './app',
            '@/assets': './assets',
            '@/components': './components',
            '@/context': './context',
            '@/hooks': './hooks',
            '@/lib': './lib',
            '@/types': './types',
            '@/utils': './utils',
            '@/constants': './constants',
            '@/stores': './stores',
            '@/services': './services',
          },
          extensions: ['.ios.ts', '.android.ts', '.ts', '.ios.tsx', '.android.tsx', '.tsx', '.jsx', '.js', '.json'],
        },
      ],
    ],
  };
};
