/**
 * Cassandra Room Types
 *
 * Covers the full lifecycle of a Cassandra AI session room:
 *   - Live states:  waiting, active  (no analysis yet)
 *   - Ended state:  ended           (with optional analysis)
 *
 * All fields are optional where live/ended states differ.
 * Use the conditional rendering pattern in room detail screens.
 */

// ─── Enums / Literals ────────────────────────────────────────────────────────

export type RoomStatus = 'waiting' | 'active' | 'ended';

export type ParticipantRole = 'host' | 'agent' | 'tenant' | 'vendor' | 'observer';

export type ActionItemStatus = 'open' | 'in_progress' | 'resolved' | 'dismissed';

export type SentimentLabel = 'positive' | 'neutral' | 'negative';

export type MemoryType = 'annotation' | 'correction' | 'summary' | 'insight';

// ─── Participant ─────────────────────────────────────────────────────────────

export interface Participant {
  id: string;
  name: string;
  email?: string;
  role: ParticipantRole;
  avatar_url?: string;
  joined_at?: string;
  left_at?: string;
}

// ─── Transcript ─────────────────────────────────────────────────────────────

export interface EnrichedTranscriptSegment {
  id: string;
  speaker_id: string;
  speaker_name?: string;
  text: string;
  start_ms: number;
  end_ms: number;
  confidence?: number;
  sentiment?: SentimentLabel;
  corrected_text?: string;     // set after user correction
  is_corrected?: boolean;
}

// ─── Action Items ──────────────────────────────────────────────────────────

export interface ActionItem {
  id: string;
  description: string;
  assignee?: string;
  assignee_name?: string;
  due_date?: string;
  status: ActionItemStatus;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  created_at?: string;
  updated_at?: string;
  notes?: string;
}

// ─── Speaker Map ───────────────────────────────────────────────────────────

export interface SpeakerMapEntry {
  speaker_id: string;
  speaker_name: string;
  color: string;          // hex color used in transcript UI
  segment_count?: number;
  total_duration_ms?: number;
}

// ─── Memory ────────────────────────────────────────────────────────────────

export interface MemoryContext {
  room_id?: string;
  transcript_id?: string;
  action_item_id?: string;
}

export interface WriteMemoryBody {
  org_id: string;
  content: string;
  memory_type: MemoryType;
  context?: MemoryContext;
}

export interface RetrievedMemory {
  id: string;
  content: string;
  memory_type: MemoryType;
  relevance_score?: number;
  created_at: string;
  context?: MemoryContext;
}

// ─── Analysis ────────────────────────────────────────────────────────────────

export interface CassandraRoomAnalysis {
  transcript?: EnrichedTranscriptSegment[];
  action_items?: ActionItem[];
  speaker_map?: SpeakerMapEntry[];
  quality_score?: number;         // 0–100
  summary?: string;
  review_required?: boolean;
  generated_at?: string;
}

// ─── Room ─────────────────────────────────────────────────────────────────

export interface CassandraRoomFull {
  id: string;
  property_id: string;
  property_name?: string;
  name: string;
  status: RoomStatus;
  created_at: string;
  ended_at?: string;
  duration_seconds?: number;
  participants?: Participant[];
  session_id?: string;           // WebSocket session ID, set when active
  analysis?: CassandraRoomAnalysis | null;  // null while live, object after ended
}

// ─── Room List Item ────────────────────────────────────────────────────────

export interface CassandraRoomListItem {
  id: string;
  property_id: string;
  property_name?: string;
  name: string;
  status: RoomStatus;
  created_at: string;
  ended_at?: string;
  participant_count?: number;
  action_item_count?: number;
  quality_score?: number;
  updated_at?: string;
}

// ─── API Response Shapes ───────────────────────────────────────────────────

export interface ListRoomsResponse {
  rooms: CassandraRoomListItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface CreateRoomResponse {
  room: CassandraRoomFull;
  session_id: string;
}

export interface CorrectTranscriptResponse {
  segment_id: string;
  corrected_text: string;
  memory_written: boolean;
}
