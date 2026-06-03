"""
OpenAI LLM Client — Single Command Center
=========================================

GPT-4o as the orchestrator with function calling.
Handles: intent classification, tool delegation, answer synthesis.

Module: NEW — Single LLM Core
Status: ACTIVE
"""

from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import dataclass, field
from typing import Any, Optional

logger = logging.getLogger("cassandra.llm")


# ---------------------------------------------------------------------------
# Tool Definitions (GPT-4o Function Calling)
# ---------------------------------------------------------------------------

TOOL_DEFINITIONS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "create_ticket",
            "description": (
                "Create a maintenance ticket in the Facility Management System (FMS). "
                "Use this when the user wants to report an issue, request maintenance, "
                "or log a problem. Returns the created ticket with ID and photo_before_url."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "Brief title for the ticket (max 100 chars)",
                    },
                    "description": {
                        "type": "string",
                        "description": "Detailed description of the issue",
                    },
                    "priority": {
                        "type": "string",
                        "enum": ["low", "medium", "high", "urgent", "critical"],
                        "description": "Ticket priority (default: medium)",
                    },
                    "property_id": {
                        "type": "string",
                        "description": "UUID of the property (required)",
                    },
                    "category": {
                        "type": "string",
                        "description": "Category UUID (optional)",
                    },
                    "is_internal": {
                        "type": "boolean",
                        "description": "Internal ticket (visible to staff only, default: false)",
                    },
                    "photo_url": {
                        "type": "string",
                        "description": "URL of attached photo (from mobile upload)",
                    },
                },
                "required": ["title", "property_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "query_tickets",
            "description": (
                "Query tickets from the FMS. Use for listing, searching, or "
                "filtering maintenance tickets. Can filter by property, status, "
                "priority, or assignee."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "property_id": {
                        "type": "string",
                        "description": "Filter by property UUID",
                    },
                    "status": {
                        "type": "string",
                        "enum": ["open", "assigned", "in_progress", "resolved", "closed", "waitlist"],
                        "description": "Filter by ticket status. 'open'=new tickets, 'assigned'=assigned to staff, 'in_progress'=work started, 'resolved'=completed, 'closed'=archived, 'waitlist'=queued",
                    },
                    "priority": {
                        "type": "string",
                        "enum": ["low", "medium", "high", "urgent", "critical"],
                        "description": "Filter by priority",
                    },
                    "limit": {
                        "type": "integer",
                        "default": 20,
                        "description": "Max tickets to return (default: 20)",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "fetch_context",
            "description": (
                "Fetch user/organization context from FMS. Returns membership data, "
                "property assignments, and role information. Call this first to "
                "understand the user's scope."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "include_properties": {
                        "type": "boolean",
                        "default": True,
                        "description": "Include property assignments",
                    },
                    "include_role": {
                        "type": "boolean",
                        "default": True,
                        "description": "Include role and permissions",
                    },
                },
                "properties": {},
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "sql_query",
            "description": (
                "Execute a SQL query against the FMS PostgreSQL database. "
                "ALWAYS include organization_id in WHERE clause. "
                "Use parameterized queries ($1, $2) for safety. "
                "Never query password_hash, api_key, or token columns."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "SQL SELECT query (INSERT/UPDATE/DELETE not supported)",
                    },
                    "params": {
                        "type": "object",
                        "description": "Named parameter values for the query",
                    },
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "enroll_voice",
            "description": (
                "Enroll a user's voice for voice commands. Collects a 10-second "
                "audio sample and creates a voice profile for the user."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "user_id": {"type": "string", "description": "User UUID"},
                    "sample_text": {
                        "type": "string",
                        "description": "Expected phrase for voice sample",
                    },
                },
                "required": ["user_id", "sample_text"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "calculate_date",
            "description": (
                "Calculate a future or past date deterministically. "
                "ALWAYS use this instead of guessing when the user asks relative date questions like "
                "'10 days ago', 'next month', 'in 3 weeks', 'due in 45 days', etc. "
                "Handles leap years, month-end rollover, and timezone correctly."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "reference_date": {
                        "type": "string",
                        "description": "Reference date in ISO format (e.g. '2026-06-01' or '2026-06-01T10:00:00'). Defaults to today if omitted.",
                    },
                    "offset_days": {
                        "type": "integer",
                        "description": "Number of days to add (positive) or subtract (negative).",
                    },
                    "offset_weeks": {
                        "type": "integer",
                        "description": "Number of weeks to add (positive) or subtract (negative).",
                    },
                    "offset_months": {
                        "type": "integer",
                        "description": "Number of months to add (positive) or subtract (negative).",
                    },
                    "offset_years": {
                        "type": "integer",
                        "description": "Number of years to add (positive) or subtract (negative).",
                    },
                },
                "required": [],
            },
        },
    },
]


