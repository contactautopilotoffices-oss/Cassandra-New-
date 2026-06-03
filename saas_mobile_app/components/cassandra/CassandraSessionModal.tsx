/**
 * Cassandra Session Modal — Full-screen voice + chat interaction
 *
 * Opens as a true full-screen modal overlay when the orb is tapped.
 * Matches the original intended design: orb, capability grid, recent-chat
 * suggestions, and the Cassandra input bar.
 *
 * Chat messages are bottom-aligned (newest at the bottom) like a normal
 * text-chat app (WhatsApp / iMessage style).
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { readFileAsArrayBuffer } from '@/utils/mediaUtils';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCassandraStore } from '@/stores/cassandraStore';
import { useAuth } from '@/hooks/useAuth';
// All chat goes through ONE endpoint: POST /chat
// No client-side tool routing.
import { useTextToSpeech } from '@/hooks/voice/useTextToSpeech';
import { useCassandraVoice } from '@/hooks/voice/useCassandraVoice';
import { toast } from '@/lib/toast';
import {
  Colors,
  Typography,
  Spacing as CassSpacing,
  Radius,
} from '@/constants/cassandra-theme';
import {
  MODAL_TOKENS,
  SPACING,
  CARD_SURFACES,
} from '@/constants/designSystem';
import SidekickFace, { type FaceState } from '@/components/dashboard/SidekickFace';
import ReasoningBubble from '@/components/cassandra/ReasoningBubble';
import Svg, { Path } from 'react-native-svg';
import { streamChat, type StreamChatOptions } from '@/services/cassandra/chat';
import {
  createChatSession,
  listChatSessions,
  getChatSession,
  addChatMessage,
  deleteChatSession,
} from '@/lib/cassandra';
import type { ChatSession } from '@/lib/cassandra';
import { supabase } from '@/utils/supabase';

// ─── Icons ─────────────────────────────────────────────────────────────────
const SendIcon = ({ size = 20, color = '#fff' }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
  </Svg>
);

const MicIcon = ({ size = 20, color = '#fff' }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <Path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <Path d="M12 19v4M8 23h8" />
  </Svg>
);

const CloseIcon = ({ size = 18, color = '#fff' }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round">
    <Path d="M18 6L6 18M6 6l12 12" />
  </Svg>
);

const AttachmentIcon = ({ size = 20, color = '#9CA3AF' }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <Path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
  </Svg>
);

// ─── Skill Chip ────────────────────────────────────────────────────────────
const SkillChip = ({ label, onPress, variant = 'default' }: { label: string; onPress: () => void; variant?: 'default' | 'muted' }) => (
  <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={[styles.chip, variant === 'muted' && styles.chipMuted]}>
    <Text style={[styles.chipText, variant === 'muted' && styles.chipTextMuted]}>{label}</Text>
  </TouchableOpacity>
);

// ─── Chat Bubble ───────────────────────────────────────────────────────────
interface ChatMessage {
  id: string;
  role: 'user' | 'cassandra';
  text: string;
  variant?: 'default' | 'tool_call' | 'blocked';
  toolData?: {
    ticketId?: string;
    ticketNumber?: string;
    description?: string;
    status?: string;
    photoUrl?: string | null; // FIX C0-16: Show before-photo on ticket card
  };
  blockedReason?: string;
}

const ChatBubble = ({
  message,
  onRaiseRequest,
}: {
  message: ChatMessage;
  onRaiseRequest?: () => void;
}) => {
  const isUser = message.role === 'user';

  if (message.variant === 'tool_call' && message.toolData) {
    return (
      <View style={[styles.bubbleRow, styles.bubbleRowLeft]}>
        <View style={styles.toolCallCard}>
          <View style={styles.toolCallHeader}>
            <Text style={styles.toolCallIcon}>✅</Text>
            <Text style={styles.toolCallTitle}>Ticket Created</Text>
          </View>
          {/* FIX C0-16: Before photo thumbnail — left tile of the card */}
          {message.toolData.photoUrl && (
            <Image source={{ uri: message.toolData.photoUrl }} style={styles.toolCallPhoto} />
          )}
          {message.toolData.ticketNumber && (
            <Text style={styles.toolCallId}>#{message.toolData.ticketNumber}</Text>
          )}
          {message.toolData.description && (
            <Text style={styles.toolCallDesc}>{message.toolData.description}</Text>
          )}
          {message.toolData.status && (
            <View style={styles.toolCallStatusBadge}>
              <Text style={styles.toolCallStatusText}>{message.toolData.status}</Text>
            </View>
          )}
        </View>
      </View>
    );
  }

  if (message.variant === 'blocked') {
    return (
      <View style={[styles.bubbleRow, styles.bubbleRowLeft]}>
        <View style={styles.blockedCard}>
          <Text style={styles.blockedIcon}>🛡️</Text>
          <Text style={styles.blockedTitle}>Action Not Allowed</Text>
          <Text style={styles.blockedText}>
            {message.blockedReason || message.text}
          </Text>
          {onRaiseRequest && (
            <TouchableOpacity onPress={onRaiseRequest} activeOpacity={0.7} style={styles.blockedActionBtn}>
              <Text style={styles.blockedActionText}>Raise a request instead?</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.bubbleRow, isUser ? styles.bubbleRowRight : styles.bubbleRowLeft]}>
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleBot]}>
        <Text style={[styles.bubbleText, isUser ? styles.bubbleTextUser : styles.bubbleTextBot]}>
          {message.text}
        </Text>
      </View>
    </View>
  );
};

