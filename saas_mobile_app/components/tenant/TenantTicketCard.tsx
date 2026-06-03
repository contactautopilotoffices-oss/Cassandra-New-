"use client";
import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from "react-native";
import Svg, { Path, Circle } from "react-native-svg";

const fontSans = Platform.select({
  web: "system-ui, -apple-system, sans-serif",
  ios: "System",
  android: "sans-serif",
  default: "System",
});
const fontDisplay = Platform.select({
  web: '"SF Pro Display", system-ui, -apple-system, sans-serif',
  ios: "System",
  android: "sans-serif",
  default: "System",
});

interface Ticket {
  id: string;
  ticket_number?: string;
  title?: string;
  description?: string;
  status: string;
  priority: string;
  created_at: string;
  assignee?: { full_name?: string; user_photo_url?: string };
}

interface TenantTicketCardProps {
  ticket: Ticket;
  onPress?: () => void;
}

const ClockIcon = ({
  size = 12,
  color = "#10B981",
}: {
  size?: number;
  color?: string;
}) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="2"
  >
    <Circle cx="12" cy="12" r="10" />
    <Path d="M12 6v6l4 2" />
  </Svg>
);

const BuildingIcon = ({
  size = 18,
  color = "#FFFFFF",
}: {
  size?: number;
  color?: string;
}) => (
  <Svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth="1.5"
  >
    <Path d="M3 21h18M5 21V7l8-4 8 4v14M9 21v-6h6v6" />
  </Svg>
);

function getPriorityColor(priority: string): string {
  switch (priority?.toLowerCase()) {
    case "critical":
      return "#EF4444";
    case "high":
      return "#F97316";
    case "medium":
      return "#FF9F0A";
    case "low":
      return "#64748B";
    default:
      return "#94A3B8";
  }
}

function getStatusColor(status: string): string {
  switch (status?.toLowerCase()) {
    case "open":
      return "#3B82F6";
    case "assigned":
      return "#8B5CF6";
    case "in_progress":
      return "#F59E0B";
    case "resolved":
      return "#10B981";
    case "closed":
      return "#6B7280";
    case "resolved":
      return "#EC4899";
    default:
      return "#94A3B8";
  }
}