# ---------------------------------------------------------------------------
# System Prompt
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = """You are Cassandra, an AI assistant for a Facility Management System (FMS).

YOUR ROLE:
- Help users manage maintenance tickets, property information, staff lookups, and reports
- Always be helpful, concise, and action-oriented
- When users want to create tickets, query data, or get reports — make it happen

CHAIN-OF-THOUGHT: For any request involving tool use, data queries, or ticket creation,
wrap each thinking step in <reasoning> tags. Use SHORT action labels ONLY (2–5 words max).
No "Step N:" prefixes. No full sentences. No paragraph text.

Valid examples:
<reasoning>Reading context</reasoning>
<reasoning>Verifying property</reasoning>
<reasoning>Querying tickets</reasoning>
<reasoning>Analyzing results</reasoning>
<reasoning>Creating ticket</reasoning>
<reasoning>Calculating date</reasoning>

NEVER write text outside <reasoning> tags before calling a tool.
After all reasoning tags, call the tool or give the final answer.

CRITICAL RULES:
1. TENANT SCOPE: You MUST know the user's organization_id before taking any action.
   The org_id is provided in the context. NEVER query data without org_id.
2. PHOTO SUPPORT: If the user attaches a photo, use the photo_url in ticket creation.
3. PROPERTY CONTEXT: Always confirm the property before creating tickets.
4. TICKET LIFECYCLE — REAL STATUS VALUES (use ONLY these exact strings):
   - 'open'          → newly raised, not yet assigned
   - 'assigned'      → assigned to staff, work not started
   - 'in_progress'   → work actively in progress
   - 'resolved'      → work done, pending close
   - 'closed'        → fully closed and archived
   - 'waitlist'      → queued, awaiting assignment
   When users say "open tickets" query for status IN ('open','assigned','in_progress').
   NEVER use: 'pending_validation', 'satisfied', 'paused' — these do not exist.
5. PRIORITY LEVELS (real values): 'low', 'medium', 'high', 'urgent', 'critical' (default: 'medium')

DATABASE SCHEMA (FMS Supabase — use these exact table and column names):
amc_contracts: contract_end_date, contract_start_date, contract_value, created_at, id, notes, organization_id, payment_terms, property_id, scope_of_work, status, system_name, updated_at, vendor_contact, vendor_id, vendor_name
audit_logs: action, event_at, event_by, id, object_id, object_type, payload
audit_master_items: assigned_spoc_id, category, created_at, id, is_required_by_default, organization_id, period, requirement, si_no, spoc_name, updated_at
commission_cycles: commission_amount, commission_rate, created_at, cycle_end, cycle_start, id, organization_id, property_id, status, total_revenue, vendor_id
companies: contact_email, contact_phone, created_at, id, logo_url, name, organization_id, property_id, updated_at
company_members: company_id, created_at, id, organization_id, role, user_id
dg_tariffs: cost_per_litre, created_at, created_by, effective_from, effective_to, generator_id, id
diesel_readings: alert_status, closing_diesel_level, closing_hours, closing_kwh, computed_consumed_litres, computed_cost, computed_run_hours, created_at, created_by, diesel_added_litres, generator_id, id, notes, opening_diesel_level, opening_hours, opening_kwh, property_id, reading_date, tariff_id, tariff_rate_used, updated_at
electricity_meters: created_at, deleted_at, id, last_reading, max_load_kw, meter_number, meter_type, name, property_id, status, updated_at
electricity_readings: alert_status, closing_reading, computed_cost, computed_units, created_at, created_by, final_units, id, meter_id, multiplier_id, multiplier_value_used, notes, ocr_confidence, ocr_raw_response, ocr_reading, ocr_status, ocr_unit_detected, opening_reading, peak_load_kw, photo_url, property_id, reading_date, tariff_id, tariff_rate_used, updated_at
escalation_hierarchies: created_at, created_by, description, id, is_active, is_default, name, organization_id, property_id, trigger_after_minutes, updated_at
escalation_levels: created_at, employee_id, escalation_time_minutes, hierarchy_id, id, level_number, notification_channels
export_logs: created_at, date_from, date_to, exported_by, format, id, property_ids, role
feature_usage_logs: action, created_at, feature_name, id, metadata, organization_id, property_id, user_id
feature_usage_summary: feature_name, last_used, organization_id, unique_users, usage_count, usage_date
generators: capacity_kva, created_at, effective_from_date, fuel_efficiency_lphr, id, initial_diesel_level, initial_kwh_reading, initial_run_hours, last_maintenance_date, make, name, next_maintenance_date, property_id, status, tank_capacity_litres, updated_at
grid_tariffs: created_at, created_by, effective_from, effective_to, id, property_id, rate_per_unit, unit_type, utility_provider
invite_link_usage: id, invite_link_id, metadata, used_at, user_id
invite_links: created_at, created_by, current_uses, expires_at, id, invitation_code, is_active, max_uses, metadata, organization_id, property_id, role
issue_categories: code, created_at, icon, id, is_active, name, priority, property_id, skill_group_id, sla_hours, updated_at
llm_health_metrics: avg_latency_ms, failure_count, fallback_count, id, p95_latency_ms, success_count, timestamp, window_minutes
maintenance_vendors: bank_account_number, bank_ifsc, bank_name, cancelled_cheque_url, company_name, contact_person, created_at, created_by, email, gst_doc_url, gst_number, id, is_active, kyc_rejection_reason, kyc_status, msme_doc_url, msme_number, organization_id, pan_doc_url, pan_number, phone, specialization, updated_at, user_id, whatsapp_number
material_request_items: catalog_item_id, created_at, description, id, links, name, organization_id, photo_url, quantity, request_id, total_price, unit_price
material_requests: approval_level, approved_at, approved_by, assignee_uid, budget_type, cancellation_reason, cancelled_at, created_at, delivered_at, escalated_at, escalated_by, has_custom_items, id, items, ordered_at, organization_id, property_id, rejected_at, rejected_by, rejection_reason, requested_by, status, target_approver_id, target_approver_ids, ticket_id, total_amount, updated_at
meeting_room_bookings: booking_date, company_id, created_at, end_time, id, meeting_room_id, organization_id, property_id, start_time, status, updated_at, user_id
meeting_room_credit_log: action, booking_id, company_id, created_at, credit_id, hours_after, hours_changed, id, notes, organization_id, performed_by, request_id, user_id
meeting_room_credit_requests: admin_note, created_at, id, property_id, reason, requested_hours, reviewed_at, reviewed_by, status, user_id
meeting_room_credits: assigned_by, company_id, created_at, id, last_reset_at, monthly_hours, next_reset_at, organization_id, property_id, remaining_hours, updated_at, user_id
meeting_room_slots: created_at, end_time, id, start_time
meeting_rooms: amenities, capacity, created_at, created_by, deleted_at, id, location, name, photo_url, property_id, size, status, updated_at
messages: body, created_at, id, metadata, room_id, sender_id
meter_multipliers: created_at, created_by, ct_ratio_primary, ct_ratio_secondary, effective_from, effective_to, id, meter_constant, meter_id, multiplier_value, pt_ratio_primary, pt_ratio_secondary, reason
module_usage_summary: active_users, last_used, module_name, organization_id, total_uses
mst_achievements: code, color, created_at, criteria, description, icon, id, is_active, name, points_bonus, tier
mst_daily_scores: avg_resolution_minutes, first_time_fixes, last_activity_at, property_id, score_date, sla_breached_count, sla_met_count, streak_days, tickets_resolved, total_points, updated_at, user_id
mst_point_transactions: created_at, event_type, id, metadata, points, property_id, source_ticket_id, user_id
mst_skills: skill_code, user_id
mst_streaks: current_streak, last_active_date, longest_streak, property_id, updated_at, user_id
mst_user_badges: achievement_id, earned_at, user_id
mst_workload: active_tickets, completed_this_week, full_name, is_available, paused_tickets, property_id, user_id
notification_delivery: clicked_at, delivered_at, delivery_status, id, notification_id, push_token
notifications: booking_id, created_at, deep_link, id, is_read, message, notification_type, organization_id, property_id, ticket_id, title, user_id, whatsapp_error, whatsapp_sent_at, whatsapp_status
ocr_audit_logs: created_at, event_type, id, payload, property_id, reading_id
organization_memberships: created_at, is_active, organization_id, role, user_id
organizations: available_modules, code, created_at, deleted_at, deletion_secret, id, is_deleted, name, status, updated_at
payment_transactions: amount, commission_cycle_id, created_at, gateway, gateway_ref, id, property_id, status, vendor_id
ppm_audit_items: attachment_url, audit_report_id, created_at, has_completion_report, id, ppm_item_id
ppm_audit_reports: audit_month, completed_tasks, compliance_pct, generated_at, id, organization_id, pending_tasks, property_id, total_tasks
ppm_schedules: attachments, checker, completion_doc_url, completion_photos, created_at, detail_name, done_date, frequency, id, invoice_url, location, maker, organization_id, planned_date, property_id, rejection_reason, remark, scope_of_work, si_no, status, system_name, updated_at, vendor_contact_person, vendor_id, vendor_name, vendor_phone, verification_status, verified_at, verified_by
procurement_activity_log: action, created_at, id, material_request_id, metadata, new_value, old_value, procurement_order_id, user_id
procurement_budgets: budget_type, created_at, id, organization_id, period_end, period_start, property_id, spent_amount, total_amount, updated_at
procurement_catalog: category, created_at, description, estimated_price, id, is_active, name, organization_id, photo_data, photo_url, stock_item_id, unit, updated_at
procurement_orders: actual_delivery, created_at, delivery_status, expected_delivery, id, invoice_number, invoice_url, items, material_request_id, notes, ordered_by, organization_id, payment_status, property_id, total_amount, updated_at, vendor_contact, vendor_name
procurement_price_visibility: created_at, id, organization_id, property_id, roles, updated_at, users
procurement_settings: created_at, high_approver_id, low_approver_id, organization_id, price_visibility_roles, property_id, threshold_amount, updated_at
properties: address, capacity, city, code, created_at, id, image_url, is_active, name, organization_id, status
property_activities: created_at, created_by, id, organization_id, property_id, status, type
property_audit_submissions: audit_period_year, created_at, id, master_item_id, organization_id, proof_url, property_id, remark, status, submitted_at, submitted_by, updated_at, verified_at, verified_by
property_features: created_at, feature_key, id, is_enabled, property_id, settings, updated_at
property_memberships: created_at, is_active, organization_id, property_id, role, user_id
push_tokens: browser, created_at, device_info, id, is_active, property_id, token, updated_at, user_id
resolver_stats: avg_resolution_minutes, created_at, current_floor, id, is_available, is_checked_in, last_assigned_at, last_ticket_at, property_id, skill_group_id, total_resolved, updated_at, user_id
shift_logs: check_in_at, check_out_at, created_at, id, property_id, status, user_id
skill_groups: code, created_at, description, id, is_active, is_manual_assign, name, property_id, updated_at
sla_templates: category_code, created_at, id, is_active, organization_id, priority, property_id, resolution_sla_hours, response_sla_hours, updated_at
snag_imports: completed_at, created_at, error_rows, filename, id, imported_by, organization_id, property_id, status, total_rows, valid_rows
sop_checklist_items: created_at, description, end_time, id, is_mandatory, is_optional, order_index, requires_comment, requires_photo, start_time, template_id, title, type
sop_completion_items: checked_at, checked_by, checklist_item_id, comment, completion_id, id, is_checked, photo_url, satisfaction_at, satisfaction_by, satisfaction_rating, updated_at, value, video_url
sop_completions: completed_at, completed_by, completion_date, created_at, due_at, id, is_late, notes, organization_id, property_id, slot_time, status, template_id, updated_at
sop_templates: assigned_to, category, created_at, created_by, description, end_time, frequency, id, is_active, is_running, organization_id, property_id, start_time, started_at, title, updated_at
stock_items: barcode, barcode_format, barcode_generated_at, category, created_at, created_by, description, id, item_code, location, min_threshold, name, organization_id, per_unit_cost, property_id, qr_code_data, quantity, unit, updated_at
stock_movements: action, created_at, id, item_id, notes, organization_id, property_id, quantity_after, quantity_before, quantity_change, user_id
stock_reports: generated_at, generated_by, id, low_stock_count, organization_id, property_id, report_data, report_date, total_added, total_items, total_removed
super_tenant_properties: assigned_by, created_at, id, organization_id, property_id, user_id
ticket_activity_log: action, created_at, id, new_value, old_value, ticket_id, user_id
ticket_classification_logs: completion_tokens, created_at, decision_source, entropy, final_bucket, id, llm_bucket, llm_confidence, llm_latency_ms, llm_reason, llm_risk_flag, llm_secondary_bucket, llm_used, prompt_tokens, rule_margin, rule_scores, rule_top_bucket, ticket_id, total_tokens, zone
ticket_comments: comment, created_at, id, is_internal, metadata, ticket_id, user_id
ticket_counters: last_number, property_id
ticket_escalation_logs: escalated_at, from_employee_id, from_level, hierarchy_id, id, reason, ticket_id, to_employee_id, to_level
ticket_sequences: last_number, property_id, updated_at
tickets: accepted_at, assigned_at, assigned_to, assigned_to_name, category, category_id, classification_override, classification_source, confidence, confidence_score, created_at, current_escalation_level, department, description, escalation_last_action_at, escalation_paused, floor_number, hierarchy_id, id, import_batch_id, internal, is_internal, is_vague, issue_code, llm_reasoning, location, organization_id, original_skill_group_id, override_at, override_by, photo_after_url, photo_before_url, priority, property_id, raised_by, raised_by_name, rating, resolution_notes, resolution_sla_hours, resolved_at, response_sla_hours, risk_flag, secondary_category_code, skill_group_code, skill_group_id, sla_breached, sla_deadline, sla_hours, sla_pause_reason, sla_paused, sla_paused_at, sla_started, status, ticket_number, title, total_paused_minutes, updated_at, validated_at, validated_by, validation_note, validation_status, video_after_url, video_before_url, wa_message_id, work_pause_reason, work_paused, work_paused_at, work_paused_by, work_started_at
user_achievements: achievement_id, earned_at, id, property_id, user_id
user_engagement_metrics: avg_duration_seconds, email, engagement_level, full_name, last_active, sessions_this_week, total_sessions, user_id
user_roles: created_at, id, organization_id, role, user_id
user_sessions: created_at, duration_seconds, id, ip_address, last_activity, session_end, session_start, user_agent, user_id
user_status_summary: count, organization_id, status
users: created_at, deleted_at, email, first_login, full_name, id, is_master_admin, last_activity, last_seen_at, metadata, onboarding_completed, online_status, phone, team, user_photo_url
vendor_daily_revenue: created_at, entry_date, id, organization_id, property_id, revenue_amount, revenue_date, updated_at, vendor_id
vendor_payments: amount, created_at, cycle_id, gateway_name, gateway_txn_id, id, organization_id, receipt_url, status, updated_at, vendor_id
vendor_property_assignments: created_at, id, property_id, vendor_id
vendors: commission_rate, created_at, id, organization_id, payment_enabled, payment_gateway_enabled, property_id, shop_name, status, updated_at, user_id, vendor_name
visitor_id_counters: last_number, property_id
visitor_logs: category, checkin_time, checkout_time, coming_from, created_at, id, mobile, name, organization_id, photo_url, property_id, purpose, status, visitor_id, whom_to_meet
vms_tickets: created_at, description, id, organization_id, property_id, reported_by, status, title, updated_at
whatsapp_queue: created_at, error, event_type, id, media_type, media_url, message, phone, retry_count, sent_at, status, ticket_id, user_id
whatsapp_sessions: expires_at, pending_is_image, pending_is_video, pending_media_key, pending_media_url, pending_text, pending_video_key, pending_video_url, phone, property_options, state, user_id
zoho_po_audit_log: ai_model_used, completed_at, confidence_score, created_at, created_by, error_message, extraction_confidence, id, invoice_amount, invoice_date, invoice_file_url, invoice_filename, invoice_number, is_new_vendor, organization_id, parsed_invoice_data, po_amount, po_id, po_number, po_status, processing_time_ms, property_id, retry_count, updated_at, user_context, vendor_id, vendor_name, zoho_response
zoho_po_entity_master: billing_address, created_at, entity_name, gstin, id, is_active, legal_entity_name, organization_id, shipping_address, state_code, state_name, updated_at, zoho_organization_id
zoho_po_settings: ai_model_name, ai_model_provider, auto_retry_enabled, created_at, id, is_enabled, max_retry_count, organization_id, po_approval_threshold, require_approval, updated_at, zoho_access_token, zoho_organization_id, zoho_refresh_token, zoho_token_expires_at
zoho_po_tokens: access_token, created_at, expires_at, id, organization_id, refresh_token, updated_at
zoho_po_vendor_cache: bank_details, billing_address, contact_email, contact_phone, created_at, gstin, id, is_active, is_empanelled, last_synced_at, legal_name, organization_id, pan, payment_terms, updated_at, vendor_name, zoho_vendor_id

DATE HANDLING RULES:
- The current date and time is provided in the context below. Use it as the source of truth to resolve "today", "tomorrow", "yesterday", "next week", etc.
- Always use ISO format in database queries: created_at >= '2026-05-31T00:00:00' AND created_at < '2026-06-01T00:00:00'
- Use the current_datetime provided in the context below as the source of truth for "today", "tomorrow", "yesterday", etc.

CONVERSATION STYLE:
- Keep answers concise (3-5 sentences max for simple queries)
- Use bullet points for lists
- For ticket creation: confirm briefly and show the ticket ID. NEVER output markdown headers (###) or bold labels (**Title:**) — the mobile UI shows plain text only.
- NEVER use markdown formatting like ###, **bold**, or bullet points with dashes in the middle of sentences. Use simple plain text only.
- For queries: show relevant data in a clean format
- ALWAYS show reasoning for complex requests (see above)

FUNCTION CALLING — EXACT RULES:

1. COUNT questions ("how many tickets...") → ALWAYS use sql_query with COUNT(*):
   Example: SELECT COUNT(*) FROM tickets WHERE organization_id = '<org_id>' AND status IN ('assigned','waitlist','pending_validation')
   NEVER call query_tickets for a count question — it only returns 20 rows.

2. "show/list tickets" → use query_tickets with the correct status filter
   - For open tickets: you CANNOT pass multiple statuses to query_tickets.
     Instead use sql_query: SELECT * FROM tickets WHERE organization_id='<org_id>' AND status IN ('assigned','waitlist','pending_validation') LIMIT 20

3. "create/report/raise a ticket" → create_ticket
   - When the user describes a problem (e.g. "leakage in cafeteria"), CALL create_ticket IMMEDIATELY.
   - Do NOT ask "Shall I proceed?" or "Would you like to set priority?" — just create it with sensible defaults (medium priority, appropriate title/description from the user's message).
   - Only ask follow-up questions if critical info is truly missing (no property context, completely vague description).

4. "aggregation / group by / who has most..." → sql_query with GROUP BY

5. "my properties/org/role" → fetch_context

NEVER GUESS — call a tool before answering any factual question.
NEVER pass $1/$2 params — inline the actual org_id value directly in the query string.
Example: WHERE organization_id = '211e1330-ad83-446d-941f-dcea48396798'

RESPONSE FORMAT:
- Markdown supported for formatting
- Emoji OK for visual cues (🎫 for tickets, 👤 for people, 📊 for data)
- NEVER expose raw SQL, UUIDs, or internal system terms to the user
- NEVER make up ticket numbers, property names, or dates — verify first

If you don't know something, say "I don't have that information" rather than guessing.
"""