// ─── Status Ring (orb state visualization) ─────────────────────────────────
const StatusRing = ({ voiceState }: { voiceState: string }) => {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (voiceState === 'recording') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.4, duration: 1200, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 0, useNativeDriver: true }),
        ])
      ).start();
    } else if (voiceState === 'processing') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.15, duration: 600, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulse.setValue(1);
    }
  }, [voiceState]);

  const color = voiceState === 'speaking' ? Colors.violet
    : voiceState === 'recording' ? Colors.cyan
    : voiceState === 'processing' ? Colors.warning
    : voiceState === 'error' ? Colors.error
    : Colors.violet;
  const isActive = voiceState === 'recording' || voiceState === 'processing' || voiceState === 'speaking';

  return (
    <Animated.View
      style={[
        styles.statusRing,
        {
          transform: [{ scale: pulse }],
          borderColor: color,
          opacity: isActive ? 0.5 : 0,
        },
      ]}
    />
  );
};

// ─── Capability Grid ───────────────────────────────────────────────────────
const WHAT_I_CAN_DO = [
  { label: 'Triage tickets', message: 'Show me critical and high-priority open tickets' },
  { label: 'Explain energy spikes', message: 'Explain recent energy spikes at this property' },
  { label: 'Find on-call staff', message: 'Who is on call right now?' },
  { label: 'Summarise reports', message: 'Summarise this week\'s reports' },
];

const MST_SKILLS = [
  { label: 'My tickets', message: 'Show my active tickets' },
  { label: 'Shift status', message: 'Am I checked in?' },
  { label: 'Leaderboard', message: 'Show team leaderboard' },
];

const RECENT_CHATS = [
  { label: 'Show critical tickets at SS Plaza', message: 'Show critical tickets at SS Plaza' },
  { label: 'Energy spike yesterday — why?', message: 'Why was there an energy spike yesterday?' },
  { label: 'Open checklist items for today', message: 'Open checklist items for today' },
  { label: 'Compare health across properties', message: 'Compare health scores across properties' },
  { label: 'Who\'s on call for Bajaj Kolkata?', message: 'Who is on call for Bajaj Kolkata?' },
];

// ─── Main Modal ────────────────────────────────────────────────────────────
interface CassandraSessionModalProps {
  visible: boolean;
  onClose: () => void;
  orgId: string;
  propertyId?: string;
  initialMode?: 'text' | 'voice';
}

