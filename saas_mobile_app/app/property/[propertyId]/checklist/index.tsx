import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Image,
  Dimensions,
  Linking,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { useTheme } from "@/context";
import { useAuth } from "@/hooks/useAuth";
import { Colors } from "@/constants/Colors";
import SafeBlurView from "@/components/ui/SafeBlurView";

import { LoggersMenu } from "@/components/shared/LoggersMenu";
import { checklistService } from "@/services/checklistService";

import {
  CheckSquare,
  Plus,
  ClipboardList,
  Play,
  Clock,
  User,
  ChevronRight,
  X,
  Camera,
  CheckCircle2,
  Circle,
  ArrowLeft,
  AlertCircle,
  FileText,
  ListChecks,
  Trash2,
  Edit3,
  Pause,
  PlayCircle,
  History,
  MessageSquare,
  ChevronDown,
  RotateCcw,
  Calendar,
  Repeat,
  Lock,
  Eye,
  Video,
  LayoutGrid,
  Square,
  Loader2,
  Paperclip,
  Maximize2,
  Star,
} from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import Svg, { Circle as SvgCircle } from "react-native-svg";
import { useDashboardFetch } from "@/hooks/useDashboardFetch";
import { queryKeys } from '@/utils/queryKeys';

const { width: SCREEN_W } = Dimensions.get("window");

// ─── Types ─────────────────────────────────────────────────────────────────────

type Frequency =
  | "daily"
  | "weekly"
  | "monthly"
  | "on_demand"
  | "every_1_hour"
  | "every_2_hours"
  | "every_3_hours"
  | "every_4_hours"
  | "every_6_hours"
  | "every_8_hours"
  | "every_12_hours";

type ItemType = "checkbox" | "text" | "number" | "yes_no";

interface ChecklistItem {
  id: string;
  title: string;
  description?: string;
  type: ItemType;
  order_index: number;
  section_title?: string;
  requires_photo: boolean;
  requires_comment: boolean;
  is_optional: boolean;
  start_time?: string;
  end_time?: string;
}

interface SOPCompletionItem {
  id: string;
  is_checked: boolean;
  photo_url?: string;
  video_url?: string;
  comment?: string;
  value?: string;
  checked_at?: string;
  checked_by?: string;
  checklist_item_id: string;
  checked_by_user?: { full_name: string };
  admin_rating?: number | null;
}

interface SOPCompletion {
  id: string;
  template_id: string;
  status: "in_progress" | "completed" | "partial" | "missed";
  completion_date?: string;
  slot_time?: string;
  completed_at?: string;
  completed_by?: string;
  notes?: string;
  is_late?: boolean;
  created_at: string;
  items: SOPCompletionItem[];
  user?: { id: string; full_name: string };
  admin_rating?: number | null;
}

interface SOPTemplate {
  id: string;
  title: string;
  description?: string;
  category?: string;
  frequency: Frequency;
  is_running: boolean;
  is_active: boolean;
  start_time?: string;
  end_time?: string;
  assigned_to?: string[];
  property_id: string;
  organization_id?: string;
  created_by?: string;
  created_at: string;
  items: ChecklistItem[];
  completions: SOPCompletion[];
}

interface PropertyMember {
  id: string;
  full_name: string;
  role: string;
}

interface MissedOccurrence {
  template: SOPTemplate;
  date: string;
  slotTime: string | null;
  label: string;
}

// ─── Utility Functions ──────────────────────────────────────────────────────────

const FREQUENCY_OPTIONS: { value: Frequency; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "on_demand", label: "On Demand" },
  { value: "every_1_hour", label: "Every 1 Hour" },
  { value: "every_2_hours", label: "Every 2 Hours" },
  { value: "every_3_hours", label: "Every 3 Hours" },
  { value: "every_4_hours", label: "Every 4 Hours" },
  { value: "every_6_hours", label: "Every 6 Hours" },
  { value: "every_8_hours", label: "Every 8 Hours" },
  { value: "every_12_hours", label: "Every 12 Hours" },
];

function getFrequencyLabel(freq: Frequency | undefined | null): string {
  return (
    FREQUENCY_OPTIONS.find((f) => f.value === freq)?.label ?? freq ?? "Daily"
  );
}

function getHourlyInterval(freq: Frequency | undefined | null): number | null {
  if (!freq) return null;
  const match = freq.match(/^every_(\d+)_hours?$/);
  return match ? parseInt(match[1]) : null;
}

function isHourlyFreq(freq: Frequency | undefined | null): boolean {
  return getHourlyInterval(freq) !== null;
}

function parseHourlyInterval(frequency: string): number | null {
  const m = frequency.match(/^every_(\d+)_hours?$/);
  return m ? parseInt(m[1]) : null;
}

function frequencyLabel(frequency: string): string {
  const hourly = parseHourlyInterval(frequency);
  if (hourly) return hourly === 1 ? "Every 1 hr" : `Every ${hourly} hrs`;
  const map: Record<string, string> = {
    daily: "Daily",
    weekly: "Weekly",
    monthly: "Monthly",
    on_demand: "On Demand",
  };
  return map[frequency] ?? frequency;
}

