# Cassandra Wiring & Debug Plan

## Audit Summary (from 3 explore subagents)

### Critical Bugs 🔴
| # | File | Issue | Fix |
|---|------|-------|-----|
| 1 | `services/cassandra/cassandraAuthService.ts` | `getValidToken()` reads Supabase JWT from `jwt` key that is NEVER written. Token exchange always fails. | Use `supabase.auth.getSession()` instead |
| 2 | `hooks/voice/useCassandraVoice.ts` | `playAudioChunk()` uses web-only APIs (`atob`, `Blob`, `URL.createObjectURL`) → crashes on native | Platform-conditional: native uses `data:audio/mp3;base64,` URI |
| 3 | `services/ai/openaiNativeRealtimeService.ts` | `new File(uri).base64()` — `File` class doesn't exist in expo-file-system | Use `FileSystem.readAsStringAsync(uri, { encoding: EncodingType.Base64 })` |

### Medium Bugs 🟡
| # | File | Issue | Fix |
|---|------|-------|-----|
| 4 | `stores/cassandraStore.ts` | `reset()` destructures `cleanup` which doesn't exist in store interface | Remove dead code |
| 5 | `hooks/voice/useCassandraVoice.ts` | `session_acknowledged` sets state to `authenticated` but NEVER auto-starts recording | Call `startRecording()` after `session_acknowledged` |
| 6 | `app/property/[propertyId]/dashboard/index.tsx` | `onCassandra={() => {}}` — EMPTY handler, orb does nothing | Wire to open `CassandraSessionModal` or navigate to `/cassandra` |

### Stagnant UI / Missing Wiring
| # | File | Issue | Fix |
|---|------|-------|-----|
| 7 | `app/cassandra/index.tsx` | Prompt chips have `onPress={() => {}}` — do nothing | Wire to start chat with that prompt |
| 8 | `app/cassandra/index.tsx` | `handleChatPress/FilesPress/TeamPress` set `activeModal` but NO modal renders | Wire `handleChatPress` to open `CassandraSessionModal` with `initialMode="text"` |
| 9 | `app/cassandra/index.tsx` | `/cassandra` home screen exists but is UNREACHABLE from any dashboard | Add navigation entry points from all dashboards |
| 10 | — | No `app/cassandra/_layout.tsx` | Create minimal Stack layout with dark bg |
| 11 | — | No `/cassandra/chat` route | Chat is modal-only; keep modal as primary UX |

---

## Implementation Tasks

### Task 1: Fix Critical Auth Bug
**File:** `services/cassandra/cassandraAuthService.ts`  
**What:** Replace `SecureStore.getItemAsync('jwt')` / `localStorage.getItem('jwt')` with `supabase.auth.getSession()`  
**Why:** The `jwt` key is never written by any code. Token exchange will always fail.

### Task 2: Fix Critical Native Audio Playback
**File:** `hooks/voice/useCassandraVoice.ts`  
**What:** In `playAudioChunk()`, detect platform. On native, pass base64 data URI directly to `Audio.Sound.createAsync()`. Keep Blob URL path for web only.  
**Why:** `URL.createObjectURL` is undefined on React Native.

### Task 3: Fix Store Crash + Auto-Recording
**Files:** `stores/cassandraStore.ts`, `hooks/voice/useCassandraVoice.ts`  
**What:**  
- `cassandraStore.ts`: Remove `const { cleanup } = get()` dead code in `reset()`  
- `useCassandraVoice.ts`: After receiving `session_acknowledged` message, call `startRecording()` automatically  
**Why:** Store reset has incorrect code; voice session requires double-tap currently.

### Task 4: Fix OpenAI Native File Bug
**File:** `services/ai/openaiNativeRealtimeService.ts`  
**What:** Replace `new File(uri).base64()` with `FileSystem.readAsStringAsync(uri, { encoding: EncodingType.Base64 })`  
**Why:** `File` class is not exported by expo-file-system.

### Task 5: Wire Orb Navigation Across All Dashboards
**Files:**  
- `app/property/[propertyId]/dashboard/index.tsx` — fix empty `onCassandra`  
- `components/dashboard/LovableMstDashboard.tsx` — verify `setShowChat(true)` works  
- `components/dashboard/LovablePropertyAdminDashboard.tsx` — verify `setShowChat(true)` works  
- `components/dashboard/lovable/BottomNav.tsx` — verify `onChat` works  
**What:** Ensure ALL dashboards have a working Cassandra entry point. The primary UX is `CassandraSessionModal` (full-screen modal). The `/cassandra` home screen should also be reachable via orb long-press or explicit nav.  
**Decision:** Keep modal as primary quick-access. Add `router.push('/cassandra')` as secondary entry for the full home screen experience.

### Task 6: Fix Stagnant `/cassandra` Home Screen
**File:** `app/cassandra/index.tsx`  
**What:**  
- Wire prompt chips to open `CassandraSessionModal` with that prompt pre-filled  
- Wire `handleChatPress` to open modal in text mode  
- Wire `handleFilesPress` and `handleTeamPress` to show `toast.info('Coming soon')` instead of no-op  
- Remove unused `styles.chatCard` or use it  
**Why:** The home screen has beautiful UI but zero interactivity.

### Task 7: Create `app/cassandra/_layout.tsx`
**File:** `app/cassandra/_layout.tsx` (new)  
**What:** Minimal Stack layout with dark background (`Colors.bgDeep`), `headerShown: false`, slide-from-right animation. Wrap children in a consistent dark theme.  
**Why:** Section-level layout for Cassandra routes.

---

## Verification Plan
1. Build passes: `cd saas_mobile && npx tsc --noEmit` (TypeScript check)
2. Lint passes: `cd saas_mobile && npm run lint`
3. Agent-browser test: Login as MST user, tap Cassandra orb, verify modal opens with chat UI
4. Agent-browser test: Navigate to `/cassandra`, verify home screen is interactive