export const CassandraSessionModal: React.FC<CassandraSessionModalProps> = ({
  visible,
  onClose,
  orgId,
  propertyId,
  initialMode = 'text',
}) => {
  console.log('[CassandraSessionModal] render. visible:', visible, 'orgId:', orgId, 'propertyId:', propertyId);
  const { user, membership } = useAuth();
  // Fallback: derive orgId from membership if the prop arrives empty (race condition on mount)
  const resolvedOrgId = orgId || membership?.org_id || '';
  const userProperties = membership?.properties ?? [];
  const insets = useSafeAreaInsets();
  const {
    voiceState,
    isConnected,
    addMessage,
    messageHistory,
    setVoiceState,
  } = useCassandraStore();
  const [inputText, setInputText] = useState('');
  const [inputMode, setInputMode] = useState<'text' | 'voice'>(initialMode);
  const [isTyping, setIsTyping] = useState(false);
  const [currentResponse, setCurrentResponse] = useState('');
  const [view, setView] = useState<'home' | 'chat' | 'history'>('home');
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const sessionId = useRef(Math.random().toString(36).slice(2)).current;
  const scrollRef = useRef<ScrollView>(null);
  const orbScale = useRef(new Animated.Value(1)).current;
  const abortRef = useRef<AbortController | null>(null);
  const introShownRef = useRef(false);
  const { speak, stop: stopSpeaking } = useTextToSpeech();

  // ── Reasoning state (PRD: SSE Streaming) ────────────────────────────────
  const [reasoningSteps, setReasoningSteps] = useState<string[]>([]);
  const [isReasoningActive, setIsReasoningActive] = useState(false);

  // ── Attachment / Property state ───────────────────────────────────────────
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // Auto-select a property when none is passed as a prop:
  // 1. Explicit prop → use it
  // 2. Only one property in membership → auto-select it (removes "undefined" forever)
  // 3. Multiple properties → stay undefined so the in-modal picker is shown
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | undefined>(() => {
    if (propertyId) return propertyId;
    const props = membership?.properties ?? [];
    if (props.length === 1) return props[0].id;
    return undefined;
  });

  // If membership loads AFTER the modal mounts (async fetch), re-run auto-select
  // so selectedPropertyId is never stuck as undefined once data is available.
  React.useEffect(() => {
    if (!selectedPropertyId && !propertyId) {
      const props = membership?.properties ?? [];
      if (props.length === 1) {
        setSelectedPropertyId(props[0].id);
      }
    }
  }, [membership?.properties, propertyId, selectedPropertyId]);

  const voice = useCassandraVoice(resolvedOrgId, {
    onStateChange: useCassandraStore.getState().setVoiceState,
    onTranscript: (text, speakerId) => {
      useCassandraStore.getState().addTranscriptSegment(text, speakerId);
      if (text.trim()) {
        useCassandraStore.getState().addMessage({ role: 'user', text });
      }
    },
    onAudioPlaybackStart: () => {},
    onAudioPlaybackEnd: () => {
      stopSpeaking();
      useCassandraStore.getState().setVoiceState('idle');
    },
    onTicketCreated: (id, desc) => {
      toast.success(`Ticket ${id} created: ${desc}`);
      useCassandraStore.getState().addMessage({ role: 'cassandra', text: `Ticket ${id} created: ${desc}` });
    },
    onError: (err) => {
      toast.error(err);
      useCassandraStore.getState().setConnectionError(err);
    },
  });

  useEffect(() => {
    if (voiceState !== 'idle' || !visible) return;
    const breathe = Animated.loop(
      Animated.sequence([
        Animated.timing(orbScale, { toValue: 1.05, duration: 2000, useNativeDriver: true }),
        Animated.timing(orbScale, { toValue: 1, duration: 2000, useNativeDriver: true }),
      ])
    );
    breathe.start();
    return () => breathe.stop();
  }, [voiceState, visible]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // ─── Session management ────────────────────────────────────────────────────

  useEffect(() => {
    if (visible && view === 'home' && !currentSessionId && user?.id) {
      createChatSession(user.id, resolvedOrgId, 'New Chat', selectedPropertyId).then((session) => {
        setCurrentSessionId(session.id);
      }).catch(() => {
        // Fallback: use local session id
        setCurrentSessionId(sessionId);
      });
    }
  }, [visible, view, currentSessionId, user?.id, resolvedOrgId, selectedPropertyId]);

  useEffect(() => {
    if (visible) {
      // FIX: Intro message when Cassandra opens (once per modal session)
      if (!introShownRef.current && messageHistory.length === 0 && view === 'home') {
        introShownRef.current = true;
        const introMessage =
          "Hello! I'm Cassandra, your property assistant. I can help with tickets, reports, staff lookups, and more. What would you like to know?";
        addMessage({ role: 'cassandra', text: introMessage });
        // Speak intro if in voice mode
        if (initialMode === 'voice') {
          speak(introMessage);
          setVoiceState('speaking');
        }
      }
    }
    if (!visible) {
      introShownRef.current = false;
      setView('home');
      setCurrentSessionId(null);
      voice.endSession();
      stopSpeaking();
      setVoiceState('idle');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (visible && initialMode === 'voice' && voiceState === 'idle') {
      setInputMode('voice');
      voice.startSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initialMode]);

  const loadHistory = useCallback(async () => {
    if (!user?.id) return;
    setIsLoadingHistory(true);
    try {
      const data = await listChatSessions(user.id, resolvedOrgId);
      setSessions(data);
    } catch {
      toast.error('Failed to load chat history');
    } finally {
      setIsLoadingHistory(false);
    }
  }, [user?.id, resolvedOrgId]);

  const persistMessage = useCallback(async (role: string, text: string) => {
    if (!currentSessionId) return;
    try {
      await addChatMessage(currentSessionId, role, text);
    } catch {
      // Silently fail persistence — local state is source of truth
    }
  }, [currentSessionId]);

  const loadSession = useCallback(async (sid: string) => {
    try {
      const session = await getChatSession(sid);
      useCassandraStore.getState().clearMessages();
      session.messages.forEach((msg) => {
        useCassandraStore.getState().addMessage({ role: msg.role as 'user' | 'cassandra', text: msg.text });
      });
      setCurrentSessionId(session.id);
      setView('chat');
    } catch {
      toast.error('Failed to load session');
    }
  }, []);

  const handleNewChat = useCallback(() => {
    useCassandraStore.getState().clearMessages();
    setCurrentSessionId(null);
    setView('home');
  }, []);

  const handleOrbPress = () => {
    if (voiceState === 'speaking') {
      stopSpeaking();
      if (inputMode === 'voice') {
        voice.stopSession();
      }
      setVoiceState('idle');
      return;
    }
    if (inputMode === 'voice') {
      if (voice.state === 'idle' || voice.state === 'error') {
        voice.startSession();
      } else {
        voice.stopSession();
      }
      return;
    }
    if (voiceState === 'idle' || voiceState === 'error') {
      setVoiceState('processing');
    } else {
      setVoiceState('idle');
    }
  };

  // ── Image helpers ─────────────────────────────────────────────────────────
  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets?.[0]) {
      setAttachedImage(result.assets[0].uri);
    }
  };

  const uploadImageToStorage = useCallback(async (localUri: string): Promise<string | null> => {
    try {
      const compressed = await ImageManipulator.manipulateAsync(
        localUri,
        [{ resize: { width: 1200 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
      );
      const arrayBuffer = await readFileAsArrayBuffer(compressed.uri);
      const path = `cassandra-chat/${user?.id ?? 'anon'}/${Date.now()}.jpg`;
      const { error } = await supabase.storage.from('ticket_photos').upload(path, arrayBuffer, {
        contentType: 'image/jpeg',
        upsert: true,
      });
      if (error) throw error;
      const { data: publicUrlData } = supabase.storage.from('ticket_photos').getPublicUrl(path);
      return publicUrlData.publicUrl;
    } catch (err: any) {
      console.error('[uploadImageToStorage] failed:', err);
      toast.error('Failed to upload image: ' + (err?.message ?? 'unknown error'));
      return null;
    }
  }, [user?.id]);

  // ── Response parsers ──────────────────────────────────────────────────────
  const parseToolCall = (text: string): { isToolCall: boolean; toolData?: ChatMessage['toolData']; cleanText?: string } => {
    try {
      // FIX C0-16: Look for HTML comment-style ticket data first (from ResponseAgent)
      const commentMatch = text.match(/<!--TICKET_DATA\{[\s\S]*?\}TICKET_DATA-->/);
      if (commentMatch) {
        const jsonStr = commentMatch[0]
          .replace('<!--TICKET_DATA{', '{')
          .replace('}TICKET_DATA-->', '}')
          .replace(/\\\"/g, '"'); // unescape quotes
        const parsed = JSON.parse(jsonStr);
        return {
          isToolCall: true,
          toolData: {
            ticketId: parsed.ticket_id ?? parsed.id,
            ticketNumber: parsed.ticket_id ?? parsed.id,
            description: parsed.title ?? parsed.description ?? '',
            status: parsed.status ?? 'Created',
            // FIX C0-16: Extract photo_before_url to render before-photo tile
            photoUrl: parsed.photo_before_url || null,
          },
          cleanText: text.replace(commentMatch[0], '').trim(),
        };
      }

      // Fallback: Look for JSON objects that contain ticket creation data
      const jsonMatch = text.match(/\{[\s\S]*"ticket_id"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.ticket_id || parsed.ticket_number || parsed.id) {
          return {
            isToolCall: true,
            toolData: {
              ticketId: parsed.ticket_id ?? parsed.id,
              ticketNumber: parsed.ticket_number ?? parsed.ticket_id ?? parsed.id,
              description: parsed.description ?? parsed.title,
              status: parsed.status ?? 'Created',
              // FIX C0-16: Extract photo_before_url from ticket result
              photoUrl: parsed.photo_before_url ?? parsed.photoUrl ?? null,
            },
            cleanText: text.replace(jsonMatch[0], '').trim(),
          };
        }
      }
    } catch { /* ignore parse errors */ }
    return { isToolCall: false };
  };

  const isBlockedResponse = (text: string): boolean => {
    const lower = text.toLowerCase();
    return (
      lower.includes('blocked') ||
      lower.includes('not allowed') ||
      lower.includes('refusal') ||
      lower.includes('role cannot') ||
      lower.includes('unauthorized') ||
      lower.includes('permission denied') ||
      lower.includes('you do not have permission')
    );
  };

  const handleSend = useCallback(async (message: string) => {
    // ── State Gate: org_id must be present ────────────────────────────────
    if (!resolvedOrgId) {
      toast.error('Organization context missing. Please log in again.');
      return;
    }

    // Property context is optional — backend handles missing property gracefully

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setIsTyping(true);
    setView('chat');
    let fullResponse = '';

    let photoUrl: string | null = null;
    if (attachedImage) {
      setIsUploadingImage(true);
      photoUrl = await uploadImageToStorage(attachedImage);
      setIsUploadingImage(false);
      setAttachedImage(null);
      if (!photoUrl) {
        setIsTyping(false);
        return;
      }
    }

    const chatOptions: StreamChatOptions = {
      photoUrl: photoUrl ?? undefined,
      propertyId: selectedPropertyId ?? '',
      // Memory window: last 16 pairs = 32 messages (matches server MAX_HISTORY_MESSAGES).
      // Keeps the wire payload bounded on long sessions.
      conversationHistory: messageHistory.slice(-32).map(m => ({
        role: m.role === 'user' ? 'user' : 'cassandra',
        content: m.text,
      })),
    };

    // Reset reasoning for new message
    setReasoningSteps([]);
    setIsReasoningActive(true);

    streamChat(
      message,
      currentSessionId ?? sessionId,
      (token) => {
        fullResponse += token;
        setCurrentResponse(fullResponse);
      },
      async () => {
        setCurrentResponse('');
        setIsTyping(false);
        setIsReasoningActive(false);
        setReasoningSteps([]);  // Clear CoT — it's now in the message bubble, not floating

        // Don't add empty messages — happens when stream is aborted before any tokens
        if (!fullResponse.trim()) return;

        // Parse special response types
        if (isBlockedResponse(fullResponse)) {
          addMessage({
            role: 'cassandra',
            text: fullResponse,
            variant: 'blocked',
            blockedReason: fullResponse,
            reasoningSteps,
          });
          persistMessage('cassandra', fullResponse);
          if (inputMode === 'voice') {
            setVoiceState('speaking');
            await speak(fullResponse);
            setVoiceState('idle');
          }
          return;
        }

        const toolResult = parseToolCall(fullResponse);
        if (toolResult.isToolCall && toolResult.toolData) {
          addMessage({
            role: 'cassandra',
            text: toolResult.cleanText || fullResponse,
            variant: 'tool_call',
            toolData: toolResult.toolData,
            reasoningSteps,
          });
          persistMessage('cassandra', fullResponse);
          if (inputMode === 'voice') {
            setVoiceState('speaking');
            await speak(toolResult.cleanText || 'Ticket created successfully');
            setVoiceState('idle');
          }
          return;
        }

        addMessage({ role: 'cassandra', text: fullResponse, reasoningSteps });
        persistMessage('cassandra', fullResponse);
        // Speak the response if voice mode is active
        if (inputMode === 'voice') {
          setVoiceState('speaking');
          await speak(fullResponse);
          setVoiceState('idle');
        }
      },
      (err) => {
        console.log('[handleSend] streamChat ERROR:', err);
        setCurrentResponse('');
        setIsTyping(false);
        setIsReasoningActive(false);
        // Add a VISIBLE permanent error bubble — previous code set currentResponse
        // which vanished as soon as isTyping became false.
        addMessage({ role: 'cassandra', text: `⚠️ ${err}` });
      },
      abortRef.current.signal,
      chatOptions,
      (step) => {
        // Trim and deduplicate reasoning steps.
        // System prompt now emits short action labels so no heavy cleanup needed.
        const label = step
          .replace(/^Step\s*\d+[:\s]*/i, '')  // safety: strip any stray "Step 1:" prefix
          .trim()
          .substring(0, 60);
        if (!label) return;
        setReasoningSteps((prev) => {
          if (prev.length > 0 && prev[prev.length - 1] === label) return prev;
          return [...prev, label];
        });
      },
    );
  }, [sessionId, currentSessionId, addMessage, inputMode, speak, setVoiceState, persistMessage, attachedImage, selectedPropertyId, uploadImageToStorage]);

  // All skill chips just send a pre-filled message to /chat — no client-side routing.

  const statusLabels: Record<string, string> = {
    idle: 'Tap face to speak',
    authenticated: 'Ready — tap to speak',
    recording: 'Listening… speak now',
    connecting: 'Connecting…',
    processing: 'Cassandra is thinking…',
    speaking: 'Cassandra is speaking…',
    error: 'Something went wrong. Tap to retry.',
  };

  return (
    <Modal
      animationType="slide"
      presentationStyle="fullScreen"
      visible={visible}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Solid background — must fully occlude everything behind */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: MODAL_TOKENS.sheetBg }]} />

      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.headerSurface}>
          <View style={styles.header}>
            {view === 'chat' ? (
              <>
                <TouchableOpacity onPress={() => setView('home')} activeOpacity={0.7} style={styles.headerBackBtn}>
                  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={Colors.textPrimary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <Path d="M19 12H5M12 19l-7-7 7-7" />
                  </Svg>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Cassandra</Text>
                <TouchableOpacity onPress={() => { loadHistory(); setView('history'); }} activeOpacity={0.7} style={styles.headerMenuBtn}>
                  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={Colors.textPrimary} strokeWidth="2" strokeLinecap="round">
                    <Path d="M3 12h18M3 6h18M3 18h18" />
                  </Svg>
                </TouchableOpacity>
              </>
            ) : view === 'history' ? (
              <>
                <TouchableOpacity onPress={() => setView('chat')} activeOpacity={0.7} style={styles.headerBackBtn}>
                  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={Colors.textPrimary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <Path d="M19 12H5M12 19l-7-7 7-7" />
                  </Svg>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Chat History</Text>
                <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={styles.closeBtn}>
                  <CloseIcon />
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={styles.headerLeft}>
                  <View
                    style={[
                      styles.statusDot,
                      { backgroundColor: isConnected ? Colors.success : Colors.error },
                    ]}
                  />
                  <Text style={styles.headerTitle}>Cassandra</Text>
                </View>
                <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={styles.closeBtn}>
                  <CloseIcon />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={80}
        >
          {view === 'history' ? (
            /* ─── HISTORY VIEW: previous sessions ─── */
            <View style={styles.flex}>
              <View style={styles.historyHeader}>
                <TouchableOpacity onPress={handleNewChat} activeOpacity={0.7} style={styles.newChatBtn}>
                  <Text style={styles.newChatBtnText}>+ New Chat</Text>
                </TouchableOpacity>
              </View>
              {isLoadingHistory ? (
                <View style={styles.centered}>
                  <Text style={styles.loadingText}>Loading…</Text>
                </View>
              ) : sessions.length === 0 ? (
                <View style={styles.centered}>
                  <Text style={styles.emptyText}>No previous chats</Text>
                </View>
              ) : (
                <ScrollView style={styles.flex} showsVerticalScrollIndicator={false}>
                  {sessions.map((session) => (
                    <TouchableOpacity
                      key={session.id}
                      style={styles.historyItem}
                      onPress={() => loadSession(session.id)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.historyItemContent}>
                        <Text style={styles.historyItemTitle} numberOfLines={1}>{session.title}</Text>
                        <Text style={styles.historyItemDate}>{new Date(session.updated_at * 1000).toLocaleDateString()}</Text>
                      </View>
                      <TouchableOpacity
                        onPress={(e) => { e.stopPropagation(); deleteChatSession(session.id).then(() => loadHistory()).catch(() => {}); }}
                        activeOpacity={0.7}
                        style={styles.historyDeleteBtn}
                      >
                        <Text style={styles.historyDeleteText}>×</Text>
                      </TouchableOpacity>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          ) : view === 'chat' ? (
            /* ─── CHAT MODE: bottom-aligned messages ─── */
            <ScrollView
              ref={scrollRef}
              style={styles.flex}
              contentContainerStyle={styles.chatScrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {messageHistory.map((msg) => (
                <ChatBubble
                  key={msg.id}
                  message={msg as ChatMessage}
                  onRaiseRequest={() => {
                    const text = 'I would like to raise a request';
                    addMessage({ role: 'user', text });
                    handleSend(text);
                  }}
                />
              ))}
              {/* Reasoning bubble — shows Chain of Thought while streaming */}
              {(isReasoningActive || reasoningSteps.length > 0) && (
                <View style={styles.bubbleRowLeft}>
                  <ReasoningBubble
                    steps={reasoningSteps}
                    isActive={isReasoningActive}
                    onAbort={() => {
                      abortRef.current?.abort();
                      setIsReasoningActive(false);
                      setIsTyping(false);
                    }}
                  />
                </View>
              )}

              {isTyping && (
                <View style={[styles.bubbleRow, styles.bubbleRowLeft]}>
                  <View style={[styles.bubble, styles.bubbleBot]}>
                    <Text style={[styles.bubbleText, styles.bubbleTextBot]}>
                      {currentResponse || 'Cassandra is typing…'}
                    </Text>
                  </View>
                </View>
              )}
              {/* Suggestions strip at bottom of chat */}
              {!isTyping && (
                <View style={styles.suggestionsStrip}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suggestionsStripContent}>
                    {WHAT_I_CAN_DO.map((item) => (
                      <SkillChip key={item.label} label={item.label} onPress={() => { addMessage({ role: 'user', text: item.message }); setView('chat'); handleSend(item.message); }} />
                    ))}
                    {propertyId && MST_SKILLS.map((item) => (
                      <SkillChip key={item.label} label={item.label} onPress={() => { addMessage({ role: 'user', text: item.message }); setView('chat'); handleSend(item.message); }} />
                    ))}
                  </ScrollView>
                </View>
              )}
            </ScrollView>
          ) : (
            /* ─── HOME VIEW: orb + suggestions ─── */
            <ScrollView
              style={styles.flex}
              contentContainerStyle={styles.emptyScrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Orb Section */}
              <View style={styles.orbSection}>
                <StatusRing voiceState={voiceState} />
                <TouchableOpacity onPress={handleOrbPress} activeOpacity={0.9}>
                  <Animated.View style={{ transform: [{ scale: orbScale }] }}>
                    <SidekickFace
                      size={140}
                      state={voiceState === 'recording' || voiceState === 'connecting' ? 'listening' : voiceState === 'processing' ? 'thinking' : voiceState === 'error' ? 'alert' : voiceState as FaceState}
                    />
                  </Animated.View>
                </TouchableOpacity>
                <Text style={[styles.statusLabel, { color: voiceState === 'speaking' ? Colors.violet : voiceState === 'recording' ? Colors.cyan : voiceState === 'processing' ? Colors.warning : voiceState === 'error' ? Colors.error : Colors.textMuted }]}>
                  {statusLabels[voiceState] ?? 'Tap face to speak'}
                </Text>
              </View>

              {/* ─── WHAT I CAN DO ─── */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>WHAT I CAN DO</Text>
                <View style={styles.capabilityGrid}>
                  {WHAT_I_CAN_DO.map((item) => (
                    <SkillChip
                      key={item.label}
                      label={item.label}
                      variant="muted"
                      onPress={() => { addMessage({ role: 'user', text: item.message }); setView('chat'); handleSend(item.message); }}
                    />
                  ))}
                  {propertyId && MST_SKILLS.map((item) => (
                    <SkillChip
                      key={item.label}
                      label={item.label}
                      variant="muted"
                      onPress={() => { addMessage({ role: 'user', text: item.message }); setView('chat'); handleSend(item.message); }}
                    />
                  ))}
                </View>
              </View>

              {/* ─── BASED ON RECENT CHATS ─── */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>BASED ON RECENT CHATS</Text>
                <View style={styles.recentChipsWrap}>
                  {RECENT_CHATS.map((item) => (
                    <SkillChip
                      key={item.label}
                      label={item.label}
                      variant="muted"
                      onPress={() => { addMessage({ role: 'user', text: item.message }); setView('chat'); handleSend(item.message); }}
                    />
                  ))}
                </View>
              </View>
            </ScrollView>
          )}

          {/* Property Selector */}
          {userProperties.length > 1 && (
            <View style={styles.propertyBar}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.propertyBarContent}>
                <TouchableOpacity
                  onPress={() => setSelectedPropertyId(undefined)}
                  activeOpacity={0.7}
                  style={[styles.propertyChip, !selectedPropertyId && styles.propertyChipActive]}
                >
                  <Text style={[styles.propertyChipText, !selectedPropertyId && styles.propertyChipTextActive]}>
                    🏢 All Properties
                  </Text>
                </TouchableOpacity>
                {userProperties.map((prop) => (
                  <TouchableOpacity
                    key={prop.id}
                    onPress={() => setSelectedPropertyId(prop.id)}
                    activeOpacity={0.7}
                    style={[styles.propertyChip, selectedPropertyId === prop.id && styles.propertyChipActive]}
                  >
                    <Text style={[styles.propertyChipText, selectedPropertyId === prop.id && styles.propertyChipTextActive]}>
                      {prop.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Attached image preview */}
          {attachedImage && (
            <View style={styles.attachmentPreview}>
              <Image source={{ uri: attachedImage }} style={styles.attachmentThumb} />
              <TouchableOpacity onPress={() => setAttachedImage(null)} style={styles.attachmentRemove} activeOpacity={0.7}>
                <Text style={styles.attachmentRemoveText}>×</Text>
              </TouchableOpacity>
              {isUploadingImage && (
                <View style={styles.attachmentUploadingOverlay}>
                  <ActivityIndicator size="small" color="#fff" />
                </View>
              )}
            </View>
          )}

          {/* Input Bar */}
          <View
            style={[
              styles.inputBar,
              { paddingBottom: Math.max(insets.bottom, SPACING.md) },
            ]}
          >
            <TouchableOpacity onPress={pickImage} activeOpacity={0.7} style={styles.iconBtn}>
              <AttachmentIcon size={20} color={attachedImage ? Colors.violet : '#9CA3AF'} />
            </TouchableOpacity>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                value={inputText}
                onChangeText={setInputText}
                placeholder={attachedImage ? 'Describe the issue with this photo…' : 'Ask Cassandra anything…'}
                placeholderTextColor={Colors.textMuted}
                onSubmitEditing={() => { const text = inputText.trim(); if (text || attachedImage) { const messageText = text || (attachedImage ? 'Issue reported with attached photo' : ' '); addMessage({ role: 'user', text: messageText }); setInputText(''); setView('chat'); handleSend(messageText); } }}
                returnKeyType="send"
              />
              <TouchableOpacity onPress={handleOrbPress} activeOpacity={0.8} style={styles.micBtnInline}>
                <MicIcon size={16} color="#9CA3AF" />
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={() => { const text = inputText.trim(); if (text || attachedImage) { const messageText = text || (attachedImage ? 'Issue reported with attached photo' : ' '); addMessage({ role: 'user', text: messageText }); setInputText(''); setView('chat'); handleSend(messageText); } }}
              activeOpacity={0.7}
              style={[styles.sendBtn, (isUploadingImage) && { opacity: 0.5 }]}
              disabled={isUploadingImage}
            >
              {isUploadingImage ? <ActivityIndicator size="small" color="#fff" /> : <SendIcon />}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: MODAL_TOKENS.sheetBg,
  },
  flex: {
    flex: 1,
  },
  headerSurface: {
    backgroundColor: MODAL_TOKENS.sheetBg,
    borderBottomWidth: 1,
    borderBottomColor: CARD_SURFACES.cardBorder,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: CassSpacing.lg,
    paddingVertical: CassSpacing.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  headerTitle: {
    ...Typography.h2,
    color: Colors.textPrimary,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: CARD_SURFACES.cardBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: CARD_SURFACES.cardBorder,
  },
  /* ─── Chat (bottom-aligned) ─── */
  chatScrollContent: {
    paddingHorizontal: CassSpacing.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  bubbleRow: {
    width: '100%',
    marginBottom: CassSpacing.sm,
  },
  bubbleRowLeft: {
    alignItems: 'flex-start',
  },
  bubbleRowRight: {
    alignItems: 'flex-end',
  },
  bubble: {
    maxWidth: '80%',
    borderRadius: Radius.xl,
    paddingHorizontal: CassSpacing.md,
    paddingVertical: CassSpacing.sm,
  },
  bubbleBot: {
    backgroundColor: CARD_SURFACES.cardBg,
    borderWidth: 1,
    borderColor: CARD_SURFACES.cardBorder,
    borderTopLeftRadius: Radius.sm,
  },
  bubbleUser: {
    backgroundColor: Colors.violet,
    borderTopRightRadius: Radius.sm,
  },
  bubbleText: {
    ...Typography.body,
    lineHeight: 22,
  },
  bubbleTextBot: {
    color: Colors.textPrimary,
  },
  bubbleTextUser: {
    color: '#fff',
  },
  /* ─── Empty state ─── */
  emptyScrollContent: {
    paddingHorizontal: CassSpacing.lg,
    paddingBottom: SPACING.xl,
    flexGrow: 1,
  },
  orbSection: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xl,
    minHeight: 220,
  },
  statusRing: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 2,
  },
  statusLabel: {
    ...Typography.bodySmall,
    marginTop: SPACING.md,
    fontWeight: '500',
  },
  section: {
    marginBottom: CassSpacing.xl,
  },
  sectionTitle: {
    ...Typography.caption,
    color: Colors.textMuted,
    fontWeight: '600',
    letterSpacing: 0.8,
    marginBottom: CassSpacing.md,
    textTransform: 'uppercase',
  },
  capabilityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CassSpacing.sm,
  },
  recentChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: CassSpacing.sm,
  },
  chip: {
    backgroundColor: 'rgba(139,92,246,0.15)',
    borderRadius: Radius.full,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.30)',
  },
  chipMuted: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: Radius.lg,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  chipText: {
    ...Typography.caption,
    color: Colors.violetLight,
    fontWeight: '500',
  },
  chipTextMuted: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
  /* ─── Input Bar ─── */
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: CassSpacing.sm,
    paddingHorizontal: CassSpacing.lg,
    paddingTop: CassSpacing.md,
    borderTopWidth: 1,
    borderTopColor: CARD_SURFACES.cardBorder,
    backgroundColor: MODAL_TOKENS.sheetBg,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CARD_SURFACES.cardBg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: CARD_SURFACES.cardBorder,
    paddingLeft: CassSpacing.md,
  },
  input: {
    flex: 1,
    height: 44,
    color: Colors.textPrimary,
    ...Typography.body,
    paddingRight: 4,
  },
  micBtnInline: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.violet,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: CARD_SURFACES.cardBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: CARD_SURFACES.cardBorder,
  },
  headerMenuBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: CARD_SURFACES.cardBg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: CARD_SURFACES.cardBorder,
  },
  historyHeader: {
    paddingHorizontal: CassSpacing.lg,
    paddingVertical: CassSpacing.md,
  },
  newChatBtn: {
    backgroundColor: Colors.violet,
    borderRadius: Radius.lg,
    paddingHorizontal: CassSpacing.lg,
    paddingVertical: CassSpacing.md,
    alignItems: 'center',
  },
  newChatBtnText: {
    ...Typography.body,
    color: '#fff',
    fontWeight: '600',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    ...Typography.body,
    color: Colors.textMuted,
  },
  emptyText: {
    ...Typography.body,
    color: Colors.textMuted,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: CassSpacing.lg,
    paddingVertical: CassSpacing.md,
    borderBottomWidth: 1,
    borderBottomColor: CARD_SURFACES.cardBorder,
  },
  historyItemContent: {
    flex: 1,
  },
  historyItemTitle: {
    ...Typography.body,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  historyItemDate: {
    ...Typography.caption,
    color: Colors.textMuted,
    marginTop: 2,
  },
  historyDeleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(239,68,68,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyDeleteText: {
    color: '#ef4444',
    fontSize: 18,
    fontWeight: '600',
  },
  suggestionsStrip: {
    paddingVertical: CassSpacing.md,
    paddingHorizontal: CassSpacing.lg,
  },
  suggestionsStripContent: {
    gap: CassSpacing.sm,
  },
  /* ─── Property Selector ─── */
  propertyBar: {
    borderTopWidth: 1,
    borderTopColor: CARD_SURFACES.cardBorder,
    backgroundColor: MODAL_TOKENS.sheetBg,
    paddingHorizontal: CassSpacing.lg,
    paddingVertical: CassSpacing.sm,
  },
  propertyBarContent: {
    gap: CassSpacing.sm,
  },
  propertyChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: CARD_SURFACES.cardBg,
    borderWidth: 1,
    borderColor: CARD_SURFACES.cardBorder,
  },
  propertyChipActive: {
    backgroundColor: 'rgba(139,92,246,0.25)',
    borderColor: 'rgba(139,92,246,0.5)',
  },
  propertyChipText: {
    ...Typography.caption,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
  propertyChipTextActive: {
    color: Colors.violetLight,
    fontWeight: '600',
  },
  /* ─── Attachment Preview ─── */
  attachmentPreview: {
    paddingHorizontal: CassSpacing.lg,
    paddingTop: CassSpacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: CassSpacing.sm,
  },
  attachmentThumb: {
    width: 56,
    height: 56,
    borderRadius: Radius.lg,
    backgroundColor: CARD_SURFACES.cardBg,
  },
  attachmentRemove: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(239,68,68,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachmentRemoveText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
  },
  attachmentUploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /* ─── Tool Call Card ─── */
  toolCallCard: {
    maxWidth: '80%',
    backgroundColor: 'rgba(16,185,129,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
    borderRadius: Radius.xl,
    paddingHorizontal: CassSpacing.md,
    paddingVertical: CassSpacing.sm,
    borderTopLeftRadius: Radius.sm,
    gap: CassSpacing.sm,
  },
  toolCallHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: CassSpacing.sm,
  },
  toolCallIcon: {
    fontSize: 16,
  },
  toolCallTitle: {
    ...Typography.body,
    color: '#10B981',
    fontWeight: '700',
  },
  toolCallId: {
    ...Typography.bodySmall,
    color: Colors.textPrimary,
    fontWeight: '600',
  },
  toolCallDesc: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  toolCallStatusBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
  },
  // FIX C0-16: Before photo thumbnail on ticket creation card
  toolCallPhoto: {
    width: 64,
    height: 64,
    borderRadius: Radius.lg,
    backgroundColor: '#1E293B',
  },
  toolCallStatusText: {
    ...Typography.caption,
    color: '#10B981',
    fontWeight: '700',
    fontSize: 11,
  },
  /* ─── Blocked Card ─── */
  blockedCard: {
    maxWidth: '80%',
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
    borderRadius: Radius.xl,
    paddingHorizontal: CassSpacing.md,
    paddingVertical: CassSpacing.sm,
    borderTopLeftRadius: Radius.sm,
    alignItems: 'flex-start',
    gap: CassSpacing.sm,
  },
  blockedIcon: {
    fontSize: 20,
  },
  blockedTitle: {
    ...Typography.body,
    color: '#F59E0B',
    fontWeight: '700',
  },
  blockedText: {
    ...Typography.caption,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  blockedActionBtn: {
    marginTop: CassSpacing.sm,
    backgroundColor: 'rgba(245,158,11,0.15)',
    borderRadius: Radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
  },
  blockedActionText: {
    ...Typography.caption,
    color: '#F59E0B',
    fontWeight: '700',
  },
});

export default CassandraSessionModal;