function fmt12h(hhmm: string | undefined | null): string {
  if (!hhmm) return "—";
  const [h, m] = hhmm.slice(0, 5).split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function computeSlotTime(
  frequency: Frequency | undefined | null,
  startTime: string | undefined,
  endTime: string | undefined,
  now: Date,
): string | null {
  const interval = getHourlyInterval(frequency);
  if (!interval || !startTime) return null;
  const [sH, sM] = (startTime || "00:00").slice(0, 5).split(":").map(Number);
  const [eH, eM] = (endTime || "23:59").slice(0, 5).split(":").map(Number);
  const startMins = sH * 60 + sM;
  const endMins = eH * 60 + eM;
  let nowMins = now.getHours() * 60 + now.getMinutes();

  const isOvernight = endMins <= startMins;
  if (isOvernight && nowMins < endMins) nowMins += 1440;

  const elapsed = Math.max(0, nowMins - startMins);
  const slotIndex = Math.floor(elapsed / (interval * 60));
  const slotStartMins = startMins + slotIndex * interval * 60;
  const h = Math.floor(slotStartMins / 60) % 24;
  const mn = slotStartMins % 60;
  return `${String(h).padStart(2, "0")}:${String(mn).padStart(2, "0")}`;
}

function isWithinTimeWindow(nm: number, st: string, et: string): boolean {
  const [sh, sm] = st.slice(0, 5).split(":").map(Number);
  const [eh, em] = et.slice(0, 5).split(":").map(Number);
  const smins = sh * 60 + sm;
  const emins = eh * 60 + em;
  if (emins <= smins) return nm >= smins || nm < emins;
  return nm >= smins && nm <= emins;
}

function computeCurrentSlotStart(
  frequency: string,
  startTime: string | null,
  now: Date,
  endTime?: string | null,
): string | null {
  const intervalH = parseHourlyInterval(frequency);
  if (!intervalH || !startTime) return null;
  const [sH, sM] = startTime.slice(0, 5).split(":").map(Number);
  const startMins = sH * 60 + sM;
  const [eH, eM] = (endTime || "23:59").slice(0, 5).split(":").map(Number);
  const endMins = eH * 60 + eM;
  let nowMins = now.getHours() * 60 + now.getMinutes();

  const isOvernight = endMins <= startMins;
  if (isOvernight && nowMins < endMins) nowMins += 1440;

  const elapsed = nowMins - startMins;
  if (elapsed < 0) return null;
  let slotStartMins =
    startMins + Math.floor(elapsed / (intervalH * 60)) * intervalH * 60;
  if (endTime && !isOvernight) {
    const endMinsVal = eH * 60 + eM;
    if (endMinsVal <= startMins) return null;
    const lastValidSlotStart =
      startMins +
      Math.floor((endMinsVal - startMins - intervalH * 60) / (intervalH * 60)) *
        intervalH *
        60;
    if (lastValidSlotStart < startMins) return null;
    if (slotStartMins > lastValidSlotStart) return null;
  }
  const h = Math.floor(slotStartMins / 60) % 24;
  const mn = slotStartMins % 60;
  return `${String(h).padStart(2, "0")}:${String(mn).padStart(2, "0")}`;
}

type DueStatus = "due" | "missed" | "completed" | "upcoming" | "paused" | "";

function computeDueStatus(
  frequency: Frequency | undefined | null,
  lastCompletionDate: string | null | undefined,
  startTime: string | undefined,
  endTime: string | undefined,
  lastCompletedAt: string | null | undefined,
  template: SOPTemplate,
  completions: SOPCompletion[],
  refDate: Date,
): { due: boolean; label: string; status: DueStatus } {
  if (frequency === "on_demand") return { due: false, label: "", status: "" };

  const nowMins = refDate.getHours() * 60 + refDate.getMinutes();
  const today = new Date(
    refDate.getFullYear(),
    refDate.getMonth(),
    refDate.getDate(),
  );
  const intervalH = parseHourlyInterval(frequency ?? "");

  // Hourly + time window
  if (intervalH !== null && startTime && endTime) {
    const [sH, sM] = startTime.slice(0, 5).split(":").map(Number);
    const [eH, eM] = endTime.slice(0, 5).split(":").map(Number);
    const startMins = sH * 60 + sM;
    const endMins = eH * 60 + eM;
    const isOvernight = endMins <= startMins;
    let baselineDate = today;
    if (isOvernight && nowMins < endMins)
      baselineDate = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const windowDurationMins = isOvernight
      ? 1440 - startMins + endMins
      : endMins - startMins;
    const todaySlots: Date[] = [];
    for (
      let t = 0;
      t + intervalH * 60 <= windowDurationMins;
      t += intervalH * 60
    ) {
      todaySlots.push(new Date(baselineDate.getTime() + t * 60 * 1000));
    }
    const passedSlots = todaySlots.filter((s) => s <= refDate);
    const currentSlot =
      passedSlots.length > 0 ? passedSlots[passedSlots.length - 1] : null;

    const createdTime = new Date(template.created_at).getTime();
    const intervalMs = intervalH * 3600000;
    const currentSlotEnd = currentSlot ? currentSlot.getTime() + intervalMs : 0;

    if (!currentSlot || currentSlotEnd < createdTime) {
      if (!currentSlot)
        return {
          due: false,
          label: `Starts at ${fmt12h(startTime)}`,
          status: "upcoming",
        };
      // If the template was created AFTER this slot already finished, then it's upcoming
      return { due: false, label: "Waiting for next slot", status: "upcoming" };
    }

    const currentSlotStr = computeCurrentSlotStart(
      frequency ?? "",
      startTime,
      refDate,
      endTime,
    );
    const safeDate = (dStr: string) =>
      new Date(dStr.includes("T") ? dStr : dStr + "T00:00:00");
    const lastDone = lastCompletedAt
      ? new Date(lastCompletedAt)
      : lastCompletionDate
        ? safeDate(lastCompletionDate)
        : null;
    const isDone = lastDone && lastDone >= currentSlot;

    if (isDone) {
      const nextSlot = todaySlots.find((s) => s > refDate);
      if (!nextSlot)
        return { due: false, label: "All done today", status: "completed" };
      const remainingMs = nextSlot.getTime() - refDate.getTime();
      const remMin = Math.floor(remainingMs / 60000);
      const label =
        remMin >= 60
          ? `Next in ${Math.floor(remMin / 60)}h`
          : `Next in ${remMin}m`;
      return { due: false, label, status: "completed" };
    }

    if (isWithinTimeWindow(nowMins, startTime, endTime)) {
      const overdueMs = refDate.getTime() - currentSlot.getTime();
      const overdueMin = Math.floor(overdueMs / 60000);
      if (overdueMin < 2) return { due: true, label: "Due now", status: "due" };
      const label =
        overdueMin >= 60
          ? `Overdue ${Math.floor(overdueMin / 60)}h`
          : `Overdue ${overdueMin}m`;
      return { due: true, label, status: "due" };
    }

    return { due: false, label: "Missed slot", status: "missed" };
  }

  // Hourly without time window
  if (intervalH !== null) {
    const safeDate = (dStr: string) =>
      new Date(dStr.includes("T") ? dStr : dStr + "T00:00:00");
    const lastTs = lastCompletedAt
      ? new Date(lastCompletedAt)
      : lastCompletionDate
        ? safeDate(lastCompletionDate)
        : null;
    if (!lastTs) return { due: true, label: "Not started", status: "due" };
    const diffMs = refDate.getTime() - lastTs.getTime();
    const intervalMs = intervalH * 60 * 60 * 1000;
    const remainingMs = intervalMs - diffMs;
    if (remainingMs > 0) {
      const remMin = Math.floor(remainingMs / 60000);
      const label =
        remMin >= 60
          ? `Next in ${Math.floor(remMin / 60)}h`
          : `Next in ${remMin}m`;
      return { due: false, label, status: "upcoming" };
    }
    const overdueMin = Math.floor((diffMs - intervalMs) / 60000);
    const label =
      overdueMin >= 60
        ? `Overdue ${Math.floor(overdueMin / 60)}h`
        : `Overdue ${overdueMin}m`;
    return { due: true, label, status: "due" };
  }

  // Daily / weekly / monthly
  const [sH_d, sM_d] = (startTime || "00:00")
    .slice(0, 5)
    .split(":")
    .map(Number);
  const [eH_d, eM_d] = (endTime || "23:59").slice(0, 5).split(":").map(Number);
  const startMins_d = sH_d * 60 + sM_d;
  const endMins_d = eH_d * 60 + eM_d;

  const overnightBaselineDate =
    startTime && endTime && endMins_d <= startMins_d && nowMins < endMins_d
      ? new Date(today.getTime() - 24 * 60 * 60 * 1000)
      : today;
  const baselineDateStr = overnightBaselineDate.toLocaleDateString("en-CA");

  if (!lastCompletionDate) {
    if (frequency === "daily" && startTime && endTime) {
      if (isWithinTimeWindow(nowMins, startTime, endTime))
        return { due: true, label: "Due now", status: "due" };
      const [sh] = startTime.slice(0, 5).split(":").map(Number);
      if (nowMins < sh * 60 && !(endMins_d <= sh * 60 && nowMins < endMins_d))
        return {
          due: false,
          label: `Starts at ${fmt12h(startTime)}`,
          status: "upcoming",
        };
      return { due: true, label: "Missed", status: "missed" };
    }
    return { due: true, label: "Not started", status: "due" };
  }

  if (frequency === "daily") {
    const isDoneToday = lastCompletionDate === baselineDateStr;
    if (isDoneToday)
      return { due: false, label: "Done today", status: "completed" };
    if (startTime && endTime) {
      if (isWithinTimeWindow(nowMins, startTime, endTime))
        return { due: true, label: "Due now", status: "due" };
      const [sh] = startTime.slice(0, 5).split(":").map(Number);
      if (nowMins < sh * 60 && !(endMins_d <= sh * 60 && nowMins < endMins_d))
        return {
          due: false,
          label: `Starts at ${fmt12h(startTime)}`,
          status: "upcoming",
        };
      return { due: true, label: "Missed", status: "missed" };
    }
    return { due: true, label: "Due today", status: "due" };
  }

  const safeDate = (dStr: string) =>
    new Date(dStr.includes("T") ? dStr : dStr + "T00:00:00");
  const last = safeDate(lastCompletionDate);
  const diffDays = Math.floor(
    (refDate.getTime() - last.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (frequency === "weekly") {
    if (diffDays < 7)
      return {
        due: false,
        label: `Due in ${7 - diffDays}d`,
        status: "upcoming",
      };
    return {
      due: true,
      label: diffDays === 7 ? "Due today" : `Overdue by ${diffDays - 7}d`,
      status: "due",
    };
  }
  if (frequency === "monthly") {
    if (diffDays < 30)
      return {
        due: false,
        label: `Due in ${30 - diffDays}d`,
        status: "upcoming",
      };
    return {
      due: true,
      label: diffDays === 30 ? "Due today" : `Overdue by ${diffDays - 30}d`,
      status: "due",
    };
  }

  return { due: false, label: "", status: "" };
}

function getTemplateGaps(
  template: SOPTemplate,
  completions: SOPCompletion[],
  refDate: Date,
  daysLimit = 7,
): MissedOccurrence[] {
  if (template.frequency === "on_demand") return [];
  const gaps: MissedOccurrence[] = [];
  const nowMins = refDate.getHours() * 60 + refDate.getMinutes();

  for (let i = 0; i < daysLimit; i++) {
    const d = new Date(refDate.getTime() - i * 24 * 60 * 60 * 1000);
    const dateStr = d.toLocaleDateString("en-CA");
    const isToday = i === 0;

    if (template.frequency === "daily" || isHourlyFreq(template.frequency)) {
      if (!template.start_time || !template.end_time) {
        // Simple daily
        const exists = completions.some(
          (c) => c.completion_date === dateStr && c.status === "completed",
        );
        if (!exists && !isToday) {
          gaps.push({
            template,
            date: dateStr,
            slotTime: null,
            label: `Missed: ${formatRelative(dateStr)}`,
          });
        }
      } else {
        // Hourly or Timed Daily
        const [sh, sm] = template.start_time.slice(0, 5).split(":").map(Number);
        const [eh, em] = template.end_time.slice(0, 5).split(":").map(Number);
        const startMins = sh * 60 + sm;
        const endMins = eh * 60 + em;
        const isOvernight = endMins <= startMins;
        const intervalH = getHourlyInterval(template.frequency);

        const baselineDate =
          isOvernight && nowMins < endMins && isToday
            ? new Date(d.getTime() - 24 * 60 * 60 * 1000)
            : d;
        const baselineStr = baselineDate.toLocaleDateString("en-CA");
        const windowDuration = isOvernight
          ? 1440 - startMins + endMins
          : endMins - startMins;

        const slots: { date: string; time: string; startTs: number }[] = [];
        if (intervalH) {
          for (
            let t = 0;
            t + intervalH * 60 <= windowDuration;
            t += intervalH * 60
          ) {
            const slotMins = startMins + t;
            const h = Math.floor(slotMins / 60) % 24;
            const mn = slotMins % 60;
            const timeStr = `${String(h).padStart(2, "0")}:${String(mn).padStart(2, "0")}`;
            slots.push({
              date: baselineStr,
              time: timeStr,
              startTs: baselineDate.getTime() + t * 60 * 1000,
            });
          }
        } else {
          // Timed Daily (1 slot)
          slots.push({
            date: baselineStr,
            time: template.start_time,
            startTs: baselineDate.getTime() + startMins * 60 * 1000,
          });
        }

        for (const slot of slots) {
          const slotTime = slot.startTs;
          if (slotTime > refDate.getTime()) continue; // Future

          // CRITICAL: Only count as missed if the slot started AFTER the template was created
          const createdTime = new Date(template.created_at).getTime();
          if (slotTime < createdTime - 5 * 60000) continue; // 5 min grace

          // Is it currently active? (If so, it's 'Due' not 'Missed' in the gaps list)
          const currentlyActive =
            isWithinTimeWindow(
              nowMins,
              template.start_time,
              template.end_time,
            ) &&
            isToday &&
            slot.startTs <= refDate.getTime() &&
            slot.startTs + (intervalH ? intervalH * 3600000 : 3600000) >
              refDate.getTime();

          if (currentlyActive) continue;

          const exists = completions.some(
            (c) =>
              c.completion_date === slot.date &&
              (slot.time === null || c.slot_time === slot.time) &&
              c.status === "completed",
          );

          if (!exists) {
            const logicalSlotStr = intervalH
              ? ` slot at ${fmt12h(slot.time)}`
              : "";
            gaps.push({
              template,
              date: slot.date,
              slotTime: slot.time,
              label: `${formatRelative(slot.date)}${logicalSlotStr}`,
            });
          }
        }
      }
    }
  }
  return gaps;
}

function formatRelative(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(
    dateStr.endsWith("Z") || dateStr.includes("T")
      ? dateStr
      : dateStr + "T00:00:00",
  );
  if (isNaN(d.getTime())) return dateStr;
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const diffDays = Math.floor(diff / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtRemaining(ms: number): string {
  const totalSecs = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function getSlotWindow(
  slotTime: string | null | undefined,
  frequency: string | undefined | null,
): string | null {
  const intervalH = parseHourlyInterval(frequency || "");
  if (!intervalH || !slotTime) return null;
  const [sH, sM] = slotTime.slice(0, 5).split(":").map(Number);
  const endH = (sH + intervalH) % 24;
  const endSlot = `${String(endH).padStart(2, "0")}:${String(sM).padStart(2, "0")}:00`;
  return `${fmt12h(slotTime)} – ${fmt12h(endSlot)}`;
}

// ─── Circular Progress Component ───────────────────────────────────────────────

function CircularProgress({
  progress,
  size = 40,
  strokeWidth = 4,
  color = "#3B82F6",
  bgColor = "#f1f5f9",
}: {
  progress: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  bgColor?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedProgress = Math.min(Math.max(progress, 0), 1);
  const strokeDashoffset = circumference * (1 - clampedProgress);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={{ position: "absolute" }}>
        {/* Background circle */}
        <SvgCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={bgColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Progress circle */}
        <SvgCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={[circumference, circumference]}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <Text
          style={{
            fontSize: Math.max(8, size * 0.22),
            fontWeight: "900",
            color: "#1A2332",
          }}
        >
          {Math.round(clampedProgress * 100)}%
        </Text>
      </View>
    </View>
  );
}

// ─── Main Screen ───────────────────────────────────────────────────────────────

type SubView = "history" | "templates" | "runner" | "detail";
type HistoryFilter = "all" | "due" | "upcoming" | "missed" | "completed" | "paused";
type DueStatusEntry = { due: boolean; label: string; status: DueStatus };
type HistoryItem =
  | { type: "template"; data: SOPTemplate }
  | { type: "completion"; data: SOPCompletion }
  | { type: "missed_occurrence"; data: MissedOccurrence };

// ─── Status Badge Component ────────────────────────────────────────────────────

function StatusBadge({ status, label }: { status: DueStatus; label: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    due: { bg: "#3B82F620", text: "#3B82F6" },
    missed: { bg: "#EF444420", text: "#EF4444" },
    completed: { bg: "#10B98120", text: "#10B981" },
    upcoming: { bg: "#F59E0B20", text: "#F59E0B" },
    paused: { bg: "#6B728020", text: "#6B7280" },
  };
  const c = colors[status] || colors.upcoming;
  return (
    <View
      style={{
        alignSelf: "flex-start",
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
        backgroundColor: c.bg,
        marginTop: 6,
      }}
    >
      <Text
        style={{
          fontSize: 9,
          fontFamily: "Urbanist-ExtraBold",
          letterSpacing: 0.5,
          color: c.text,
          textTransform: "uppercase",
        }}
      >
        {(status || "UPCOMING").toUpperCase()}
      </Text>
    </View>
  );
}

const TemplateCard = ({
  template,
  ds,
  lastDone,
  inProgress,
  onPress,
  onStart,
}: {
  template: SOPTemplate;
  ds: DueStatusEntry;
  lastDone?: SOPCompletion;
  inProgress?: SOPCompletion;
  onPress: () => void;
  onStart: () => void;
}) => {
  const isPaused = !template.is_running;
  const displayStatus: DueStatus = isPaused ? "paused" : (ds.status || (inProgress ? "due" : "upcoming"));
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
      <SafeBlurView intensity={40} style={[styles.historyCard, { marginBottom: 12 }]} tint="dark">
        <View style={styles.historyCardRow}>
          <View style={styles.historyCardContent}>
            <Text style={styles.historyTitle}>{template.title}</Text>
            <Text style={styles.historyMeta}>
              {getFrequencyLabel(template.frequency)}
              {template.start_time ? ` · ${fmt12h(template.start_time)}` : ""}
            </Text>
            {!!template.description && (
              <Text style={[styles.historyMeta, { marginTop: 4 }]} numberOfLines={2}>
                {template.description}
              </Text>
            )}

            <StatusBadge status={displayStatus} label={ds.label} />

            {!!lastDone?.completion_date && (
              <Text style={[styles.historyMeta, { marginTop: 6 }]}>
                Last done {formatRelative(lastDone.completion_date)}
              </Text>
            )}
            {!!ds.label && !isPaused && (
              <Text style={[styles.historyMeta, { marginTop: 2 }]}>
                {ds.label}
              </Text>
            )}
          </View>
          <View style={styles.historyCardRight}>
            <TouchableOpacity style={styles.startBtn} onPress={onStart}>
              <Play size={14} color="#FFFFFF" />
              <Text style={styles.startBtnText}>{inProgress ? "Resume" : isPaused ? "Start" : "Start"}</Text>
            </TouchableOpacity>
            <ChevronRight size={18} color="rgba(255,255,255,0.55)" />
          </View>
        </View>
      </SafeBlurView>
    </TouchableOpacity>
  );
}

const HistoryListCard = ({
  item,
  templates,
  dueStatusMap,
  onStart,
  onView,
}: {
  item: HistoryItem;
  templates: SOPTemplate[];
  dueStatusMap: Record<string, DueStatusEntry>;
  onStart: (template: SOPTemplate, inProgress?: SOPCompletion) => void;
  onView: (comp: SOPCompletion) => void;
}) => {
  if (item.type === "template") {
    const template = item.data;
    const inProgress = template.completions.find((comp: SOPCompletion) => comp.status === "in_progress");
    return (
      <TemplateCard
        template={template}
        ds={dueStatusMap[template.id] ?? { due: false, label: "", status: "" }}
        lastDone={template.completions
          .filter((comp: SOPCompletion) => comp.status === "completed")
          .sort(
            (a: SOPCompletion, b: SOPCompletion) =>
              new Date(b.completed_at || b.completion_date || 0).getTime() -
              new Date(a.completed_at || a.completion_date || 0).getTime()
          )[0]}
        inProgress={inProgress}
        onPress={() => {
          if (inProgress) onView(inProgress);
        }}
        onStart={() => onStart(template, inProgress)}
      />
    );
  }

  if (item.type === "completion") {
    const completion = item.data;
    const template = templates.find((entry) => entry.id === completion.template_id);
    return (
      <TouchableOpacity onPress={() => onView(completion)} activeOpacity={0.85}>
        <SafeBlurView intensity={40} style={[styles.historyCard, { marginBottom: 12 }]} tint="dark">
          <View style={styles.historyCardRow}>
            <View style={styles.historyCardContent}>
              <Text style={styles.historyTitle}>{template?.title || "Checklist Completion"}</Text>
              <Text style={styles.historyMeta}>
                {completion.status.replace("_", " ").toUpperCase()}
                {completion.completion_date ? ` · ${formatRelative(completion.completion_date)}` : ""}
              </Text>
              {!!completion.slot_time && (
                <Text style={styles.historyMeta}>{fmt12h(completion.slot_time)}</Text>
              )}
              {completion.admin_rating ? (
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4, gap: 2 }}>
                  {[1, 2, 3].map((star) => (
                    <Star
                      key={star}
                      size={10}
                      color={star <= completion.admin_rating! ? "#FBBF24" : "rgba(255,255,255,0.2)"}
                      fill={star <= completion.admin_rating! ? "#FBBF24" : "none"}
                    />
                  ))}
                  <Text style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", marginLeft: 4 }}>
                    {completion.admin_rating === 1 ? "Needs Work" : completion.admin_rating === 2 ? "Acceptable" : "Excellent"}
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={styles.historyCardRight}>
              <Eye size={16} color="#FFFFFF" />
            </View>
          </View>
        </SafeBlurView>
      </TouchableOpacity>
    );
  }

  const missed = item.data;
  return (
    <SafeBlurView intensity={40} style={[styles.historyCard, { marginBottom: 12 }]} tint="dark">
      <View style={styles.historyCardRow}>
        <View style={styles.historyCardContent}>
          <Text style={styles.historyTitle}>{missed.template.title}</Text>
          <Text style={styles.historyMeta}>Missed on {formatRelative(missed.date)}</Text>
          <Text style={styles.historyMeta}>{missed.label}</Text>
        </View>
        <View style={styles.historyCardRight}>
          <TouchableOpacity style={styles.startBtn} onPress={() => onStart(missed.template)}>
            <RotateCcw size={14} color="#FFFFFF" />
            <Text style={styles.startBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeBlurView>
  );
}

export default function ChecklistScreen() {
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  const { theme } = useTheme();
  const { user, membership } = useAuth();
  const router = useRouter();
  const colors = Colors[theme];
  const isDark = theme === "dark";
  const insets = useSafeAreaInsets();

  // ── State ────────────────────────────────────────────────────────────────────
  const [view, setView] = useState<SubView>("history");

  const [templates, setTemplates] = useState<SOPTemplate[]>([]);
  const [completions, setCompletions] = useState<SOPCompletion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateTemplate, setShowCreateTemplate] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<SOPTemplate | null>(
    null,
  );

  // Runner state
  const [activeTemplate, setActiveTemplate] = useState<SOPTemplate | null>(
    null,
  );
  const [activeCompletion, setActiveCompletion] =
    useState<SOPCompletion | null>(null);
  const [itemStates, setItemStates] = useState<
    Record<
      string,
      {
        checked: boolean;
        photo?: string;
        video?: string;
        value?: string;
        comment?: string;
        photoUploading?: boolean;
        videoUploading?: boolean;
        fileUploading?: boolean;
      }
    >
  >({});
  const [isSaving, setIsSaving] = useState(false);
  const [liveNow, setLiveNow] = useState(() => new Date());
  const [adminUnlocked, setAdminUnlocked] = useState(false);

  // History detail
  const [historyCompletion, setHistoryCompletion] =
    useState<SOPCompletion | null>(null);

  // Template form state
  const [tplTitle, setTplTitle] = useState("");
  const [tplDesc, setTplDesc] = useState("");
  const [tplCategory, setTplCategory] = useState("general");
  const [tplFrequency, setTplFrequency] = useState<Frequency>("daily");
  const [tplStartTime, setTplStartTime] = useState("");
  const [tplEndTime, setTplEndTime] = useState("");
  const [tplAssignedTo, setTplAssignedTo] = useState<string[]>([]);
  const [tplItems, setTplItems] = useState<
    {
      title: string;
      description: string;
      type: ItemType;
      requires_photo: boolean;
      requires_comment: boolean;
      is_optional: boolean;
      section_title: string;
      start_time: string;
      end_time: string;
    }[]
  >([]);

  // UI state
  const [propertyMembers, setPropertyMembers] = useState<PropertyMember[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(
    null,
  );
  const [expandedCompletions, setExpandedCompletions] = useState<
    Record<string, SOPCompletion[]>
  >({});
  const [showLoggersMenu] = useState(false);
  const realtimeChannel = useRef<any>(null);

  // ── Permissions ──────────────────────────────────────────────────────────────
  const isAdmin = useMemo(() => {
    if (!membership || !propertyId) return false;
    const prop = membership.properties.find((p) => p.id === propertyId);
    if (!prop) return false;
    return [
      "property_admin",
      "org_admin",
      "org_super_admin",
      "master_admin",
    ].includes(prop.role.toLowerCase());
  }, [membership, propertyId]);

  // ── Computed ────────────────────────────────────────────────────────────────
  const filteredTemplates = useMemo(() => {
    if (!templates.length) return [];
    if (isAdmin) return templates;
    return templates.filter(
      (t) => 
        !t.assigned_to ||
        t.assigned_to.length === 0 ||
        (Array.isArray(t.assigned_to) ? t.assigned_to.includes(user?.id ?? "") : false),
    );
  }, [templates, isAdmin, user]);

  const filteredCompletions = useMemo(() => {
    if (isAdmin) return completions;
    return completions.filter((c) => c.completed_by === user?.id);
  }, [completions, isAdmin, user]);

  const dueStatusMap = useMemo(() => {
    const map: Record<
      string,
      { due: boolean; label: string; status: DueStatus }
    > = {};
    for (const t of filteredTemplates) {
      if (!t.is_running) {
        map[t.id] = { due: false, label: "Paused", status: "paused" };
        continue;
      }
      const lastDone = t.completions
        .filter((c) => c.status === "completed")
        .sort(
          (a, b) =>
            new Date(b.completed_at || b.completion_date || 0).getTime() -
            new Date(a.completed_at || a.completion_date || 0).getTime(),
        )[0];
      map[t.id] = computeDueStatus(
        t.frequency,
        lastDone?.completion_date ?? null,
        t.start_time,
        t.end_time,
        lastDone?.completed_at ?? null,
        t,
        t.completions,
        liveNow,
      );
    }
    return map;
  }, [filteredTemplates, liveNow]);

  const historyStats = useMemo(() => {
    const {
      dueTemplates,
      upcomingTemplates,
      pausedTemplates,
      missedOccurrences,
      todayCompletedCompletions,
    } = getHistoryGroups();
    return {
      total: filteredCompletions.length,
      completed: todayCompletedCompletions.length,
      due: dueTemplates.length,
      missed: missedOccurrences.length,
      upcoming: upcomingTemplates.length,
      paused: pausedTemplates.length,
    };
  }, [filteredCompletions, liveNow, filteredTemplates]);

  function getHistoryGroups() {
    const dueTemplates: SOPTemplate[] = [];
    const upcomingTemplates: SOPTemplate[] = [];
    const pausedTemplates: SOPTemplate[] = [];
    const missedOccurrences: MissedOccurrence[] = [];
    const todayCompletedCompletions: SOPCompletion[] = [];
    const allCompletedCompletions: SOPCompletion[] = [];

    for (const t of filteredTemplates) {
      if (!t.is_running) {
        pausedTemplates.push(t);
        continue;
      }
      const lastDone = t.completions
        .filter((c) => c.status === "completed")
        .sort(
          (a, b) =>
            new Date(b.completed_at || b.completion_date || 0).getTime() -
            new Date(a.completed_at || a.completion_date || 0).getTime(),
        )[0];
      const ds = computeDueStatus(
        t.frequency,
        lastDone?.completion_date ?? null,
        t.start_time,
        t.end_time,
        lastDone?.completed_at ?? null,
        t,
        t.completions,
        liveNow,
      );
      if (ds.due) dueTemplates.push(t);
      else if (ds.status === "upcoming") upcomingTemplates.push(t);

      // Calculate specific gaps
      const gaps = getTemplateGaps(t, t.completions || [], liveNow, 7);
      missedOccurrences.push(...gaps);
    }

    // All completed completions + today's completed
    const todayStr = liveNow.toLocaleDateString("en-CA");
    const yesterdayDate = new Date(liveNow.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayStr = yesterdayDate.toLocaleDateString("en-CA");

    filteredCompletions.forEach((c) => {
      if (c.status === "completed") {
        allCompletedCompletions.push(c);

        // Find template for this completion
        const template = filteredTemplates.find((t) => t.id === c.template_id);
        if (template && template.start_time && template.end_time) {
          const [sh] = template.start_time.slice(0, 5).split(":").map(Number);
          const [eh] = template.end_time.slice(0, 5).split(":").map(Number);
          const isOvernight =
            eh * 60 + (parseInt(template.end_time.slice(3, 5)) || 0) <=
            sh * 60 + (parseInt(template.start_time.slice(3, 5)) || 0);

          if (isOvernight) {
            // For overnight shifts, if completed_at is in early morning, its logical date is yesterday
            const compAt = new Date(c.completed_at || c.created_at);
            const compMins = compAt.getHours() * 60 + compAt.getMinutes();
            const ehMins =
              eh * 60 + (parseInt(template.end_time.slice(3, 5)) || 0);

            const logicalDate =
              compMins < ehMins ? yesterdayStr : c.completion_date;
            const currentLogicalToday =
              liveNow.getHours() * 60 + liveNow.getMinutes() < ehMins
                ? yesterdayStr
                : todayStr;

            if (logicalDate === currentLogicalToday) {
              todayCompletedCompletions.push(c);
            }
          } else {
            if (c.completion_date === todayStr) {
              todayCompletedCompletions.push(c);
            }
          }
        } else if (c.completion_date === todayStr) {
          todayCompletedCompletions.push(c);
        }
      }
    });

    // Sort completed by most recent first
    allCompletedCompletions.sort(
      (a, b) =>
        new Date(b.completed_at || b.created_at).getTime() -
        new Date(a.completed_at || a.created_at).getTime(),
    );

    return {
      dueTemplates,
      upcomingTemplates,
      pausedTemplates,
      missedOccurrences,
      todayCompletedCompletions,
      allCompletedCompletions,
    };
  }

  const filteredHistoryList = useMemo((): HistoryItem[] => {
    const {
      dueTemplates,
      upcomingTemplates,
      pausedTemplates,
      missedOccurrences,
      allCompletedCompletions,
    } = getHistoryGroups();
    if (historyFilter === "due")
      return dueTemplates.map((t) => ({ type: "template" as const, data: t }));
    if (historyFilter === "upcoming")
      return upcomingTemplates.map((t) => ({
        type: "template" as const,
        data: t,
      }));
    if (historyFilter === "missed")
      return missedOccurrences.map((m) => ({
        type: "missed_occurrence" as const,
        data: m,
      }));
    if (historyFilter === "completed")
      return allCompletedCompletions.map((c) => ({
        type: "completion" as const,
        data: c,
      }));
    if (historyFilter === "paused")
      return pausedTemplates.map((t) => ({
        type: "template" as const,
        data: t,
      }));

    // All: due first, then upcoming, then missed, then paused, then completed
    const items: HistoryItem[] = [];
    dueTemplates.forEach((t) => items.push({ type: "template", data: t }));
    upcomingTemplates.forEach((t) => items.push({ type: "template", data: t }));
    missedOccurrences.forEach((m) =>
      items.push({ type: "missed_occurrence", data: m }),
    );
    pausedTemplates.forEach((t) => items.push({ type: "template", data: t }));
    allCompletedCompletions.forEach((c) =>
      items.push({ type: "completion", data: c }),
    );
    return items;
  }, [
    historyFilter,
    filteredCompletions,
    liveNow,
    filteredTemplates,
    templates,
  ]);

  // ── Live clock ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setLiveNow(new Date()), 5000);
    return () => clearInterval(id);
  }, []);

  // ── Real-time sync (replaced with polling on focus/refresh) ──────────────
  useEffect(() => {
    // No-op: realtime replaced by manual refresh
    return () => {};
  }, [propertyId, view]);

  const setupRealtime = useCallback((completionId: string) => {
    // No-op: realtime replaced by manual refresh
    realtimeChannel.current = null;
  }, []);

  // ── Fetch ───────────────────────────────────────────────────────────────────
  const fetchPropertyMembers = useCallback(async () => {
    // Members are now fetched via checklistService.fetchChecklistData in fetchTemplates
  }, [propertyId]);

  const fetchTemplates = useCallback(async () => {
    if (!propertyId) return;
    try {
      const res = await checklistService.fetchChecklistData(propertyId);
      if (res.error) throw new Error(res.error);

      const typed = (res.templates || []) as SOPTemplate[];
      setTemplates(typed);

      // Set property members from the same API call
      if (res.propertyMembers) {
        setPropertyMembers(res.propertyMembers);
      }

      // Set org ID from the same API call
      if (res.organizationId && !orgId) {
        setOrgId(res.organizationId);
      }

      // Build flat completions list
      const allComps: SOPCompletion[] = [];
      typed.forEach((t) => {
        if (t.completions) allComps.push(...t.completions);
      });
      allComps.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      setCompletions(allComps);
    } catch (err) {
      console.error("Error fetching templates:", err);
    }
  }, [propertyId, orgId]);

  const fetchAll = useCallback(
    async (refresh = false) => {
      if (refresh) setIsRefreshing(true);
      else setIsLoading(true);
      try {
        await Promise.all([fetchTemplates(), fetchPropertyMembers()]);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [fetchTemplates, fetchPropertyMembers],
  );

  const { refetch } = useDashboardFetch(queryKeys.property.checklist(propertyId), fetchAll, {
    staleTime: 1000 * 60 * 5,
  });

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  const handleCancelRunner = () => {
    realtimeChannel.current = null;
    setActiveTemplate(null);
    setActiveCompletion(null);
    setItemStates({});
    setAdminUnlocked(false);
    setView("history");
    fetchAll(true);
  };

  const handleToggleExpand = async (template: SOPTemplate) => {
    if (expandedTemplateId === template.id) {
      setExpandedTemplateId(null);
      return;
    }
    setExpandedTemplateId(template.id);
    if (expandedCompletions[template.id]) return;
    try {
      const res = await checklistService.fetchTemplateCompletions(propertyId as string, template.id, 20);
      setExpandedCompletions((prev) => ({
        ...prev,
        [template.id]: (res.completions || []) as SOPCompletion[],
      }));
    } catch {}
  };

  const handleStartChecklist = async (
    template: SOPTemplate,
    existingCompletion?: SOPCompletion,
    backfillDate?: string,
    backfillSlot?: string,
  ) => {
    const now = new Date();
    if (existingCompletion && existingCompletion.status !== "completed") {
      // Resume
      setActiveTemplate(template);
      setActiveCompletion(existingCompletion);
      initItemStates(template, existingCompletion);
      setupRealtime(existingCompletion.id);
      setView("runner");
      return;
    }

    // Time window check (only for non-backfill)
    if (!backfillDate) {
      const nowMins = now.getHours() * 60 + now.getMinutes();
      if (!isAdmin && template.start_time && template.end_time) {
        if (
          !isWithinTimeWindow(nowMins, template.start_time, template.end_time)
        ) {
          Alert.alert(
            "Window Closed",
            "This checklist is not available right now.",
          );
          return;
        }
      }
    }

    setIsLoading(true);
    try {
      const isOvernight =
        template.start_time &&
        template.end_time &&
        parseInt(template.end_time.split(":")[0]) * 60 +
          parseInt(template.end_time.split(":")[1]) <=
          parseInt(template.start_time.split(":")[0]) * 60 +
            parseInt(template.start_time.split(":")[1]);

      let logicalDateStr = backfillDate || now.toLocaleDateString("en-CA");
      if (!backfillDate && isOvernight) {
        const nowMins = now.getHours() * 60 + now.getMinutes();
        const endMins =
          parseInt(template.end_time!.split(":")[0]) * 60 +
          parseInt(template.end_time!.split(":")[1]);
        if (nowMins < endMins) {
          // If starting in the morning portion of an overnight shift, it belongs to logically "yesterday"
          const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          logicalDateStr = yesterday.toLocaleDateString("en-CA");
        }
      }

      const slotTime =
        backfillSlot ||
        computeSlotTime(
          template.frequency,
          template.start_time,
          template.end_time,
          now,
        );

      const res = await checklistService.startCompletion({
        template_id: template.id,
        property_id: propertyId,
        organization_id: template.organization_id || orgId,
        completed_by: user?.id,
        status: "in_progress",
        completion_date: logicalDateStr,
        slot_time: slotTime || null,
      });

      if (res.error) {
        Alert.alert("Error", res.error);
        return;
      }

      const fullCompletion = (res.completion || {}) as SOPCompletion;

      setActiveTemplate(template);
      setActiveCompletion(fullCompletion);
      initItemStates(template, fullCompletion);
      setupRealtime(fullCompletion.id);
      setView("runner");
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to start checklist");
    } finally {
      setIsLoading(false);
    }
  };

  const initItemStates = (template: SOPTemplate, completion: SOPCompletion) => {
    const states: Record<
      string,
      {
        checked: boolean;
        photo?: string;
        video?: string;
        value?: string;
        comment?: string;
      }
    > = {};
    template.items.forEach((item) => {
      const compItem = completion.items?.find(
        (ci) => ci.checklist_item_id === item.id,
      );
      states[item.id] = {
        checked: compItem?.is_checked || false,
        photo: compItem?.photo_url,
        video: compItem?.video_url,
        value: compItem?.value,
        comment: compItem?.comment,
      };
    });
    setItemStates(states);
  };

  const toggleItem = async (item: ChecklistItem) => {
    const current = itemStates[item.id]?.checked || false;
    const newChecked = !current;
    setItemStates((prev) => ({
      ...prev,
      [item.id]: { ...prev[item.id], checked: newChecked },
    }));
    try {
      if (!activeCompletion) return;
      const compItem = activeCompletion.items?.find(
        (ci) => ci.checklist_item_id === item.id,
      );
      if (compItem) {
        const updates: any = {
          is_checked: newChecked,
          ...(newChecked
            ? { checked_at: new Date().toISOString(), checked_by: user?.id }
            : {}),
        };
        await checklistService.updateCompletion(activeCompletion.id, {
          item: { completionItemId: compItem.id, ...updates },
        });
      }
    } catch {
      setItemStates((prev) => ({
        ...prev,
        [item.id]: { ...prev[item.id], checked: current },
      }));
    }
  };

  const handleItemComment = async (item: ChecklistItem, comment: string) => {
    if (!activeCompletion) return;
    const compItem = activeCompletion.items?.find(
      (ci) => ci.checklist_item_id === item.id,
    );
    if (!compItem) return;
    setItemStates((prev) => ({
      ...prev,
      [item.id]: { ...prev[item.id], comment },
    }));
    try {
      await checklistService.updateCompletion(activeCompletion.id, {
        item: { completionItemId: compItem.id, comment },
      });
    } catch {}
  };

  const handleItemValue = async (item: ChecklistItem, value: string) => {
    if (!activeCompletion) return;
    const compItem = activeCompletion.items?.find(
      (ci) => ci.checklist_item_id === item.id,
    );
    if (!compItem) return;
    setItemStates((prev) => ({
      ...prev,
      [item.id]: { ...prev[item.id], value },
    }));
    try {
      await checklistService.updateCompletion(activeCompletion.id, {
        item: { completionItemId: compItem.id, value },
      });
    } catch {}
  };

  const handlePhotoCapture = async (item: ChecklistItem) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission required",
        "Camera access is needed to capture photos",
      );
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      await uploadMedia(item, result.assets[0].uri, "photo");
    }
  };

  const handleVideoCapture = async (item: ChecklistItem) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission required", "Camera access needed for video");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["videos"],
      quality: 0.8,
      videoMaxDuration: 15,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      await uploadMedia(item, result.assets[0].uri, "video");
    }
  };

  const handleGallerySelect = async (item: ChecklistItem) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission required", "Gallery access is needed");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      quality: 0.8,
      allowsEditing: false,
    });
    if (!result.canceled && result.assets[0]) {
      const type = result.assets[0].type === "video" ? "video" : "photo";
      await uploadMedia(item, result.assets[0].uri, type);
    }
  };

  const uploadMedia = async (
    item: ChecklistItem,
    uri: string,
    type: "photo" | "video",
  ) => {
    const bucket = type === "photo" ? "sop_photos" : "sop_videos";
    const stateKey = type === "photo" ? "photoUploading" : "videoUploading";

    setItemStates((prev) => ({
      ...prev,
      [item.id]: { ...prev[item.id], [stateKey]: true },
    }));

    try {
      const ext = type === "photo" ? "webp" : "mp4";
      const fileName = `${item.id}-${Date.now()}.${ext}`;

      // Read file and create FormData
      const fileInfo = await FileSystem.getInfoAsync(uri);
      const formData = new FormData();
      formData.append("file", {
        uri,
        name: fileName,
        type: type === "photo" ? "image/webp" : "video/mp4",
      } as any);
      formData.append("propertyId", propertyId as string);
      formData.append("completionId", activeCompletion?.id || "");
      formData.append("itemId", item.id);
      formData.append("type", type);

      const res = await checklistService.uploadMedia(formData);
      const publicUrl = res.url;
      const checkedAt = new Date().toISOString();

      setItemStates((prev) => ({
        ...prev,
        [item.id]: {
          ...prev[item.id],
          [type === "photo" ? "photo" : "video"]: publicUrl,
          [stateKey]: false,
        },
      }));

      const compItem = activeCompletion?.items?.find(
        (ci) => ci.checklist_item_id === item.id,
      );
      if (compItem && activeCompletion) {
        const updateData: any = { checked_at: checkedAt };
        if (type === "photo") updateData.photo_url = publicUrl;
        else updateData.video_url = publicUrl;

        await checklistService.updateCompletion(activeCompletion.id, {
          item: { completionItemId: compItem.id, ...updateData },
        });
      }
    } catch (err: any) {
      setItemStates((prev) => ({
        ...prev,
        [item.id]: { ...prev[item.id], [stateKey]: false },
      }));
      Alert.alert("Upload Failed", err.message || "Failed to upload media");
    }
  };

  const handleRemoveMedia = async (
    item: ChecklistItem,
    type: "photo" | "video",
  ) => {
    const bucket = type === "photo" ? "sop_photos" : "sop_videos";
    Alert.alert("Remove Media", `Delete this ${type}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const compItem = activeCompletion?.items?.find(
              (ci) => ci.checklist_item_id === item.id,
            );
            if (!compItem) return;

            const updateData: any = {};
            if (type === "photo") updateData.photo_url = null;
            else updateData.video_url = null;

            if (activeCompletion) {
              await checklistService.updateCompletion(activeCompletion.id, {
                item: { completionItemId: compItem.id, ...updateData },
              });
            }

            // Delete from storage via server API
            const mediaUrl = type === "photo" ? compItem.photo_url : compItem.video_url;
            if (mediaUrl) {
              await checklistService.deleteMedia(type, mediaUrl, activeCompletion?.id);
            }

            setItemStates((prev) => ({
              ...prev,
              [item.id]: {
                ...prev[item.id],
                [type === "photo" ? "photo" : "video"]: undefined,
              },
            }));
          } catch (err: any) {
            Alert.alert("Error", err.message || "Failed to remove media");
          }
        },
      },
    ]);
  };

  const handleCompleteChecklist = async () => {
    if (!activeCompletion || !activeTemplate) return;
    const mandatoryItems = activeTemplate.items.filter(
      (item) => !item.is_optional,
    );
    const unchecked = mandatoryItems.filter((item) => {
      const type = item.type as ItemType;
      if (type === "text" || type === "number")
        return !itemStates[item.id]?.value?.trim();
      if (type === "yes_no") return !itemStates[item.id]?.value;
      return !itemStates[item.id]?.checked;
    });
    if (unchecked.length > 0) {
      Alert.alert(
        "Incomplete",
        `${unchecked.length} mandatory item(s) not completed.`,
      );
      return;
    }
    setIsSaving(true);
    try {
      const now = new Date();
      const nowMins = now.getHours() * 60 + now.getMinutes();
      const isLate = !!(
        activeTemplate.start_time &&
        activeTemplate.end_time &&
        !isWithinTimeWindow(
          nowMins,
          activeTemplate.start_time,
          activeTemplate.end_time,
        )
      );
      await checklistService.updateCompletion(activeCompletion!.id, {
        status: "completed",
        completed_at: now.toISOString(),
        is_late: isLate,
      });
      realtimeChannel.current = null;
      setActiveTemplate(null);
      setActiveCompletion(null);
      setItemStates({});
      setAdminUnlocked(false);
      Alert.alert("Success", "Checklist submitted!");
      setView("history");
      fetchAll(true);
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to submit checklist");
    } finally {
      setIsSaving(false);
    }
  };

  // ── Template CRUD ───────────────────────────────────────────────────────────
  const resetTemplateForm = () => {
    setTplTitle("");
    setTplDesc("");
    setTplCategory("general");
    setTplFrequency("daily");
    setTplStartTime("");
    setTplEndTime("");
    setTplAssignedTo([]);
    setTplItems([]);
    setEditingTemplate(null);
  };

  const openEditTemplate = (template: SOPTemplate) => {
    setTplTitle(template.title);
    setTplDesc(template.description || "");
    setTplCategory(template.category || "general");
    setTplFrequency(template.frequency as Frequency);
    setTplStartTime(template.start_time || "");
    setTplEndTime(template.end_time || "");
    setTplAssignedTo(template.assigned_to || []);
    setTplItems(
      template.items.map((item) => ({
        title: item.title,
        description: item.description || "",
        type: (item.type || "checkbox") as ItemType,
        requires_photo: item.requires_photo,
        requires_comment: item.requires_comment,
        is_optional: item.is_optional,
        section_title: item.section_title || "",
        start_time: item.start_time || "",
        end_time: item.end_time || "",
      })),
    );
    setEditingTemplate(template);
    setShowCreateTemplate(true);
  };

  const handleCreateTemplate = async () => {
    if (!tplTitle.trim() || !propertyId) {
      Alert.alert("Error", "Template name is required");
      return;
    }
    if (tplItems.length === 0) {
      Alert.alert("Error", "Add at least one checklist item");
      return;
    }
    if (!orgId) {
      Alert.alert("Error", "Organization not found.");
      return;
    }
    setIsSaving(true);
    try {
      const sectionIndexMap: Record<string, number> = {};
      let sectionOrder = 0;
      const items = tplItems.map((item, idx) => {
        if (item.section_title && !sectionIndexMap[item.section_title])
          sectionIndexMap[item.section_title] = sectionOrder++;
        return {
          title: item.title.trim(),
          description: item.description.trim() || null,
          type: item.type,
          requires_photo: item.requires_photo,
          is_optional: item.is_optional,
          order_index: item.section_title
            ? sectionIndexMap[item.section_title] * 100 + idx
            : idx,
          start_time: item.start_time || null,
          end_time: item.end_time || null,
        };
      });

      if (editingTemplate) {
        // Update existing template via API
        const res = await checklistService.updateTemplate(editingTemplate.id, {
          propertyId,
          title: tplTitle.trim(),
          description: tplDesc.trim() || null,
          category: tplCategory,
          frequency: tplFrequency,
          assigned_to: tplAssignedTo.length > 0 ? tplAssignedTo : [],
          start_time: tplStartTime || null,
          end_time: tplEndTime || null,
          items,
        });
        if (res.error) throw new Error(res.error);
      } else {
        // Create new template via API
        const res = await checklistService.createTemplate({
          propertyId,
          organization_id: orgId,
          title: tplTitle.trim(),
          description: tplDesc.trim() || null,
          category: tplCategory,
          frequency: tplFrequency,
          assigned_to: tplAssignedTo.length > 0 ? tplAssignedTo : [],
          is_running: true,
          is_active: true,
          start_time: tplStartTime || null,
          end_time: tplEndTime || null,
          items,
        });
        if (res.error) throw new Error(res.error);
      }

      setShowCreateTemplate(false);
      resetTemplateForm();
      await fetchTemplates();
      Alert.alert(
        "Success",
        editingTemplate ? "Template updated" : "Template created",
      );
    } catch (err: any) {
      Alert.alert("Error", err.message || "Failed to save template");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTemplate = async (template: SOPTemplate) => {
    Alert.alert(
      "Delete Template",
      `Delete "${template.title}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await checklistService.updateTemplate(template.id, {
                is_active: false,
              });
              await fetchTemplates();
            } catch (err: any) {
              Alert.alert("Error", err.message);
            }
          },
        },
      ],
    );
  };

  const handleToggleRunning = async (template: SOPTemplate) => {
    if (!template.is_running) {
      Alert.alert("Start Schedule", "Resume this checklist schedule?", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Start",
          onPress: async () => {
            try {
              await checklistService.updateTemplate(template.id, {
                is_running: true,
              });
              await fetchTemplates();
            } catch (err: any) {
              Alert.alert("Error", err.message);
            }
          },
        },
      ]);
    } else {
      Alert.alert(
        "Pause Schedule",
        "Pause this checklist schedule? It will remain saved but recurring will stop.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Pause",
            onPress: async () => {
              try {
                await checklistService.updateTemplate(template.id, {
                  is_running: false,
                });
                await fetchTemplates();
              } catch (err: any) {
                Alert.alert("Error", err.message);
              }
            },
          },
        ],
      );
    }
  };

  const addTemplateItem = () => {
    setTplItems((prev) => [
      ...prev,
      {
        title: "",
        description: "",
        type: "checkbox",
        requires_photo: false,
        requires_comment: false,
        is_optional: false,
        section_title: "",
        start_time: "",
        end_time: "",
      },
    ]);
  };

  const removeTemplateItem = (idx: number) => {
    setTplItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateTplItem = (idx: number, field: string, value: any) => {
    setTplItems((prev) =>
      prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)),
    );
  };

  // ── Runner computed ──────────────────────────────────────────────────────────
  const runnerWindowClosed = useMemo(() => {
    if (!activeTemplate?.end_time) return false;
    const nowMins = liveNow.getHours() * 60 + liveNow.getMinutes();
    return !isWithinTimeWindow(
      nowMins,
      activeTemplate.start_time || "00:00",
      activeTemplate.end_time,
    );
  }, [activeTemplate, liveNow]);

  const runnerSlotOverdue = useMemo(() => {
    if (!activeTemplate || runnerWindowClosed) return false;
    const hourlyMatch = activeTemplate.frequency.match(/^every_(\d+)_hours?$/);
    if (!hourlyMatch) return false;
    const intervalH = parseInt(hourlyMatch[1]);
    const slotStart =
      activeCompletion?.slot_time || activeCompletion?.created_at;
    if (!slotStart) return false;
    const d = activeCompletion?.slot_time
      ? new Date(
          liveNow.getFullYear(),
          liveNow.getMonth(),
          liveNow.getDate(),
          parseInt(activeCompletion.slot_time.split(":")[0]),
          parseInt(activeCompletion.slot_time.split(":")[1]),
          0,
          0,
        )
      : new Date(activeCompletion?.created_at || Date.now());
    const slotEnd = new Date(d.getTime() + intervalH * 3_600_000);
    return liveNow.getTime() > slotEnd.getTime();
  }, [activeTemplate, activeCompletion, liveNow, runnerWindowClosed]);

  const runnerIsReadOnly = false; // Logic updated per user request to allow editing anytime

  const runnerCheckedCount = useMemo(() => {
    if (!activeCompletion || !activeTemplate) return 0;
    return activeTemplate.items.filter((item) => {
      const state = itemStates[item.id];
      if (item.type === "text" || item.type === "number")
        return !!state?.value?.trim();
      if (item.type === "yes_no") return !!state?.value;
      return !!state?.checked;
    }).length;
  }, [activeCompletion, activeTemplate, itemStates]);

  // ─── Render ─────────────────────────────────────────────────────────────────

  const bgColor = theme === "dark" ? colors.background : "#F8FAFC";

  // ── Runner View ──
  if (view === "runner" && activeTemplate) {
    const totalItems = activeTemplate.items.length;
    const progress = totalItems > 0 ? runnerCheckedCount / totalItems : 0;

    // Group by section
    const sections: Record<string, ChecklistItem[]> = {};
    [...activeTemplate.items]
      .sort((a, b) => {
        const aSection = a.section_title || "zzz";
        const bSection = b.section_title || "zzz";
        if (aSection !== bSection) return aSection.localeCompare(bSection);
        return (a.order_index || 0) - (b.order_index || 0);
      })
      .forEach((item) => {
        const sec = item.section_title || "General";
        if (!sections[sec]) sections[sec] = [];
        sections[sec].push(item);
      });
    const sectionKeys = Object.keys(sections);

    return (
      <LinearGradient
        colors={isDark ? ["#0F1419", "#1A1F2E"] : ["#F8FAFC", "#EEF2F6"]}
        style={styles.container}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
        >
          {/* Header */}
          <View
            style={[
              runnerStyles.header,
              {
                backgroundColor: colors.primary,
                paddingTop: Math.max(insets.top, 16),
              },
            ]}
          >
            <View style={runnerStyles.headerRow}>
              <TouchableOpacity
                style={runnerStyles.backBtn}
                onPress={handleCancelRunner}
              >
                <ArrowLeft size={20} color="#FFFFFF" />
              </TouchableOpacity>
              <View style={runnerStyles.headerTitle}>
                <Text style={runnerStyles.headerTitleText} numberOfLines={1}>
                  {activeTemplate.title}
                </Text>
                {activeCompletion?.completion_date !==
                  new Date().toLocaleDateString("en-CA") && (
                  <Text
                    style={{
                      fontSize: 10,
                      color: "#FBBF24",
                      fontWeight: "bold",
                    }}
                  >
                    BACKFILLING FOR {activeCompletion?.completion_date}{" "}
                    {activeCompletion?.slot_time
                      ? `(${fmt12h(activeCompletion.slot_time)})`
                      : ""}
                  </Text>
                )}
                {activeTemplate.description && (
                  <Text style={runnerStyles.headerSubtitle} numberOfLines={1}>
                    {activeTemplate.description}
                  </Text>
                )}
              </View>
              {isAdmin &&
                (activeCompletion?.status === "completed" ||
                  runnerWindowClosed) && (
                  <TouchableOpacity
                    style={runnerStyles.adminBtn}
                    onPress={() => setAdminUnlocked((v) => !v)}
                  >
                    <Lock
                      size={16}
                      color={
                        adminUnlocked ? "#FBBF24" : "rgba(255,255,255,0.5)"
                      }
                    />
                  </TouchableOpacity>
                )}
            </View>

            {/* Meta bar */}
            <View style={runnerStyles.metaBar}>
              <View style={runnerStyles.metaItem}>
                <Calendar size={11} color="rgba(255,255,255,0.7)" />
                <Text style={runnerStyles.metaText}>
                  {activeCompletion?.completion_date
                    ? new Date(
                        activeCompletion.completion_date,
                      ).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : new Date().toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                </Text>
              </View>
              {(activeTemplate.start_time || activeTemplate.end_time) && (
                <View style={runnerStyles.metaItem}>
                  <Clock size={11} color="rgba(255,255,255,0.7)" />
                  <Text style={runnerStyles.metaText}>
                    {fmt12h(activeTemplate.start_time)} –{" "}
                    {fmt12h(activeTemplate.end_time)}
                  </Text>
                </View>
              )}
              <View style={runnerStyles.metaItem}>
                <Repeat size={11} color="rgba(255,255,255,0.7)" />
                <Text style={runnerStyles.metaText}>
                  {frequencyLabel(activeTemplate.frequency)}
                </Text>
              </View>
            </View>

            {/* Progress */}
            <View style={runnerStyles.progressSection}>
              <View style={runnerStyles.progressHeader}>
                <Text style={runnerStyles.progressLabel}>
                  COMPLETION STATUS
                </Text>
                <Text style={runnerStyles.progressCount}>
                  {Math.round(progress * 100)}% ({runnerCheckedCount}/
                  {totalItems})
                </Text>
              </View>
              <View style={runnerStyles.progressTrack}>
                <View
                  style={[
                    runnerStyles.progressFill,
                    { width: `${progress * 100}%` },
                  ]}
                />
              </View>
            </View>
          </View>

          {/* Status Banner */}
          {false && adminUnlocked && (
            <View style={runnerStyles.bannerAmber}>
              <Lock size={12} color="#B45309" />
              <Text style={runnerStyles.bannerAmberText}>
                Admin Override Active — Edits are allowed
              </Text>
            </View>
          )}
          {false && runnerWindowClosed && !adminUnlocked && (
            <View style={runnerStyles.bannerRed}>
              <Lock size={12} color="#B91C1C" />
              <Text style={runnerStyles.bannerRedText}>
                Time Window Closed — Read-only
              </Text>
            </View>
          )}
          {false &&
            runnerSlotOverdue &&
            !runnerWindowClosed &&
            !adminUnlocked && (
              <View style={runnerStyles.bannerAmber}>
                <Lock size={12} color="#B45309" />
                <Text style={runnerStyles.bannerAmberText}>
                  Overdue — Submit Now
                </Text>
              </View>
            )}
          {activeCompletion?.status === "completed" && (
            <View
              style={[
                runnerStyles.bannerGreen,
                {
                  backgroundColor: (activeCompletion as any).is_late
                    ? "#FEF3C7"
                    : "#D1FAE5",
                },
              ]}
            >
              <CheckCircle2
                size={12}
                color={
                  (activeCompletion as any).is_late ? "#D97706" : "#059669"
                }
              />
              <Text
                style={[
                  runnerStyles.bannerGreenText,
                  {
                    color: (activeCompletion as any).is_late
                      ? "#B45309"
                      : "#065F46",
                  },
                ]}
              >
                {(activeCompletion as any).is_late
                  ? "Completed Late"
                  : "Checklist Completed"}
              </Text>
            </View>
          )}

          {/* Items */}
          <FlashList
            data={sectionKeys}
            keyExtractor={(s) => s}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingTop: 16,
              paddingBottom: 120,
            }}
            showsVerticalScrollIndicator={false}
            estimatedItemSize={180}
            ListFooterComponent={
              <TouchableOpacity
                style={[
                  runnerStyles.completeBtn,
                  {
                    backgroundColor: colors.success,
                    opacity:
                      runnerIsReadOnly || runnerCheckedCount === 0 ? 0.5 : 1,
                  },
                ]}
                onPress={handleCompleteChecklist}
                disabled={
                  runnerIsReadOnly || runnerCheckedCount === 0 || isSaving
                }
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <CheckCircle2 size={18} color="#FFFFFF" />
                    <Text style={runnerStyles.completeBtnText}>
                      {runnerIsReadOnly
                        ? "Read Only"
                        : `${runnerCheckedCount}/${totalItems} Done — Submit`}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            }
            renderItem={({ item: section }) => (
              <View style={{ marginBottom: 20 }}>
                {section !== "General" && (
                  <View style={runnerStyles.sectionHeader}>
                    <View style={runnerStyles.sectionAccent} />
                    <Text style={runnerStyles.sectionTitle}>{section}</Text>
                  </View>
                )}
                {sections[section].map((checkItem, index) => {
                  const state = itemStates[checkItem.id] || { checked: false };
                  const itemType = checkItem.type as ItemType;
                  const isOptional = checkItem.is_optional;

                  return (
                    <View
                      key={checkItem.id}
                      style={[
                        runnerStyles.itemCard,
                        {
                          backgroundColor: colors.card,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      {/* Item row */}
                      <TouchableOpacity
                        style={runnerStyles.itemRow}
                        onPress={() =>
                          itemType === "checkbox" || itemType === "yes_no"
                            ? toggleItem(checkItem)
                            : null
                        }
                        disabled={runnerIsReadOnly}
                        activeOpacity={0.7}
                      >
                        {itemType === "checkbox" ? (
                          <View
                            style={[
                              runnerStyles.checkCircle,
                              {
                                backgroundColor: state.checked
                                  ? colors.success + "18"
                                  : colors.surface,
                                borderColor: state.checked
                                  ? colors.success
                                  : colors.border,
                              },
                            ]}
                          >
                            {state.checked ? (
                              <CheckCircle2 size={22} color={colors.success} />
                            ) : (
                              <Circle size={22} color={colors.textTertiary} />
                            )}
                          </View>
                        ) : (
                          <View
                            style={[
                              runnerStyles.stepNumber,
                              { borderColor: colors.border },
                            ]}
                          >
                            <Text
                              style={{
                                fontSize: 9,
                                fontWeight: "900",
                                color: colors.textTertiary,
                              }}
                            >
                              {index + 1}
                            </Text>
                          </View>
                        )}
                        <View style={runnerStyles.itemContent}>
                          <Text
                            style={[
                              runnerStyles.itemTitle,
                              {
                                color: state.checked
                                  ? colors.primary
                                  : colors.text,
                              },
                            ]}
                          >
                            {checkItem.title}
                            {isOptional && (
                              <Text
                                style={{
                                  color: colors.textTertiary,
                                  fontSize: 10,
                                }}
                              >
                                {" "}
                                (Optional)
                              </Text>
                            )}
                          </Text>
                          {/* Checked by */}
                          {state.checked && (
                            <Text
                              style={{
                                fontSize: 9,
                                fontWeight: "700",
                                color: colors.textTertiary,
                                marginTop: 2,
                              }}
                            >
                              By {user?.full_name || "Staff"}
                            </Text>
                          )}
                          {/* Slot badge */}
                          {(checkItem.start_time || checkItem.end_time) && (
                            <View
                              style={[
                                runnerStyles.slotBadge,
                                { backgroundColor: colors.primary + "15" },
                              ]}
                            >
                              <Text
                                style={[
                                  runnerStyles.slotBadgeText,
                                  { color: colors.primary },
                                ]}
                              >
                                {fmt12h(checkItem.start_time)} –{" "}
                                {fmt12h(checkItem.end_time)}
                              </Text>
                            </View>
                          )}
                        </View>
                      </TouchableOpacity>

                      {/* Value input */}
                      {(itemType === "text" || itemType === "number") && (
                        <View
                          style={[
                            runnerStyles.valueRow,
                            { borderTopColor: colors.border },
                          ]}
                        >
                          <TextInput
                            style={[
                              runnerStyles.valueInput,
                              {
                                backgroundColor: colors.surface,
                                borderColor: colors.border,
                                color: colors.text,
                              },
                            ]}
                            placeholder={
                              itemType === "number"
                                ? "Enter number..."
                                : "Enter observation..."
                            }
                            placeholderTextColor={colors.textTertiary}
                            keyboardType={
                              itemType === "number" ? "numeric" : "default"
                            }
                            value={state.value || ""}
                            onChangeText={(v) => handleItemValue(checkItem, v)}
                            editable={!runnerIsReadOnly}
                          />
                        </View>
                      )}

                      {/* Yes/No */}
                      {itemType === "yes_no" && (
                        <View
                          style={[
                            runnerStyles.yesNoRow,
                            { borderTopColor: colors.border },
                          ]}
                        >
                          {(["yes", "no"] as const).map((opt) => {
                            const isSelected = state.value === opt;
                            const optLabel = opt === "yes" ? "Yes" : "No";
                            return (
                              <TouchableOpacity
                                key={opt}
                                style={[
                                  runnerStyles.yesNoBtn,
                                  {
                                    backgroundColor: isSelected
                                      ? opt === "yes"
                                        ? colors.success + "18"
                                        : colors.error + "18"
                                      : colors.surface,
                                    borderColor: isSelected
                                      ? opt === "yes"
                                        ? colors.success
                                        : colors.error
                                      : colors.border,
                                  },
                                ]}
                                onPress={() => {
                                  if (runnerIsReadOnly) return;
                                  setItemStates((prev) => ({
                                    ...prev,
                                    [checkItem.id]: {
                                      ...prev[checkItem.id],
                                      value: opt,
                                      checked: true,
                                    },
                                  }));
                                  const compItem =
                                    activeCompletion?.items?.find(
                                      (ci) =>
                                        ci.checklist_item_id === checkItem.id,
                                    );
                                  if (compItem) {
                                    // TODO: sop_completion_items does not exist in saas_one schema
                                    // (supabase.from('sop_completion_items') as any)
                                    //   .update({ value: opt, is_checked: true, checked_at: new Date().toISOString(), checked_by: user?.id })
                                    //   .eq('id', compItem.id);
                                  }
                                }}
                                disabled={runnerIsReadOnly}
                              >
                                <Text
                                  style={[
                                    runnerStyles.yesNoBtnText,
                                    {
                                      color: isSelected
                                        ? opt === "yes"
                                          ? colors.success
                                          : colors.error
                                        : colors.textSecondary,
                                    },
                                  ]}
                                >
                                  {optLabel.toUpperCase()}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}

                      {/* Comment */}
                      {checkItem.requires_comment && (
                        <View
                          style={[
                            runnerStyles.commentRow,
                            { borderTopColor: colors.border },
                          ]}
                        >
                          <MessageSquare
                            size={13}
                            color={colors.textTertiary}
                          />
                          <TextInput
                            style={[
                              runnerStyles.commentInput,
                              { color: colors.text },
                            ]}
                            placeholder="Add observation..."
                            placeholderTextColor={colors.textTertiary}
                            value={state.comment || ""}
                            onChangeText={(v) =>
                              handleItemComment(checkItem, v)
                            }
                            editable={!runnerIsReadOnly}
                            multiline
                          />
                        </View>
                      )}

                      {/* Visual Proof */}
                      <View
                        style={{
                          marginTop: 12,
                          paddingTop: 12,
                          borderTopWidth: 1,
                          borderTopColor: colors.border,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 9,
                            fontWeight: "900",
                            color: colors.textTertiary,
                            textTransform: "uppercase",
                            letterSpacing: 1,
                            marginBottom: 8,
                            display: "flex",
                            alignItems: "center",
                          }}
                        >
                          <Camera
                            size={10}
                            color={colors.textTertiary}
                            style={{ marginRight: 4 }}
                          />
                          Visual Proof
                        </Text>

                        <View
                          style={{
                            flexDirection: "row",
                            flexWrap: "wrap",
                            gap: 8,
                            marginBottom: 10,
                          }}
                        >
                          {state.photo && (
                            <View
                              style={{
                                width: 100,
                                height: 75,
                                borderRadius: 8,
                                overflow: "hidden",
                                backgroundColor: colors.surface,
                                borderWidth: 1,
                                borderColor: colors.border,
                              }}
                            >
                              <Image
                                source={{ uri: state.photo }}
                                style={{ width: "100%", height: "100%" }}
                                resizeMode="cover"
                              />
                              <View
                                style={{
                                  position: "absolute",
                                  bottom: 4,
                                  left: 4,
                                  paddingHorizontal: 4,
                                  paddingVertical: 2,
                                  backgroundColor: "rgba(0,0,0,0.6)",
                                  borderRadius: 4,
                                }}
                              >
                                <Text
                                  style={{
                                    color: "white",
                                    fontSize: 7,
                                    fontWeight: "bold",
                                  }}
                                >
                                  PHOTO
                                </Text>
                              </View>
                              <TouchableOpacity
                                onPress={() =>
                                  handleRemoveMedia(checkItem, "photo")
                                }
                                style={{
                                  position: "absolute",
                                  top: 4,
                                  right: 4,
                                  width: 20,
                                  height: 20,
                                  borderRadius: 10,
                                  backgroundColor: "rgba(239, 68, 68, 0.9)",
                                  justifyContent: "center",
                                  alignItems: "center",
                                }}
                              >
                                <X size={12} color="white" />
                              </TouchableOpacity>
                            </View>
                          )}
                          {state.video && (
                            <View
                              style={{
                                width: 100,
                                height: 75,
                                borderRadius: 8,
                                overflow: "hidden",
                                backgroundColor: "#1e293b",
                                borderWidth: 1,
                                borderColor: colors.border,
                                justifyContent: "center",
                                alignItems: "center",
                              }}
                            >
                              <Play
                                size={20}
                                color="white"
                                fill="rgba(255,255,255,0.4)"
                              />
                              <View
                                style={{
                                  position: "absolute",
                                  bottom: 4,
                                  left: 4,
                                  paddingHorizontal: 4,
                                  paddingVertical: 2,
                                  backgroundColor: "rgba(59, 130, 246, 0.8)",
                                  borderRadius: 4,
                                }}
                              >
                                <Text
                                  style={{
                                    color: "white",
                                    fontSize: 7,
                                    fontWeight: "bold",
                                  }}
                                >
                                  VIDEO
                                </Text>
                              </View>
                              <TouchableOpacity
                                onPress={() =>
                                  handleRemoveMedia(checkItem, "video")
                                }
                                style={{
                                  position: "absolute",
                                  top: 4,
                                  right: 4,
                                  width: 20,
                                  height: 20,
                                  borderRadius: 10,
                                  backgroundColor: "rgba(239, 68, 68, 0.9)",
                                  justifyContent: "center",
                                  alignItems: "center",
                                }}
                              >
                                <X size={12} color="white" />
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>

                        {/* Media Action Buttons */}
                        <View
                          style={{
                            flexDirection: "row",
                            flexWrap: "wrap",
                            gap: 6,
                          }}
                        >
                          <TouchableOpacity
                            onPress={() =>
                              !runnerIsReadOnly && handlePhotoCapture(checkItem)
                            }
                            disabled={runnerIsReadOnly || state.photoUploading}
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              paddingHorizontal: 10,
                              paddingVertical: 6,
                              backgroundColor: colors.surface,
                              borderRadius: 8,
                              borderWidth: 1,
                              borderColor: colors.border,
                            }}
                          >
                            {state.photoUploading ? (
                              <ActivityIndicator
                                size="small"
                                color={colors.textTertiary}
                              />
                            ) : (
                              <Camera size={12} color={colors.textTertiary} />
                            )}
                            <Text
                              style={{
                                fontSize: 9,
                                fontWeight: "900",
                                color: colors.textTertiary,
                                textTransform: "uppercase",
                                letterSpacing: 1,
                                marginLeft: 4,
                              }}
                            >
                              {state.photo ? "Change Photo" : "Add Photo"}
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() =>
                              !runnerIsReadOnly &&
                              handleGallerySelect(checkItem)
                            }
                            disabled={
                              runnerIsReadOnly ||
                              state.photoUploading ||
                              state.videoUploading
                            }
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              paddingHorizontal: 10,
                              paddingVertical: 6,
                              backgroundColor: colors.surface,
                              borderRadius: 8,
                              borderWidth: 1,
                              borderColor: colors.border,
                            }}
                          >
                            <Paperclip size={12} color={colors.textTertiary} />
                            <Text
                              style={{
                                fontSize: 9,
                                fontWeight: "900",
                                color: colors.textTertiary,
                                textTransform: "uppercase",
                                letterSpacing: 1,
                                marginLeft: 4,
                              }}
                            >
                              Upload File
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            onPress={() =>
                              !runnerIsReadOnly && handleVideoCapture(checkItem)
                            }
                            disabled={runnerIsReadOnly || state.videoUploading}
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              paddingHorizontal: 10,
                              paddingVertical: 6,
                              backgroundColor: colors.surface,
                              borderRadius: 8,
                              borderWidth: 1,
                              borderColor: colors.border,
                            }}
                          >
                            {state.videoUploading ? (
                              <ActivityIndicator
                                size="small"
                                color={colors.textTertiary}
                              />
                            ) : (
                              <Video size={12} color={colors.textTertiary} />
                            )}
                            <Text
                              style={{
                                fontSize: 9,
                                fontWeight: "900",
                                color: colors.textTertiary,
                                textTransform: "uppercase",
                                letterSpacing: 1,
                                marginLeft: 4,
                              }}
                            >
                              {state.video ? "Re-Record" : "Add Video"}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          />
        </KeyboardAvoidingView>
      </LinearGradient>
    );
  }

  // ── History Detail View ──
  if (view === "detail" && historyCompletion) {
    const template = templates.find(
      (t) => t.id === historyCompletion.template_id,
    );
    return (
      <LinearGradient
        colors={isDark ? ["#0F1419", "#1A1F2E"] : ["#F8FAFC", "#EEF2F6"]}
        style={styles.container}
      >
        <View
          style={[
            runnerStyles.header,
            {
              backgroundColor: colors.primary,
              paddingTop: Math.max(insets.top, 16),
            },
          ]}
        >
          <View style={runnerStyles.headerRow}>
            <TouchableOpacity
              style={runnerStyles.backBtn}
              onPress={() => {
                setHistoryCompletion(null);
                setView("history");
              }}
            >
              <ArrowLeft size={20} color="#FFFFFF" />
            </TouchableOpacity>
            <View style={runnerStyles.headerTitle}>
              <Text style={runnerStyles.headerTitleText}>Audit Details</Text>
              <Text style={runnerStyles.headerSubtitle}>
                {template?.title || "Checklist"} ·{" "}
                {historyCompletion.completion_date
                  ? new Date(
                      historyCompletion.completion_date,
                    ).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : ""}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 4 }}>
              <View
                style={[
                  runnerStyles.statusBadge,
                  {
                    backgroundColor:
                      historyCompletion.status === "completed"
                        ? (colors.success || "#10B981") + "30"
                        : "#3B82F630",
                  },
                ]}
              >
                <Text
                  style={[
                    runnerStyles.statusBadgeText,
                    {
                      color:
                        historyCompletion.status === "completed"
                          ? colors.success
                          : "#3B82F6",
                    },
                  ]}
                >
                  {historyCompletion.status?.replace("_", " ").toUpperCase()}
                </Text>
              </View>
              {historyCompletion.admin_rating ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                  {[1, 2, 3].map((star) => (
                    <Star
                      key={star}
                      size={10}
                      color={star <= historyCompletion.admin_rating! ? "#FBBF24" : "rgba(255,255,255,0.3)"}
                      fill={star <= historyCompletion.admin_rating! ? "#FBBF24" : "none"}
                    />
                  ))}
                </View>
              ) : null}
            </View>
          </View>
        </View>
        <FlashList
          data={template?.items || []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 16,
            paddingBottom: 120,
          }}
          estimatedItemSize={180}
          renderItem={({ item }) => {
            const compItem = historyCompletion.items?.find(
              (ci) => ci.checklist_item_id === item.id,
            );
            return (
              <View
                style={[
                  runnerStyles.itemCard,
                  {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    marginBottom: 8,
                  },
                ]}
              >
                <View style={runnerStyles.itemRow}>
                  <View
                    style={[
                      runnerStyles.checkCircle,
                      {
                        backgroundColor: compItem?.is_checked
                          ? colors.success + "18"
                          : colors.surface,
                        borderColor: compItem?.is_checked
                          ? colors.success
                          : colors.border,
                      },
                    ]}
                  >
                    {compItem?.is_checked ? (
                      <CheckCircle2 size={20} color={colors.success} />
                    ) : (
                      <Circle size={20} color={colors.textTertiary} />
                    )}
                  </View>
                  <View style={runnerStyles.itemContent}>
                    <Text
                      style={[runnerStyles.itemTitle, { color: colors.text }]}
                    >
                      {item.title}
                    </Text>
                    {(item.type === "text" ||
                      item.type === "number" ||
                      item.type === "yes_no") &&
                      compItem?.value && (
                        <Text
                          style={{
                            color: colors.primary,
                            fontWeight: "700",
                            fontSize: 14,
                            marginTop: 2,
                          }}
                        >
                          {compItem.value}
                        </Text>
                      )}
                    {compItem?.comment && (
                      <Text
                        style={{
                          color: colors.textSecondary,
                          fontSize: 12,
                          fontStyle: "italic",
                          marginTop: 2,
                        }}
                      >
                        "{compItem.comment}"
                      </Text>
                    )}
                  </View>
                </View>
                {/* Photo Proof */}
                {compItem?.photo_url && (
                  <TouchableOpacity
                    style={{ marginHorizontal: 12, marginBottom: 12 }}
                    onPress={() => Linking.openURL(compItem.photo_url || "")}
                  >
                    <Image
                      source={{ uri: compItem.photo_url }}
                      style={{ width: "100%", height: 180, borderRadius: 12 }}
                      resizeMode="cover"
                    />
                    <View
                      style={{
                        position: "absolute",
                        bottom: 8,
                        right: 8,
                        paddingHorizontal: 6,
                        paddingVertical: 4,
                        backgroundColor: "rgba(0,0,0,0.6)",
                        borderRadius: 6,
                      }}
                    >
                      <Text
                        style={{
                          color: "white",
                          fontSize: 8,
                          fontWeight: "bold",
                        }}
                      >
                        VIEW FULL IMAGE
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}

                {/* Video Proof */}
                {compItem?.video_url && (
                  <TouchableOpacity
                    style={{
                      marginHorizontal: 12,
                      marginBottom: 12,
                      height: 120,
                      borderRadius: 12,
                      backgroundColor: "#1e293b",
                      justifyContent: "center",
                      alignItems: "center",
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                    onPress={() => Linking.openURL(compItem.video_url || "")}
                  >
                    <Play
                      size={32}
                      color="white"
                      fill="rgba(255,255,255,0.4)"
                    />
                    <Text
                      style={{
                        color: "white",
                        fontSize: 11,
                        fontWeight: "700",
                        marginTop: 8,
                      }}
                    >
                      PLAY VIDEO PROOF
                    </Text>
                    <View
                      style={{
                        position: "absolute",
                        top: 8,
                        right: 8,
                        paddingHorizontal: 6,
                        paddingVertical: 4,
                        backgroundColor: "rgba(59, 130, 246, 0.8)",
                        borderRadius: 6,
                      }}
                    >
                      <Text
                        style={{
                          color: "white",
                          fontSize: 8,
                          fontWeight: "bold",
                        }}
                      >
                        VIDEO
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
                {compItem?.checked_by_user && (
                  <View
                    style={[
                      runnerStyles.commentRow,
                      { borderTopColor: colors.border, paddingHorizontal: 12 },
                    ]}
                  >
                    <User size={10} color={colors.textTertiary} />
                    <Text style={{ fontSize: 10, color: colors.textTertiary }}>
                      {compItem.checked_by_user.full_name} ·{" "}
                      {compItem.checked_at
                        ? new Date(compItem.checked_at).toLocaleTimeString(
                            "en-US",
                            { hour: "2-digit", minute: "2-digit" },
                          )
                        : ""}
                    </Text>
                  </View>
                )}
                {compItem?.admin_rating && (
                  <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingBottom: 10, gap: 4 }}>
                    <Star size={12} color="#FBBF24" fill="#FBBF24" />
                    <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                      Admin Rating: {compItem.admin_rating === 1 ? "Needs Work" : compItem.admin_rating === 2 ? "Acceptable" : "Excellent"}
                    </Text>
                  </View>
                )}
              </View>
            );
          }}
        />
      </LinearGradient>
    );
  }

  // ── Main View ──
  return (
    <LinearGradient colors={["#0a0f1e", "#12182b"]} style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Top nav */}
      <View style={[styles.topNav, { paddingTop: Math.max(insets.top, 16) }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.navIconBtn}
        >
          <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.topNavTitle}>Checklists</Text>
        <TouchableOpacity
          onPress={() =>
            router.push(`/property/${propertyId}/checklist/scan` as any)
          }
          style={styles.navIconBtn}
        >
          <Maximize2 size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View
          style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
        >
          <ActivityIndicator size="large" color="#4F93E4" />
        </View>
      ) : view === "templates" && isAdmin ? (
        <FlashList
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
          data={filteredTemplates}
          keyExtractor={(item) => item.id}
          estimatedItemSize={120}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor="#4F93E4" />}
          ListHeaderComponent={
            <View style={{ marginBottom: 16 }}>
              <LinearGradient
                colors={[
                  "rgba(59, 130, 246, 0.15)",
                  "rgba(255, 255, 255, 0.03)",
                ]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.headerCard}
              >
                <View style={styles.headerTop}>
                  <View style={styles.headerLeft}>
                    <View style={styles.headerIconWrap}>
                      <ClipboardList size={18} color="#FFFFFF" />
                    </View>
                    <Text style={styles.headerTitle}>
                      {isAdmin ? "Checklist Manager" : "My Checklists"}
                    </Text>
                  </View>
                  {isAdmin && (
                    <TouchableOpacity
                      style={styles.addBtn}
                      onPress={() => {
                        resetTemplateForm();
                        setShowCreateTemplate(true);
                      }}
                    >
                      <Plus size={18} color="#FFFFFF" />
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.viewToggle}>
                  <TouchableOpacity
                    style={[
                      styles.toggleTab,
                    ]}
                    onPress={() => setView("history")}
                  >
                    <History size={12} color="rgba(255,255,255,0.8)" />
                    <Text style={styles.toggleTabText}>History</Text>
                  </TouchableOpacity>
                  {isAdmin && (
                    <TouchableOpacity
                      style={[
                        styles.toggleTab,
                        view === "templates" && styles.toggleTabActive,
                      ]}
                      onPress={() => setView("templates")}
                    >
                      <LayoutGrid size={12} color="rgba(255,255,255,0.8)" />
                      <Text style={styles.toggleTabText}>Templates</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </LinearGradient>
            </View>
          }
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingTop: 80, gap: 12 }}>
              <ClipboardList size={48} color="rgba(255,255,255,0.2)" />
              <Text style={{ fontSize: 16, fontWeight: "700", color: "#FFF" }}>
                No templates yet
              </Text>
              <TouchableOpacity
                style={styles.startBtn}
                onPress={() => {
                  resetTemplateForm();
                  setShowCreateTemplate(true);
                }}
              >
                <Plus size={14} color="#FFFFFF" />
                <Text
                  style={{
                    color: "#FFFFFF",
                    fontSize: 12,
                    fontWeight: "700",
                    marginLeft: 6,
                  }}
                >
                  Create Template
                </Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item: template }) => {
            const ds = dueStatusMap[template.id];
            const lastDone = template.completions
              .filter((c) => c.status === "completed")
              .sort(
                (a, b) =>
                  new Date(b.completed_at || b.completion_date || 0).getTime() -
                  new Date(a.completed_at || a.completion_date || 0).getTime(),
              )[0];
            const inProgress = template.completions.find(
              (c) => c.status === "in_progress",
            );
            return (
              <View style={{ marginBottom: 12 }}>
                <SafeBlurView intensity={40} style={[styles.historyCard]} tint="dark">
                  <View style={styles.historyCardRow}>
                    <View style={styles.historyCardContent}>
                      <Text style={styles.historyTitle}>{template.title}</Text>
                      <Text style={styles.historyMeta}>
                        {getFrequencyLabel(template.frequency)}
                        {template.start_time ? ` · ${fmt12h(template.start_time)}` : ""}
                      </Text>
                      <StatusBadge status={!template.is_running ? "paused" : (ds?.status || "upcoming")} label={ds?.label || ""} />
                    </View>
                    <View style={styles.historyCardRight}>
                      <TouchableOpacity
                        style={[styles.startBtn, { marginBottom: 6 }]}
                        onPress={() => handleStartChecklist(template, inProgress)}
                      >
                        <Play size={14} color="#FFFFFF" />
                        <Text style={styles.startBtnText}>
                          {inProgress ? "Resume" : "Start"}
                        </Text>
                      </TouchableOpacity>
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        <TouchableOpacity
                          onPress={() => openEditTemplate(template)}
                        >
                          <Edit3 size={16} color="rgba(255,255,255,0.6)" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleToggleRunning(template)}
                        >
                          {template.is_running ? (
                            <Pause size={16} color="rgba(255,255,255,0.6)" />
                          ) : (
                            <PlayCircle size={16} color="rgba(255,255,255,0.6)" />
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleDeleteTemplate(template)}
                        >
                          <Trash2 size={16} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                </SafeBlurView>
              </View>
            );
          }}
        />
      ) : (
        <FlashList
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
          data={filteredHistoryList}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} tintColor="#4F93E4" />}
          keyExtractor={(item, idx) =>
            item.type === "missed_occurrence"
              ? `missed-${idx}`
              : item.type === "template"
                ? `tmpl-${item.data.id}`
                : `comp-${item.data.id}`
          }
          estimatedItemSize={120}
          ListHeaderComponent={
            <View style={{ marginBottom: 16 }}>
              <LinearGradient
                colors={[
                  "rgba(59, 130, 246, 0.15)",
                  "rgba(255, 255, 255, 0.03)",
                ]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.headerCard}
              >
                <View style={styles.headerTop}>
                  <View style={styles.headerLeft}>
                    <View style={styles.headerIconWrap}>
                      <ClipboardList size={18} color="#FFFFFF" />
                    </View>
                    <Text style={styles.headerTitle}>
                      {isAdmin ? "Checklist Manager" : "My Checklists"}
                    </Text>
                  </View>
                  {isAdmin && (
                    <TouchableOpacity
                      style={styles.addBtn}
                      onPress={() => {
                        resetTemplateForm();
                        setShowCreateTemplate(true);
                      }}
                    >
                      <Plus size={18} color="#FFFFFF" />
                    </TouchableOpacity>
                  )}
                </View>

                <View style={styles.viewToggle}>
                  <TouchableOpacity
                    style={[
                      styles.toggleTab,
                      view === "history" && styles.toggleTabActive,
                    ]}
                    onPress={() => setView("history")}
                  >
                    <History size={12} color="rgba(255,255,255,0.8)" />
                    <Text style={styles.toggleTabText}>History</Text>
                  </TouchableOpacity>
                  {isAdmin && (
                    <TouchableOpacity
                      style={[
                        styles.toggleTab,
                        view === "templates" && styles.toggleTabActive,
                      ]}
                      onPress={() => setView("templates")}
                    >
                      <LayoutGrid size={12} color="rgba(255,255,255,0.8)" />
                      <Text style={styles.toggleTabText}>Templates</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </LinearGradient>
              <View style={styles.filterRow}>
                {(
                  [
                    "all",
                    "due",
                    "upcoming",
                    "paused",
                    "completed",
                    "missed",
                  ] as HistoryFilter[]
                ).map((f) => (
                  <TouchableOpacity
                    key={f}
                    style={[
                      styles.filterChip,
                      historyFilter === f && styles.filterChipActive,
                    ]}
                    onPress={() => setHistoryFilter(f)}
                  >
                    <Text
                      style={[
                        styles.filterChipText,
                        historyFilter === f && { color: "#FFFFFF" },
                      ]}
                    >
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          }
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingTop: 60, gap: 12 }}>
              <History size={48} color="rgba(255,255,255,0.2)" />
              <Text style={{ fontSize: 16, fontWeight: "700", color: "#FFF" }}>
                No records
              </Text>
              <Text
                style={{
                  fontSize: 13,
                  color: "rgba(255,255,255,0.5)",
                  textAlign: "center",
                }}
              >
                {isAdmin
                  ? "Create a template to get started"
                  : "No checklists assigned to you"}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <HistoryListCard
              item={item}
              templates={templates}
              dueStatusMap={dueStatusMap}
              onStart={handleStartChecklist}
              onView={(comp) => {
                setHistoryCompletion(comp);
                setView("detail");
              }}
            />
          )}
        />
      )}

      {/* Create/Edit Template Modal */}
      <Modal visible={showCreateTemplate} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          <View style={modalStyles.overlay}>
            <View style={[modalStyles.sheet, { backgroundColor: colors.card }]}>
              <View style={modalStyles.handle} />
              <View style={modalStyles.modalHeader}>
                <Text style={[modalStyles.modalTitle, { color: colors.text }]}>
                  {editingTemplate ? "Edit Template" : "New Template"}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setShowCreateTemplate(false);
                    resetTemplateForm();
                  }}
                >
                  <X size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <ScrollView
                style={modalStyles.modalBody}
                showsVerticalScrollIndicator={false}
              >
                <Text
                  style={[modalStyles.label, { color: colors.textSecondary }]}
                >
                  Template Name *
                </Text>
                <TextInput
                  style={[
                    modalStyles.input,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      color: colors.text,
                    },
                  ]}
                  placeholder="e.g. Morning Walkthrough"
                  placeholderTextColor={colors.textTertiary}
                  value={tplTitle}
                  onChangeText={setTplTitle}
                />

                <Text
                  style={[modalStyles.label, { color: colors.textSecondary }]}
                >
                  Description
                </Text>
                <TextInput
                  style={[
                    modalStyles.input,
                    modalStyles.textArea,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      color: colors.text,
                    },
                  ]}
                  placeholder="Optional description"
                  placeholderTextColor={colors.textTertiary}
                  value={tplDesc}
                  onChangeText={setTplDesc}
                  multiline
                />

                <Text
                  style={[modalStyles.label, { color: colors.textSecondary }]}
                >
                  Category
                </Text>
                <TextInput
                  style={[
                    modalStyles.input,
                    {
                      backgroundColor: colors.surface,
                      borderColor: colors.border,
                      color: colors.text,
                    },
                  ]}
                  placeholder="e.g. safety, general, cleaning"
                  placeholderTextColor={colors.textTertiary}
                  value={tplCategory}
                  onChangeText={setTplCategory}
                />

                <Text
                  style={[modalStyles.label, { color: colors.textSecondary }]}
                >
                  Frequency
                </Text>
                <View style={modalStyles.freqGrid}>
                  {FREQUENCY_OPTIONS.map((freq) => (
                    <TouchableOpacity
                      key={freq.value}
                      style={[
                        modalStyles.freqChip,
                        tplFrequency === freq.value
                          ? {
                              backgroundColor: colors.primary + "18",
                              borderColor: colors.primary,
                            }
                          : {
                              backgroundColor: colors.surface,
                              borderColor: colors.border,
                            },
                      ]}
                      onPress={() => setTplFrequency(freq.value)}
                    >
                      <Text
                        style={[
                          modalStyles.freqChipText,
                          {
                            color:
                              tplFrequency === freq.value
                                ? colors.primary
                                : colors.textSecondary,
                          },
                        ]}
                      >
                        {freq.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text
                  style={[modalStyles.label, { color: colors.textSecondary }]}
                >
                  Time Window
                </Text>
                <View style={modalStyles.timeRow}>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        modalStyles.subLabel,
                        { color: colors.textTertiary },
                      ]}
                    >
                      From
                    </Text>
                    <TextInput
                      style={[
                        modalStyles.input,
                        {
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                          color: colors.text,
                          textAlign: "center",
                        },
                      ]}
                      placeholder="09:00"
                      placeholderTextColor={colors.textTertiary}
                      value={tplStartTime}
                      onChangeText={setTplStartTime}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        modalStyles.subLabel,
                        { color: colors.textTertiary },
                      ]}
                    >
                      To
                    </Text>
                    <TextInput
                      style={[
                        modalStyles.input,
                        {
                          backgroundColor: colors.surface,
                          borderColor: colors.border,
                          color: colors.text,
                          textAlign: "center",
                        },
                      ]}
                      placeholder="17:00"
                      placeholderTextColor={colors.textTertiary}
                      value={tplEndTime}
                      onChangeText={setTplEndTime}
                    />
                  </View>
                </View>

                <Text
                  style={[modalStyles.label, { color: colors.textSecondary }]}
                >
                  Assign to (leave empty for all)
                </Text>
                <View style={modalStyles.assigneeSection}>
                  {propertyMembers.map((member) => {
                    const isSelected = tplAssignedTo.includes(member.id);
                    return (
                      <TouchableOpacity
                        key={member.id}
                        style={[
                          modalStyles.assigneeChip,
                          isSelected
                            ? {
                                backgroundColor: colors.primary + "18",
                                borderColor: colors.primary,
                              }
                            : {
                                backgroundColor: colors.surface,
                                borderColor: colors.border,
                              },
                        ]}
                        onPress={() =>
                          setTplAssignedTo((prev) =>
                            isSelected
                              ? prev.filter((id) => id !== member.id)
                              : [...prev, member.id],
                          )
                        }
                      >
                        <Text
                          style={[
                            modalStyles.assigneeChipText,
                            {
                              color: isSelected
                                ? colors.primary
                                : colors.textSecondary,
                            },
                          ]}
                        >
                          {member.full_name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={modalStyles.itemsSectionHeader}>
                  <Text
                    style={[
                      modalStyles.label,
                      { color: colors.textSecondary, marginBottom: 0 },
                    ]}
                  >
                    Checklist Items ({tplItems.length})
                  </Text>
                  <TouchableOpacity
                    style={[
                      modalStyles.addItemBtn,
                      { backgroundColor: colors.primary },
                    ]}
                    onPress={addTemplateItem}
                  >
                    <Plus size={12} color="#FFFFFF" />
                    <Text style={modalStyles.addItemBtnText}>Add</Text>
                  </TouchableOpacity>
                </View>

                {tplItems.map((item, idx) => (
                  <View
                    key={idx}
                    style={[
                      modalStyles.itemRow,
                      {
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <View style={modalStyles.itemInputs}>
                      <TextInput
                        style={[
                          modalStyles.input,
                          {
                            backgroundColor: colors.card,
                            borderColor: colors.border,
                            color: colors.text,
                            fontSize: 13,
                          },
                        ]}
                        placeholder={`Item ${idx + 1} title`}
                        placeholderTextColor={colors.textTertiary}
                        value={item.title}
                        onChangeText={(v) => updateTplItem(idx, "title", v)}
                      />
                      <View style={modalStyles.typeRow}>
                        {(
                          ["checkbox", "text", "number", "yes_no"] as ItemType[]
                        ).map((type) => (
                          <TouchableOpacity
                            key={type}
                            style={[
                              modalStyles.typeChip,
                              item.type === type
                                ? {
                                    backgroundColor: colors.primary + "18",
                                    borderColor: colors.primary,
                                  }
                                : {
                                    backgroundColor: "transparent",
                                    borderColor: colors.border,
                                  },
                            ]}
                            onPress={() => updateTplItem(idx, "type", type)}
                          >
                            <Text
                              style={[
                                modalStyles.typeChipText,
                                {
                                  color:
                                    item.type === type
                                      ? colors.primary
                                      : colors.textTertiary,
                                },
                              ]}
                            >
                              {type === "checkbox"
                                ? "Check"
                                : type === "yes_no"
                                  ? "Yes/No"
                                  : type.charAt(0).toUpperCase() +
                                    type.slice(1)}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <View style={modalStyles.itemOptionsRow}>
                        <TouchableOpacity
                          style={[
                            modalStyles.optionToggle,
                            {
                              backgroundColor: item.requires_photo
                                ? colors.warning + "18"
                                : "transparent",
                              borderColor: item.requires_photo
                                ? colors.warning
                                : colors.border,
                            },
                          ]}
                          onPress={() =>
                            updateTplItem(
                              idx,
                              "requires_photo",
                              !item.requires_photo,
                            )
                          }
                        >
                          <Camera
                            size={10}
                            color={
                              item.requires_photo
                                ? colors.warning
                                : colors.textTertiary
                            }
                          />
                          <Text
                            style={[
                              modalStyles.optionToggleText,
                              {
                                color: item.requires_photo
                                  ? colors.warning
                                  : colors.textTertiary,
                              },
                            ]}
                          >
                            Photo
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            modalStyles.optionToggle,
                            {
                              backgroundColor: item.requires_comment
                                ? (colors.info || "#3B82F6") + "18"
                                : "transparent",
                              borderColor: item.requires_comment
                                ? colors.info || "#3B82F6"
                                : colors.border,
                            },
                          ]}
                          onPress={() =>
                            updateTplItem(
                              idx,
                              "requires_comment",
                              !item.requires_comment,
                            )
                          }
                        >
                          <MessageSquare
                            size={10}
                            color={
                              item.requires_comment
                                ? colors.info || "#3B82F6"
                                : colors.textTertiary
                            }
                          />
                          <Text
                            style={[
                              modalStyles.optionToggleText,
                              {
                                color: item.requires_comment
                                  ? colors.info || "#3B82F6"
                                  : colors.textTertiary,
                              },
                            ]}
                          >
                            Comment
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            modalStyles.optionToggle,
                            {
                              backgroundColor: item.is_optional
                                ? colors.textTertiary + "18"
                                : "transparent",
                              borderColor: item.is_optional
                                ? colors.textTertiary
                                : colors.border,
                            },
                          ]}
                          onPress={() =>
                            updateTplItem(idx, "is_optional", !item.is_optional)
                          }
                        >
                          <Text
                            style={[
                              modalStyles.optionToggleText,
                              {
                                color: item.is_optional
                                  ? colors.textTertiary
                                  : colors.textTertiary,
                              },
                            ]}
                          >
                            Optional
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={{ padding: 4 }}
                      onPress={() => removeTemplateItem(idx)}
                    >
                      <X size={16} color={colors.error || "#EF4444"} />
                    </TouchableOpacity>
                  </View>
                ))}

                {tplItems.length === 0 && (
                  <TouchableOpacity
                    style={[
                      modalStyles.addFirstItem,
                      { borderColor: colors.border },
                    ]}
                    onPress={addTemplateItem}
                  >
                    <Plus size={18} color={colors.textTertiary} />
                    <Text
                      style={[
                        modalStyles.addFirstItemText,
                        { color: colors.textTertiary },
                      ]}
                    >
                      Add first item
                    </Text>
                  </TouchableOpacity>
                )}
                <View style={{ height: 80 }} />
              </ScrollView>
              <TouchableOpacity
                style={[
                  modalStyles.submitBtn,
                  { backgroundColor: colors.primary },
                  isSaving && { opacity: 0.6 },
                ]}
                onPress={handleCreateTemplate}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={modalStyles.submitBtnText}>
                    {editingTemplate ? "Update Template" : "Create Template"}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </LinearGradient>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  topNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  topNavTitle: {
    fontSize: 18,
    fontFamily: "Poppins-Bold",
    color: "#FFFFFF",
    letterSpacing: -0.5,
  },
  navIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.05)",
    justifyContent: "center",
    alignItems: "center",
  },

  headerCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: "Poppins-Bold",
    color: "#FFFFFF",
    letterSpacing: -0.3,
  },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
  },

  viewToggle: { flexDirection: "row", gap: 10 },
  toggleTab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  toggleTabActive: {
    backgroundColor: "rgba(59,130,246,0.2)",
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.5)",
  },
  toggleTabText: {
    fontSize: 12,
    fontFamily: "Urbanist-Bold",
    color: "#FFFFFF",
  },

  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
    justifyContent: "space-between",
  },
  statCard: { width: "48%", padding: 16, borderRadius: 12, borderWidth: 1 },
  statLabel: {
    fontSize: 10,
    fontFamily: "Urbanist-Bold",
    letterSpacing: 1,
    marginBottom: 6,
  },
  statValue: { fontSize: 32, fontFamily: "Poppins-Bold" },

  filterRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "transparent",
  },
  filterChipActive: {
    backgroundColor: "rgba(59, 130, 246, 0.2)",
    borderColor: "#3B82F6",
  },
  filterChipText: {
    fontSize: 12,
    fontFamily: "Urbanist-Medium",
    color: "rgba(255,255,255,0.6)",
  },

  historyCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.02)",
    padding: 14,
    marginBottom: 10,
  },
  historyCardRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
  },
  historyCardContent: { flex: 1 },
  historyTitle: {
    fontSize: 14,
    fontFamily: "Poppins-Bold",
    color: "#4F93E4",
    marginBottom: 2,
  },
  historyMeta: {
    fontSize: 11,
    fontFamily: "Urbanist-Regular",
    color: "rgba(255,255,255,0.5)",
  },

  historyCardRight: { alignItems: "flex-end", gap: 8 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  statusBadgeText: {
    fontSize: 9,
    fontFamily: "Urbanist-Bold",
    letterSpacing: 0.5,
  },
  startBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 80,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  startBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontFamily: "Poppins-Bold",
    lineHeight: 16,
    includeFontPadding: false,
  },
});