function getSlaCountdown(createdAt: string): string {
  const created = new Date(createdAt).getTime();
  if (!createdAt || isNaN(created)) return "--";
  const now = Date.now();
  const diff = now - created;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return `${Math.floor(diff / (1000 * 60))}m`;
  if (hours < 24)
    return `${hours}h ${Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

export const TenantTicketCard = React.memo(function TenantTicketCard({
  ticket,
  onPress,
}: TenantTicketCardProps) {
  const initials =
    ticket.assignee?.full_name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) ?? "??";

  const isClosed = ["resolved", "closed"].includes(
    ticket.status?.toLowerCase(),
  );
  const countdown = ticket.created_at
    ? getSlaCountdown(ticket.created_at)
    : "--";
  const priorityColor = getPriorityColor(ticket.priority);
  const statusColor = getStatusColor(ticket.status);
  const brandColor = "#708F96";

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={styles.card}
    >
      {/* Glassmorphism surface */}
      <View
        style={[
          styles.glassSurface,
          {
            backgroundColor: "rgba(255,255,255,0.08)",
            borderColor: "rgba(255,255,255,0.12)",
          },
        ]}
      />

      {/* Header */}
      <View style={styles.header}>
        <View
          style={[
            styles.avatar,
            {
              backgroundColor: brandColor + "30",
              borderColor: brandColor + "40",
            },
          ]}
        >
          <BuildingIcon size={16} color={brandColor} />
        </View>
        <View style={styles.info}>
          <Text style={styles.ticketId} numberOfLines={1}>
            {ticket.ticket_number ?? ticket.id}
          </Text>
          <Text style={styles.date}>
            {ticket.created_at
              ? new Date(ticket.created_at).toLocaleDateString("en-IN", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "--"}
          </Text>
        </View>
        <View
          style={[
            styles.actionBtn,
            { backgroundColor: "rgba(255,255,255,0.08)" },
          ]}
        >
          <Svg
            width={14}
            height={14}
            viewBox="0 0 24 24"
            fill="none"
            stroke="rgba(255,255,255,0.6)"
            strokeWidth="2"
          >
            <Path d="M7 17L17 7M17 7H7M17 7V17" />
          </Svg>
        </View>
      </View>

      {/* Tags */}
      <View style={styles.tags}>
        <View
          style={[
            styles.tag,
            {
              backgroundColor: `${priorityColor}18`,
              borderColor: `${priorityColor}30`,
            },
          ]}
        >
          <Text style={[styles.tagText, { color: priorityColor }]}>
            {ticket.priority?.toUpperCase() ?? "MEDIUM"}
          </Text>
        </View>
        <View
          style={[
            styles.tag,
            {
              backgroundColor: `${statusColor}18`,
              borderColor: `${statusColor}30`,
            },
          ]}
        >
          <Text style={[styles.tagText, { color: statusColor }]}>
            {ticket.status?.replace("_", " ").toUpperCase() ?? "OPEN"}
          </Text>
        </View>
      </View>

      {/* Description */}
      <Text style={styles.description} numberOfLines={2}>
        {ticket.title || ticket.description || "No description"}
      </Text>

      {/* Assignee */}
      {ticket.assignee && (
        <View style={styles.assignee}>
          <View
            style={[
              styles.assigneeBadge,
              {
                backgroundColor: brandColor + "25",
                borderColor: brandColor + "35",
              },
            ]}
          >
            <Text style={[styles.assigneeBadgeText, { color: brandColor }]}>
              {initials}
            </Text>
          </View>
          <Text style={styles.assigneeName}>{ticket.assignee.full_name}</Text>
        </View>
      )}

      {/* Footer */}
      {!isClosed && (
        <View style={styles.footer}>
          <View>
            <Text style={styles.slaLabel}>SLA COUNTDOWN</Text>
            <View style={styles.countdownRow}>
              <ClockIcon color={priorityColor} />
              <Text style={[styles.countdown, { color: priorityColor }]}>
                {countdown}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* CTA */}
      <View style={styles.ctaRow}>
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: brandColor + "CC" }]}
          onPress={onPress}
        >
          <Text style={styles.primaryBtnText}>View Ticket</Text>
        </TouchableOpacity>
        {!isClosed && (
          <View
            style={[
              styles.secondaryBtn,
              {
                backgroundColor: "rgba(255,255,255,0.06)",
                borderColor: "rgba(255,255,255,0.12)",
              },
            ]}
          >
            <Text style={styles.secondaryBtnText}>Accept</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 3,
  },
  glassSurface: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 18,
    borderWidth: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
  },
  info: {
    flex: 1,
    marginLeft: 12,
  },
  ticketId: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
    fontFamily: fontSans,
  },
  date: {
    fontSize: 10,
    color: "rgba(255,255,255,0.45)",
    marginTop: 2,
    fontFamily: fontSans,
  },
  actions: {
    flexDirection: "row",
    gap: 6,
  },
  actionBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  tags: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 10,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
  },
  tagText: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.3,
    fontFamily: fontSans,
  },
  description: {
    fontSize: 12,
    color: "rgba(255,255,255,0.85)",
    lineHeight: 17,
    marginBottom: 10,
    fontFamily: fontSans,
  },
  assignee: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  assigneeBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
    borderWidth: 1,
  },
  assigneeBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    fontFamily: fontSans,
  },
  assigneeName: {
    fontSize: 11,
    color: "rgba(255,255,255,0.65)",
    fontFamily: fontSans,
  },
  footer: {
    flexDirection: "row",
    marginBottom: 10,
  },
  slaLabel: {
    fontSize: 8,
    color: "rgba(255,255,255,0.35)",
    marginBottom: 2,
    letterSpacing: 0.5,
    fontFamily: fontSans,
  },
  countdownRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  countdown: {
    fontSize: 12,
    fontWeight: "700",
    fontFamily: fontDisplay,
  },
  ctaRow: {
    flexDirection: "row",
    gap: 8,
  },
  primaryBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
    fontFamily: fontSans,
  },
  secondaryBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    borderWidth: 1,
  },
  secondaryBtnText: {
    color: "rgba(255,255,255,0.70)",
    fontSize: 12,
    fontWeight: "600",
    fontFamily: fontSans,
  },
});