# ---------------------------------------------------------------------------
# LLM Result
# ---------------------------------------------------------------------------

@dataclass
class LLMResult:
    """Result from a single LLM orchestrator pass."""
    answer: str
    tool_calls: list[dict[str, Any]]
    citations: list[dict]
    confidence: float
    finish_reason: str  # "stop" | "tool_calls" | "length"
    usage: dict[str, int]  # prompt_tokens, completion_tokens, total_tokens


# ---------------------------------------------------------------------------
# OpenAI Client
# ---------------------------------------------------------------------------

class OpenAIClient:
    """
    OpenAI GPT-4o client wrapper for the LLM orchestrator.

    Uses the modern OpenAI SDK with:
    - Function calling for tool use
    - Streaming for SSE output
    - Configurable model and temperature
    """

    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize OpenAI client.

        Args:
            api_key: OpenAI API key. Defaults to OPENAI_API_KEY env var.
        """
        import openai

        self._api_key = api_key or os.environ.get("OPENAI_API_KEY", "")
        if not self._api_key:
            raise ValueError(
                "OPENAI_API_KEY not set. "
                "Set it via environment variable or pass api_key."
            )

        self._client = openai.OpenAI(api_key=self._api_key)
        # Default to GPT-4o-mini (from env, with proper fallback)
        self._model = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
        self._temperature = float(os.environ.get("OPENAI_TEMPERATURE", "0.7"))
        self._max_tokens = int(os.environ.get("OPENAI_MAX_TOKENS", "2048"))
        # Extended thinking budget (0-150000 tokens)
        self._thinking_budget = int(os.environ.get("OPENAI_THINKING_BUDGET", "10000"))
        self._enable_thinking = os.environ.get("OPENAI_ENABLE_THINKING", "true").lower() == "true"
        self._logger = logging.getLogger("cassandra.llm.openai")

        self._logger.info(
            f"OpenAI client initialized: model={self._model}, "
            f"temperature={self._temperature}, "
            f"thinking={'enabled' if self._enable_thinking else 'disabled'}"
        )

    @property
    def client(self) -> Any:
        """Return the underlying OpenAI client."""
        return self._client

    @property
    def model(self) -> str:
        """Return the model name."""
        return self._model

    def chat(
        self,
        messages: list[dict[str, str]],
        tools: Optional[list[dict[str, Any]]] = None,
        stream: bool = False,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
        enable_thinking: Optional[bool] = None,
        tool_choice: Optional[Any] = None,
    ) -> Any:
        """
        Send a chat completion request to OpenAI.

        Args:
            messages: List of message dicts with 'role' and 'content'
            tools: List of OpenAI tool definitions (function calling)
            stream: Whether to stream the response
            temperature: Sampling temperature (0.0-2.0)
            max_tokens: Max tokens in response
            enable_thinking: Enable extended thinking (CoT)
            tool_choice: Override tool choice ('auto', 'none', or dict to force a function)

        Returns:
            OpenAI ChatCompletion response (or streaming iterator)
        """
        kwargs: dict[str, Any] = {
            "model": self._model,
            "messages": messages,
            "temperature": temperature or self._temperature,
            "max_tokens": max_tokens or self._max_tokens,
        }

        # Extended thinking is only available on o1, o3 and future models
        # gpt-4o-mini uses system prompt for CoT instead
        # if enable_thinking or (enable_thinking is None and self._enable_thinking):
        #     kwargs["reasoning_effort"] = "medium"  # Only works with o1/o3

        if tools:
            kwargs["tools"] = tools
            kwargs["tool_choice"] = tool_choice if tool_choice is not None else "auto"

        if stream:
            return self._client.chat.completions.create(**kwargs)
        else:
            return self._client.chat.completions.create(**kwargs)

    def chat_with_tools(
        self,
        messages: list[dict[str, str]],
        context: dict[str, Any],
        history: Optional[list[dict[str, str]]] = None,
    ) -> LLMResult:
        """
        Run a single chat turn with function calling and extended thinking.

        Args:
            messages: Current conversation messages
            context: OrchestratorContext with org_id, user_id, role, etc.
            history: Optional conversation history (last N messages)

        Returns:
            LLMResult with answer, tool_calls, citations, confidence, thinking
        """
        # Build full message list
        full_messages: list[dict[str, str]] = [
            {"role": "system", "content": SYSTEM_PROMPT},
        ]

        import datetime
        from zoneinfo import ZoneInfo
        ist = ZoneInfo("Asia/Kolkata")
        now_ist = datetime.datetime.now(ist)
        current_time = now_ist.strftime("%Y-%m-%d %H:%M:%S IST")
        is_midnight = now_ist.hour < 2
        midnight_note = "\nNOTE: It is currently just past midnight in India. If the user says 'today' or 'yesterday', ask which specific date they mean before querying.\n" if is_midnight else ""

        # Inject context as system info
        context_info = (
            f"Current user context:\n"
            f"- current_datetime: {current_time}{midnight_note}\n"
            f"- organization_id: {context.get('org_id', 'UNKNOWN')}\n"
            f"- user_id: {context.get('user_id', 'UNKNOWN')}\n"
            f"- role: {context.get('role', 'tenant')}\n"
            f"- property_id: {context.get('property_id', 'UNKNOWN')}\n"
            f"- allowed_property_ids: {context.get('allowed_property_ids', [])}\n"
        )
        if context.get("photo_url"):
            context_info += f"- photo_url: {context['photo_url']}\n"
        full_messages.append({"role": "system", "content": context_info})

        # Add history (last 10 messages to reduce token usage)
        if history:
            for h in history[-10:]:
                role = "assistant" if h.get("role") == "cassandra" else "user"
                full_messages.append({
                    "role": role,
                    "content": h.get("content", ""),
                })

        # Add current message
        full_messages.extend(messages)

        # Force create_ticket tool when user explicitly asks to raise a ticket
        user_text = " ".join(m.get("content", "") for m in messages if m.get("role") == "user").lower()
        force_tool = None
        if any(k in user_text for k in ("raise a ticket", "create a ticket", "report an issue", "log a problem", "file a complaint")):
            force_tool = {"type": "function", "function": {"name": "create_ticket"}}

        # Call OpenAI (gpt-4o-mini uses system prompt for reasoning)
        start = time.time()
        response = self.chat(
            messages=full_messages,
            tools=TOOL_DEFINITIONS,
            stream=False,
            enable_thinking=False,
            tool_choice=force_tool,
        )
        elapsed_ms = (time.time() - start) * 1000

        # Parse response
        choice = response.choices[0]
        finish_reason = choice.finish_reason or "stop"
        usage = {
            "prompt_tokens": response.usage.prompt_tokens if response.usage else 0,
            "completion_tokens": response.usage.completion_tokens if response.usage else 0,
            "total_tokens": response.usage.total_tokens if response.usage else 0,
        }

        self._logger.info(
            f"[LLM] {finish_reason} | "
            f"tokens={usage['total_tokens']} | "
            f"latency={elapsed_ms:.0f}ms"
        )

        # Extract thinking block if present
        thinking_text = ""
        if hasattr(choice.message, "thinking") and choice.message.thinking:
            thinking_text = choice.message.thinking

        # Extract tool calls
        tool_calls: list[dict[str, Any]] = []
        if choice.message.tool_calls:
            for tc in choice.message.tool_calls:
                tool_calls.append({
                    "id": tc.id,
                    "name": tc.function.name,
                    "arguments": json.loads(tc.function.arguments),
                })

        # Build answer
        answer = choice.message.content or ""

        # Calculate confidence (based on finish reason and tool usage)
        confidence = 0.5
        if finish_reason == "stop":
            confidence = 0.9
        elif finish_reason == "tool_calls":
            confidence = 0.85  # High confidence when tool is being used

        result = LLMResult(
            answer=answer,
            tool_calls=tool_calls,
            citations=[],  # Citations added by tool execution results
            confidence=confidence,
            finish_reason=finish_reason,
            usage=usage,
        )
        # Store thinking in the result for streaming
        result.thinking = thinking_text  # type: ignore
        return result

    def stream_chat(
        self,
        messages: list[dict[str, str]],
        context: dict[str, Any],
        history: Optional[list[dict[str, str]]] = None,
    ):
        """
        Stream a chat completion response with extended thinking.

        Yields:
            dict with type: 'thinking', 'content', 'tool_call', 'done'
        """
        # Build full message list (same as chat_with_tools)
        full_messages: list[dict[str, str]] = [
            {"role": "system", "content": SYSTEM_PROMPT},
        ]

        import datetime
        from zoneinfo import ZoneInfo
        ist = ZoneInfo("Asia/Kolkata")
        now_ist = datetime.datetime.now(ist)
        current_time = now_ist.strftime("%Y-%m-%d %H:%M:%S IST")
        is_midnight = now_ist.hour < 2
        midnight_note = "\nNOTE: It is currently just past midnight in India. If the user says 'today' or 'yesterday', ask which specific date they mean before querying.\n" if is_midnight else ""

        context_info = (
            f"Current user context:\n"
            f"- current_datetime: {current_time}{midnight_note}\n"
            f"- organization_id: {context.get('org_id', 'UNKNOWN')}\n"
            f"- user_id: {context.get('user_id', 'UNKNOWN')}\n"
            f"- role: {context.get('role', 'tenant')}\n"
            f"- property_id: {context.get('property_id', 'UNKNOWN')}\n"
            f"- allowed_property_ids: {context.get('allowed_property_ids', [])}\n"
        )
        if context.get("photo_url"):
            context_info += f"- photo_url: {context['photo_url']}\n"
        full_messages.append({"role": "system", "content": context_info})

        if history:
            for h in history[-10:]:
                role = "assistant" if h.get("role") == "cassandra" else "user"
                full_messages.append({
                    "role": role,
                    "content": h.get("content", ""),
                })

        full_messages.extend(messages)

        # Force create_ticket tool when user explicitly asks to raise a ticket
        user_text = " ".join(m.get("content", "") for m in messages if m.get("role") == "user").lower()
        force_tool = None
        if any(k in user_text for k in ("raise a ticket", "create a ticket", "report an issue", "log a problem", "file a complaint")):
            force_tool = {"type": "function", "function": {"name": "create_ticket"}}

        # Stream the response (thinking will be implicit per system prompt)
        stream = self._client.chat.completions.create(
            model=self._model,
            messages=full_messages,
            tools=TOOL_DEFINITIONS,
            tool_choice=force_tool if force_tool is not None else "auto",
            temperature=self._temperature,
            max_tokens=self._max_tokens,
            stream=True,
        )

        for chunk in stream:
            if chunk.choices and chunk.choices[0].delta:
                delta = chunk.choices[0].delta
                # Stream thinking blocks
                if hasattr(delta, "thinking") and delta.thinking:
                    yield {"type": "thinking", "thinking": delta.thinking}
                # Stream text content
                if delta.content:
                    yield {"type": "content", "content": delta.content}
                # Stream tool calls
                if delta.tool_calls:
                    for tc in delta.tool_calls:
                        yield {
                            "type": "tool_call",
                            "id": tc.id,
                            "name": tc.function.name,
                            "arguments": tc.function.arguments or "",
                        }
                # Stream finish event
                if chunk.choices[0].finish_reason:
                    yield {
                        "type": "done",
                        "finish_reason": chunk.choices[0].finish_reason,
                    }