const runnerStyles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingBottom: 16 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: { flex: 1 },
  headerTitleText: {
    fontSize: 18,
    fontFamily: "Poppins-Bold",
    color: "#FFFFFF",
  },
  headerSubtitle: {
    fontSize: 11,
    fontFamily: "Urbanist-Regular",
    color: "rgba(255,255,255,0.7)",
    marginTop: 2,
  },
  adminBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  metaBar: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 10 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: {
    fontSize: 10,
    fontFamily: "Urbanist-Bold",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "rgba(255,255,255,0.7)",
  },
  progressSection: { marginTop: 12 },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  progressLabel: {
    fontSize: 10,
    fontFamily: "Urbanist-Bold",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "rgba(255,255,255,0.7)",
  },
  progressCount: { fontSize: 13, fontFamily: "Poppins-Bold", color: "#FFFFFF" },
  progressTrack: {
    height: 5,
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 3,
  },
  progressFill: { height: "100%", backgroundColor: "#FFFFFF", borderRadius: 3 },

  bannerAmber: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#FEF3C7",
    borderRadius: 12,
  },
  bannerAmberText: {
    fontSize: 11,
    fontFamily: "Urbanist-Bold",
    color: "#B45309",
  },
  bannerRed: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#FEE2E2",
    borderRadius: 12,
  },
  bannerRedText: {
    fontSize: 11,
    fontFamily: "Urbanist-Bold",
    color: "#B91C1C",
  },
  bannerGreen: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  bannerGreenText: { fontSize: 11, fontFamily: "Urbanist-Bold" },

  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  sectionAccent: {
    width: 3,
    height: 12,
    borderRadius: 2,
    backgroundColor: "#708F96",
  },
  sectionTitle: {
    fontSize: 10,
    fontFamily: "Urbanist-Bold",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    color: "#64748B",
  },

  itemCard: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
    overflow: "hidden",
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 12,
    gap: 12,
  },
  checkCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  itemContent: { flex: 1 },
  itemTitle: { fontSize: 14, fontFamily: "Poppins-Bold", lineHeight: 20 },
  slotBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 4,
  },
  slotBadgeText: {
    fontSize: 9,
    fontFamily: "Urbanist-Bold",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  valueInput: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
  },
  yesNoRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    borderTopWidth: 1,
  },
  yesNoBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
  },
  yesNoBtnText: { fontSize: 12, fontFamily: "Poppins-Bold", letterSpacing: 1 },
  commentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  commentInput: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Urbanist-Regular",
    minHeight: 28,
  },
  photoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  completeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 8,
  },
  completeBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "Poppins-Bold",
  },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusBadgeText: { fontSize: 10, fontFamily: "Urbanist-Bold" },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 34,
    maxHeight: "92%",
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: "#D1D5DB",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 16,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontFamily: "Poppins-Bold" },
  modalBody: { maxHeight: 480 },
  label: {
    fontSize: 10,
    fontFamily: "Urbanist-Bold",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: "#64748B",
    marginBottom: 6,
    marginTop: 10,
  },
  subLabel: { fontSize: 10, fontFamily: "Urbanist-Regular", marginBottom: 4 },
  input: {
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontFamily: "Urbanist-Regular",
  },
  textArea: { minHeight: 72, textAlignVertical: "top" },
  freqGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  freqChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
  },
  freqChipText: { fontSize: 11, fontFamily: "Urbanist-Medium" },
  timeRow: { flexDirection: "row", gap: 12 },
  assigneeSection: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8,
  },
  assigneeChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
  },
  assigneeChipText: { fontSize: 12, fontFamily: "Urbanist-Medium" },
  itemsSectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
  },
  addItemBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  addItemBtnText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontFamily: "Urbanist-Bold",
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    marginBottom: 8,
    gap: 8,
  },
  itemInputs: { flex: 1, gap: 6 },
  typeRow: { flexDirection: "row", gap: 4 },
  typeChip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  typeChipText: { fontSize: 10, fontFamily: "Urbanist-Medium" },
  itemOptionsRow: { flexDirection: "row", gap: 6 },
  optionToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  optionToggleText: { fontSize: 10, fontFamily: "Urbanist-Medium" },
  addFirstItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    paddingVertical: 24,
    marginTop: 8,
  },
  addFirstItemText: { fontSize: 13, fontFamily: "Urbanist-Medium" },
  submitBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 20,
  },
  submitBtnText: { color: "#FFFFFF", fontSize: 14, fontFamily: "Poppins-Bold" },
});
