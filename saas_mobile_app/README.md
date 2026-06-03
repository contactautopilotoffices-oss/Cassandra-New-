# Autopilot Mobile

A comprehensive React Native mobile application for facility management, built with Expo SDK 54 and React 19.

## Features

- **Ticket Management**: Create, track, and resolve maintenance and service tickets
- **Visitor Management**: Pre-approve visitors, check-in/check-out tracking with QR codes
- **Stock/Inventory Management**: Track inventory levels, low stock alerts
- **Property Management**: Multi-tenant property support
- **Meeting Room Booking**: Reserve and manage meeting spaces
- **SOP Management**: Standard Operating Procedures with checklists
- **Real-time Notifications**: Push notifications for updates and alerts
- **Offline Support**: Work offline with automatic sync
- **Role-based Access**: Admin, Manager, Staff, Tenant, and Vendor roles

## Tech Stack

- **Framework**: React Native 0.79 + Expo SDK 54
- **Language**: TypeScript 5.8
- **Navigation**: Expo Router v5 (file-based routing)
- **State Management**: Zustand + React Query (TanStack Query)
- **Backend**: Supabase (Auth, Database, Realtime, Storage)
- **Storage**: MMKV for local storage
- **UI Components**: Custom design system with brand colors
- **Animations**: React Native Reanimated v3.17
- **Charts**: Victory Native XL
- **Forms**: React Hook Form + Zod

## Prerequisites

- Node.js 20+
- npm 10+ or yarn/pnpm
- Expo CLI 16+
- iOS Simulator (Mac) or Android Emulator

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd saas_mobile
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```
Edit `.env` with your Supabase credentials:
```
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

4. Start the development server:
```bash
npx expo start
```

5. Run on device/simulator:
- Press `i` for iOS Simulator
- Press `a` for Android Emulator
- Scan QR code with Expo Go app on physical device

## Project Structure

```
app/
├── (app)/              # Main app screens (authenticated)
│   ├── (admin)/        # Admin-only screens
│   ├── tickets/        # Ticket management
│   ├── visitors/       # Visitor management
│   ├── stock/          # Inventory management
│   ├── _layout.tsx     # App layout with tabs
│   ├── index.tsx       # Dashboard/home
│   └── more.tsx        # More menu
├── (auth)/             # Auth screens (unauthenticated)
│   ├── login.tsx
│   ├── signup.tsx
│   └── forgot-password.tsx
├── _layout.tsx         # Root layout
└── +not-found.tsx      # 404 page

src/
├── components/         # React components
│   ├── ui/            # Reusable UI components
│   └── tickets/       # Ticket-specific components
├── constants/         # App constants
├── contexts/          # React contexts
├── hooks/             # Custom hooks
├── lib/               # Utility functions
├── services/          # API services
├── store/             # Zustand stores
└── types/             # TypeScript types
```

## Design System

### Brand Colors
- **Primary**: `#708F96` (Slate Blue-Green)
- **Secondary**: `#AA895F` (Warm Tan/Gold)

### Typography
- **Display**: Poppins (H1-H6)
- **Body**: Urbanist

### Components
- Button (primary, secondary, outline, ghost, danger)
- Input (with icons, validation)
- Card (default, outlined, elevated)
- Badge (status indicators)
- Avatar (with initials fallback)
- Text (H1-H6, Body, Caption, Label)

## Authentication

The app uses Supabase Auth with support for:
- Email/Password login
- Google OAuth
- Zoho OAuth
- Password reset

## Database Schema

Key tables:
- `users` - User profiles and roles
- `properties` - Property information
- `tickets` - Support tickets
- `visitors` - Visitor records
- `stock_items` - Inventory items
- `meeting_rooms` - Room bookings
- `sops` - Standard operating procedures

## API Services

All API calls are abstracted through service classes:
- `authService` - Authentication
- `ticketService` - Ticket CRUD
- `userService` - User management
- `propertyService` - Property management
- `vmsService` - Visitor management
- `stockService` - Inventory management
- `sopService` - SOP management
- `meetingRoomService` - Room bookings
- `reportService` - Analytics and reports

## State Management

- **Global State**: Zustand for auth, theme, notifications
- **Server State**: TanStack Query for API data
- **Local State**: React useState/useReducer

## Theming

Supports light/dark mode with:
- System preference detection
- Manual toggle
- Persistent preference storage

## Development

### Code Style
- ESLint + Prettier configuration
- TypeScript strict mode
- Import aliases (`@/components`, `@/services`, etc.)

### Testing
```bash
# Run unit tests
npm test

# Run E2E tests
npm run test:e2e
```

### Building

```bash
# Create development build
npx expo prebuild

# Build for iOS
npx expo run:ios

# Build for Android
npx expo run:android

# Create production build with EAS
eas build --platform ios
eas build --platform android
```

## Deployment

### EAS Build
```bash
# Configure EAS
eas login
eas configure

# Build production app
eas build --platform all --profile production
```

### App Store / Play Store
1. Build production binaries with EAS
2. Upload to App Store Connect / Google Play Console
3. Configure app metadata and screenshots
4. Submit for review

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

[Your License Here]

## Support

For support, email support@autopilot.com or open an issue on GitHub.

---

Built with ❤️ using React Native and Expo
