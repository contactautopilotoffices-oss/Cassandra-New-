"""
FMS Database Schema — Source of Truth for SQL Generation
=======================================================

This module is the authoritative schema reference for all SQL queries.
LLM agents MUST consult this file before generating any SQL.

AUTO-GENERATED from database.types.ts at server startup.
DO NOT edit table definitions manually — they will be overwritten.

Module: 4.1
Status: ACTIVE
Updated: 2026-06-01
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# Table Definitions (auto-generated — do not edit)
# ---------------------------------------------------------------------------

TABLES = {
    "amc_contracts": {
        "columns": ['contract_end_date', 'contract_start_date', 'contract_value', 'created_at', 'id', 'notes', 'organization_id', 'payment_terms', 'property_id', 'scope_of_work', 'status', 'system_name', 'updated_at', 'vendor_contact', 'vendor_id', 'vendor_name'],
        "primary_key": 'id',
        "required_predicates": ['organization_id', 'property_id'],
        "notes": 'amc_contracts table.'
    },
    "audit_logs": {
        "columns": ['action', 'event_at', 'event_by', 'id', 'object_id', 'object_type', 'payload'],
        "primary_key": 'id',
        "required_predicates": ['organization_id', 'property_id'],
        "notes": 'audit_logs table.'
    },
    "audit_master_items": {
        "columns": ['assigned_spoc_id', 'category', 'created_at', 'id', 'is_required_by_default', 'organization_id', 'period', 'requirement', 'si_no', 'spoc_name', 'updated_at'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'audit_master_items table.'
    },
    "commission_cycles": {
        "columns": ['commission_amount', 'commission_rate', 'created_at', 'cycle_end', 'cycle_start', 'id', 'organization_id', 'property_id', 'status', 'total_revenue', 'vendor_id'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'commission_cycles table.'
    },
    "companies": {
        "columns": ['contact_email', 'contact_phone', 'created_at', 'id', 'logo_url', 'name', 'organization_id', 'property_id', 'updated_at'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'companies table.'
    },
    "company_members": {
        "columns": ['company_id', 'created_at', 'id', 'organization_id', 'role', 'user_id'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'company_members table.'
    },
    "dg_tariffs": {
        "columns": ['cost_per_litre', 'created_at', 'created_by', 'effective_from', 'effective_to', 'generator_id', 'id'],
        "primary_key": 'id',
        "required_predicates": ['organization_id', 'property_id'],
        "notes": 'dg_tariffs table.'
    },
    "diesel_readings": {
        "columns": ['alert_status', 'closing_diesel_level', 'closing_hours', 'closing_kwh', 'computed_consumed_litres', 'computed_cost', 'computed_run_hours', 'created_at', 'created_by', 'diesel_added_litres', 'generator_id', 'id', 'notes', 'opening_diesel_level', 'opening_hours', 'opening_kwh', 'property_id', 'reading_date', 'tariff_id', 'tariff_rate_used', 'updated_at'],
        "primary_key": 'id',
        "required_predicates": ['organization_id', 'property_id'],
        "notes": 'diesel_readings table.'
    },
    "electricity_meters": {
        "columns": ['created_at', 'deleted_at', 'id', 'last_reading', 'max_load_kw', 'meter_number', 'meter_type', 'name', 'property_id', 'status', 'updated_at'],
        "primary_key": 'id',
        "required_predicates": ['organization_id', 'property_id'],
        "notes": 'electricity_meters table.'
    },
    "electricity_readings": {
        "columns": ['alert_status', 'closing_reading', 'computed_cost', 'computed_units', 'created_at', 'created_by', 'final_units', 'id', 'meter_id', 'multiplier_id', 'multiplier_value_used', 'notes', 'ocr_confidence', 'ocr_raw_response', 'ocr_reading', 'ocr_status', 'ocr_unit_detected', 'opening_reading', 'peak_load_kw', 'photo_url', 'property_id', 'reading_date', 'tariff_id', 'tariff_rate_used', 'updated_at'],
        "primary_key": 'id',
        "required_predicates": ['organization_id', 'property_id'],
        "notes": 'electricity_readings table.'
    },
    "escalation_hierarchies": {
        "columns": ['created_at', 'created_by', 'description', 'id', 'is_active', 'is_default', 'name', 'organization_id', 'property_id', 'trigger_after_minutes', 'updated_at'],
        "primary_key": 'id',
        "required_predicates": ['organization_id', 'property_id'],
        "notes": 'escalation_hierarchies table.'
    },
    "escalation_levels": {
        "columns": ['created_at', 'employee_id', 'escalation_time_minutes', 'hierarchy_id', 'id', 'level_number', 'notification_channels'],
        "primary_key": 'id',
        "required_predicates": ['organization_id', 'property_id'],
        "notes": 'escalation_levels table.'
    },
    "export_logs": {
        "columns": ['created_at', 'date_from', 'date_to', 'exported_by', 'format', 'id', 'property_ids', 'role'],
        "primary_key": 'id',
        "required_predicates": ['organization_id', 'property_id'],
        "notes": 'export_logs table.'
    },
    "feature_usage_logs": {
        "columns": ['action', 'created_at', 'feature_name', 'id', 'metadata', 'organization_id', 'property_id', 'user_id'],
        "primary_key": 'id',
        "required_predicates": ['organization_id', 'property_id'],
        "notes": 'feature_usage_logs table.'
    },
    "feature_usage_summary": {
        "columns": ['feature_name', 'last_used', 'organization_id', 'unique_users', 'usage_count', 'usage_date'],
        "primary_key": None,
        "required_predicates": ['organization_id', 'property_id'],
        "notes": 'feature_usage_summary table.'
    },
    "generators": {
        "columns": ['capacity_kva', 'created_at', 'effective_from_date', 'fuel_efficiency_lphr', 'id', 'initial_diesel_level', 'initial_kwh_reading', 'initial_run_hours', 'last_maintenance_date', 'make', 'name', 'next_maintenance_date', 'property_id', 'status', 'tank_capacity_litres', 'updated_at'],
        "primary_key": 'id',
        "required_predicates": ['organization_id', 'property_id'],
        "notes": 'generators table.'
    },
    "grid_tariffs": {
        "columns": ['created_at', 'created_by', 'effective_from', 'effective_to', 'id', 'property_id', 'rate_per_unit', 'unit_type', 'utility_provider'],
        "primary_key": 'id',
        "required_predicates": ['organization_id', 'property_id'],
        "notes": 'grid_tariffs table.'
    },
    "invite_link_usage": {
        "columns": ['id', 'invite_link_id', 'metadata', 'used_at', 'user_id'],
        "primary_key": 'id',
        "required_predicates": ['organization_id', 'property_id'],
        "notes": 'invite_link_usage table.'
    },
    "invite_links": {
        "columns": ['created_at', 'created_by', 'current_uses', 'expires_at', 'id', 'invitation_code', 'is_active', 'max_uses', 'metadata', 'organization_id', 'property_id', 'role'],
        "primary_key": 'id',
        "required_predicates": ['organization_id', 'property_id'],
        "notes": 'invite_links table.'
    },
    "issue_categories": {
        "columns": ['code', 'created_at', 'icon', 'id', 'is_active', 'name', 'priority', 'property_id', 'skill_group_id', 'sla_hours', 'updated_at'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'issue_categories table.'
    },
    "llm_health_metrics": {
        "columns": ['avg_latency_ms', 'failure_count', 'fallback_count', 'id', 'p95_latency_ms', 'success_count', 'timestamp', 'window_minutes'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'llm_health_metrics table.'
    },
    "maintenance_vendors": {
        "columns": ['bank_account_number', 'bank_ifsc', 'bank_name', 'cancelled_cheque_url', 'company_name', 'contact_person', 'created_at', 'created_by', 'email', 'gst_doc_url', 'gst_number', 'id', 'is_active', 'kyc_rejection_reason', 'kyc_status', 'msme_doc_url', 'msme_number', 'organization_id', 'pan_doc_url', 'pan_number', 'phone', 'specialization', 'updated_at', 'user_id', 'whatsapp_number'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'maintenance_vendors table.'
    },
    "material_request_items": {
        "columns": ['catalog_item_id', 'created_at', 'description', 'id', 'links', 'name', 'organization_id', 'photo_url', 'quantity', 'request_id', 'total_price', 'unit_price'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'material_request_items table.'
    },
    "material_requests": {
        "columns": ['approval_level', 'approved_at', 'approved_by', 'assignee_uid', 'budget_type', 'cancellation_reason', 'cancelled_at', 'created_at', 'delivered_at', 'escalated_at', 'escalated_by', 'has_custom_items', 'id', 'items', 'ordered_at', 'organization_id', 'property_id', 'rejected_at', 'rejected_by', 'rejection_reason', 'requested_by', 'status', 'target_approver_id', 'target_approver_ids', 'ticket_id', 'total_amount', 'updated_at'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'material_requests table.'
    },
    "meeting_room_bookings": {
        "columns": ['booking_date', 'company_id', 'created_at', 'end_time', 'id', 'meeting_room_id', 'organization_id', 'property_id', 'start_time', 'status', 'updated_at', 'user_id'],
        "primary_key": 'id',
        "required_predicates": ['organization_id', 'property_id'],
        "notes": 'meeting_room_bookings table.'
    },
    "meeting_room_credit_log": {
        "columns": ['action', 'booking_id', 'company_id', 'created_at', 'credit_id', 'hours_after', 'hours_changed', 'id', 'notes', 'organization_id', 'performed_by', 'request_id', 'user_id'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'meeting_room_credit_log table.'
    },
    "meeting_room_credit_requests": {
        "columns": ['admin_note', 'created_at', 'id', 'property_id', 'reason', 'requested_hours', 'reviewed_at', 'reviewed_by', 'status', 'user_id'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'meeting_room_credit_requests table.'
    },
    "meeting_room_credits": {
        "columns": ['assigned_by', 'company_id', 'created_at', 'id', 'last_reset_at', 'monthly_hours', 'next_reset_at', 'organization_id', 'property_id', 'remaining_hours', 'updated_at', 'user_id'],
        "primary_key": 'id',
        "required_predicates": ['organization_id', 'property_id'],
        "notes": 'meeting_room_credits table.'
    },
    "meeting_room_slots": {
        "columns": ['created_at', 'end_time', 'id', 'start_time'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'meeting_room_slots table.'
    },
    "meeting_rooms": {
        "columns": ['amenities', 'capacity', 'created_at', 'created_by', 'deleted_at', 'id', 'location', 'name', 'photo_url', 'property_id', 'size', 'status', 'updated_at'],
        "primary_key": 'id',
        "required_predicates": ['organization_id', 'property_id'],
        "notes": 'meeting_rooms table.'
    },
    "messages": {
        "columns": ['body', 'created_at', 'id', 'metadata', 'room_id', 'sender_id'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'messages table.'
    },
    "meter_multipliers": {
        "columns": ['created_at', 'created_by', 'ct_ratio_primary', 'ct_ratio_secondary', 'effective_from', 'effective_to', 'id', 'meter_constant', 'meter_id', 'multiplier_value', 'pt_ratio_primary', 'pt_ratio_secondary', 'reason'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'meter_multipliers table.'
    },
    "module_usage_summary": {
        "columns": ['active_users', 'last_used', 'module_name', 'organization_id', 'total_uses'],
        "primary_key": None,
        "required_predicates": ['organization_id'],
        "notes": 'module_usage_summary table.'
    },
    "mst_achievements": {
        "columns": ['code', 'color', 'created_at', 'criteria', 'description', 'icon', 'id', 'is_active', 'name', 'points_bonus', 'tier'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'mst_achievements table.'
    },
    "mst_daily_scores": {
        "columns": ['avg_resolution_minutes', 'first_time_fixes', 'last_activity_at', 'property_id', 'score_date', 'sla_breached_count', 'sla_met_count', 'streak_days', 'tickets_resolved', 'total_points', 'updated_at', 'user_id'],
        "primary_key": None,
        "required_predicates": ['organization_id'],
        "notes": 'mst_daily_scores table.'
    },
    "mst_point_transactions": {
        "columns": ['created_at', 'event_type', 'id', 'metadata', 'points', 'property_id', 'source_ticket_id', 'user_id'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'mst_point_transactions table.'
    },
    "mst_skills": {
        "columns": ['skill_code', 'user_id'],
        "primary_key": None,
        "required_predicates": ['organization_id'],
        "notes": 'mst_skills table.'
    },
    "mst_streaks": {
        "columns": ['current_streak', 'last_active_date', 'longest_streak', 'property_id', 'updated_at', 'user_id'],
        "primary_key": None,
        "required_predicates": ['organization_id'],
        "notes": 'mst_streaks table.'
    },
    "mst_user_badges": {
        "columns": ['achievement_id', 'earned_at', 'user_id'],
        "primary_key": None,
        "required_predicates": ['organization_id'],
        "notes": 'mst_user_badges table.'
    },
    "mst_workload": {
        "columns": ['active_tickets', 'completed_this_week', 'full_name', 'is_available', 'paused_tickets', 'property_id', 'user_id'],
        "primary_key": None,
        "required_predicates": ['organization_id', 'property_id'],
        "notes": 'mst_workload table.'
    },
    "notification_delivery": {
        "columns": ['clicked_at', 'delivered_at', 'delivery_status', 'id', 'notification_id', 'push_token'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'notification_delivery table.'
    },
    "notifications": {
        "columns": ['booking_id', 'created_at', 'deep_link', 'id', 'is_read', 'message', 'notification_type', 'organization_id', 'property_id', 'ticket_id', 'title', 'user_id', 'whatsapp_error', 'whatsapp_sent_at', 'whatsapp_status'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'notifications table.'
    },
    "ocr_audit_logs": {
        "columns": ['created_at', 'event_type', 'id', 'payload', 'property_id', 'reading_id'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'ocr_audit_logs table.'
    },
    "organization_memberships": {
        "columns": ['created_at', 'is_active', 'organization_id', 'role', 'user_id'],
        "primary_key": None,
        "required_predicates": ['organization_id', 'property_id'],
        "notes": 'organization_memberships table.'
    },
    "organizations": {
        "columns": ['available_modules', 'code', 'created_at', 'deleted_at', 'deletion_secret', 'id', 'is_deleted', 'name', 'status', 'updated_at'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'organizations table.'
    },
    "payment_transactions": {
        "columns": ['amount', 'commission_cycle_id', 'created_at', 'gateway', 'gateway_ref', 'id', 'property_id', 'status', 'vendor_id'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'payment_transactions table.'
    },
    "ppm_audit_items": {
        "columns": ['attachment_url', 'audit_report_id', 'created_at', 'has_completion_report', 'id', 'ppm_item_id'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'ppm_audit_items table.'
    },
    "ppm_audit_reports": {
        "columns": ['audit_month', 'completed_tasks', 'compliance_pct', 'generated_at', 'id', 'organization_id', 'pending_tasks', 'property_id', 'total_tasks'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'ppm_audit_reports table.'
    },
    "ppm_schedules": {
        "columns": ['attachments', 'checker', 'completion_doc_url', 'completion_photos', 'created_at', 'detail_name', 'done_date', 'frequency', 'id', 'invoice_url', 'location', 'maker', 'organization_id', 'planned_date', 'property_id', 'rejection_reason', 'remark', 'scope_of_work', 'si_no', 'status', 'system_name', 'updated_at', 'vendor_contact_person', 'vendor_id', 'vendor_name', 'vendor_phone', 'verification_status', 'verified_at', 'verified_by'],
        "primary_key": 'id',
        "required_predicates": ['organization_id', 'property_id'],
        "notes": 'ppm_schedules table.'
    },
    "procurement_activity_log": {
        "columns": ['action', 'created_at', 'id', 'material_request_id', 'metadata', 'new_value', 'old_value', 'procurement_order_id', 'user_id'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'procurement_activity_log table.'
    },
    "procurement_budgets": {
        "columns": ['budget_type', 'created_at', 'id', 'organization_id', 'period_end', 'period_start', 'property_id', 'spent_amount', 'total_amount', 'updated_at'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'procurement_budgets table.'
    },
    "procurement_catalog": {
        "columns": ['category', 'created_at', 'description', 'estimated_price', 'id', 'is_active', 'name', 'organization_id', 'photo_data', 'photo_url', 'stock_item_id', 'unit', 'updated_at'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'procurement_catalog table.'
    },
    "procurement_orders": {
        "columns": ['actual_delivery', 'created_at', 'delivery_status', 'expected_delivery', 'id', 'invoice_number', 'invoice_url', 'items', 'material_request_id', 'notes', 'ordered_by', 'organization_id', 'payment_status', 'property_id', 'total_amount', 'updated_at', 'vendor_contact', 'vendor_name'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'procurement_orders table.'
    },
    "procurement_price_visibility": {
        "columns": ['created_at', 'id', 'organization_id', 'property_id', 'roles', 'updated_at', 'users'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'procurement_price_visibility table.'
    },
    "procurement_settings": {
        "columns": ['created_at', 'high_approver_id', 'low_approver_id', 'organization_id', 'price_visibility_roles', 'property_id', 'threshold_amount', 'updated_at'],
        "primary_key": None,
        "required_predicates": ['organization_id'],
        "notes": 'procurement_settings table.'
    },
    "properties": {
        "columns": ['address', 'capacity', 'city', 'code', 'created_at', 'id', 'image_url', 'is_active', 'name', 'organization_id', 'status'],
        "primary_key": 'id',
        "required_predicates": ['organization_id', 'property_id'],
        "notes": 'properties table.'
    },
    "property_activities": {
        "columns": ['created_at', 'created_by', 'id', 'organization_id', 'property_id', 'status', 'type'],
        "primary_key": 'id',
        "required_predicates": ['organization_id', 'property_id'],
        "notes": 'property_activities table.'
    },
    "property_audit_submissions": {
        "columns": ['audit_period_year', 'created_at', 'id', 'master_item_id', 'organization_id', 'proof_url', 'property_id', 'remark', 'status', 'submitted_at', 'submitted_by', 'updated_at', 'verified_at', 'verified_by'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'property_audit_submissions table.'
    },
    "property_features": {
        "columns": ['created_at', 'feature_key', 'id', 'is_enabled', 'property_id', 'settings', 'updated_at'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'property_features table.'
    },
    "property_memberships": {
        "columns": ['created_at', 'is_active', 'organization_id', 'property_id', 'role', 'user_id'],
        "primary_key": None,
        "required_predicates": ['organization_id', 'property_id'],
        "notes": 'property_memberships table.'
    },
    "push_tokens": {
        "columns": ['browser', 'created_at', 'device_info', 'id', 'is_active', 'property_id', 'token', 'updated_at', 'user_id'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'push_tokens table.'
    },
    "resolver_stats": {
        "columns": ['avg_resolution_minutes', 'created_at', 'current_floor', 'id', 'is_available', 'is_checked_in', 'last_assigned_at', 'last_ticket_at', 'property_id', 'skill_group_id', 'total_resolved', 'updated_at', 'user_id'],
        "primary_key": 'id',
        "required_predicates": ['organization_id', 'property_id'],
        "notes": 'resolver_stats table.'
    },
    "shift_logs": {
        "columns": ['check_in_at', 'check_out_at', 'created_at', 'id', 'property_id', 'status', 'user_id'],
        "primary_key": 'id',
        "required_predicates": ['organization_id', 'property_id'],
        "notes": 'shift_logs table.'
    },
    "skill_groups": {
        "columns": ['code', 'created_at', 'description', 'id', 'is_active', 'is_manual_assign', 'name', 'property_id', 'updated_at'],
        "primary_key": 'id',
        "required_predicates": ['organization_id', 'property_id'],
        "notes": 'skill_groups table.'
    },
    "sla_templates": {
        "columns": ['category_code', 'created_at', 'id', 'is_active', 'organization_id', 'priority', 'property_id', 'resolution_sla_hours', 'response_sla_hours', 'updated_at'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'sla_templates table.'
    },
    "snag_imports": {
        "columns": ['completed_at', 'created_at', 'error_rows', 'filename', 'id', 'imported_by', 'organization_id', 'property_id', 'status', 'total_rows', 'valid_rows'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'snag_imports table.'
    },
    "sop_checklist_items": {
        "columns": ['created_at', 'description', 'end_time', 'id', 'is_mandatory', 'is_optional', 'order_index', 'requires_comment', 'requires_photo', 'start_time', 'template_id', 'title', 'type'],
        "primary_key": 'id',
        "required_predicates": ['organization_id', 'property_id'],
        "notes": 'sop_checklist_items table.'
    },
    "sop_completion_items": {
        "columns": ['checked_at', 'checked_by', 'checklist_item_id', 'comment', 'completion_id', 'id', 'is_checked', 'photo_url', 'satisfaction_at', 'satisfaction_by', 'satisfaction_rating', 'updated_at', 'value', 'video_url'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'sop_completion_items table.'
    },
    "sop_completions": {
        "columns": ['completed_at', 'completed_by', 'completion_date', 'created_at', 'due_at', 'id', 'is_late', 'notes', 'organization_id', 'property_id', 'slot_time', 'status', 'template_id', 'updated_at'],
        "primary_key": 'id',
        "required_predicates": ['organization_id', 'property_id'],
        "notes": 'sop_completions table.'
    },
    "sop_templates": {
        "columns": ['assigned_to', 'category', 'created_at', 'created_by', 'description', 'end_time', 'frequency', 'id', 'is_active', 'is_running', 'organization_id', 'property_id', 'start_time', 'started_at', 'title', 'updated_at'],
        "primary_key": 'id',
        "required_predicates": ['organization_id', 'property_id'],
        "notes": 'sop_templates table.'
    },
    "stock_items": {
        "columns": ['barcode', 'barcode_format', 'barcode_generated_at', 'category', 'created_at', 'created_by', 'description', 'id', 'item_code', 'location', 'min_threshold', 'name', 'organization_id', 'per_unit_cost', 'property_id', 'qr_code_data', 'quantity', 'unit', 'updated_at'],
        "primary_key": 'id',
        "required_predicates": ['organization_id', 'property_id'],
        "notes": 'stock_items table.'
    },
    "stock_movements": {
        "columns": ['action', 'created_at', 'id', 'item_id', 'notes', 'organization_id', 'property_id', 'quantity_after', 'quantity_before', 'quantity_change', 'user_id'],
        "primary_key": 'id',
        "required_predicates": ['organization_id', 'property_id'],
        "notes": 'stock_movements table.'
    },
    "stock_reports": {
        "columns": ['generated_at', 'generated_by', 'id', 'low_stock_count', 'organization_id', 'property_id', 'report_data', 'report_date', 'total_added', 'total_items', 'total_removed'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'stock_reports table.'
    },
    "super_tenant_properties": {
        "columns": ['assigned_by', 'created_at', 'id', 'organization_id', 'property_id', 'user_id'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'super_tenant_properties table.'
    },
    "ticket_activity_log": {
        "columns": ['action', 'created_at', 'id', 'new_value', 'old_value', 'ticket_id', 'user_id'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'ticket_activity_log table.'
    },
    "ticket_classification_logs": {
        "columns": ['completion_tokens', 'created_at', 'decision_source', 'entropy', 'final_bucket', 'id', 'llm_bucket', 'llm_confidence', 'llm_latency_ms', 'llm_reason', 'llm_risk_flag', 'llm_secondary_bucket', 'llm_used', 'prompt_tokens', 'rule_margin', 'rule_scores', 'rule_top_bucket', 'ticket_id', 'total_tokens', 'zone'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'ticket_classification_logs table.'
    },
    "ticket_comments": {
        "columns": ['comment', 'created_at', 'id', 'is_internal', 'metadata', 'ticket_id', 'user_id'],
        "primary_key": 'id',
        "required_predicates": ['organization_id', 'property_id'],
        "notes": 'ticket_comments table.'
    },
    "ticket_counters": {
        "columns": ['last_number', 'property_id'],
        "primary_key": None,
        "required_predicates": ['organization_id'],
        "notes": 'ticket_counters table.'
    },
    "ticket_escalation_logs": {
        "columns": ['escalated_at', 'from_employee_id', 'from_level', 'hierarchy_id', 'id', 'reason', 'ticket_id', 'to_employee_id', 'to_level'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'ticket_escalation_logs table.'
    },
    "ticket_sequences": {
        "columns": ['last_number', 'property_id', 'updated_at'],
        "primary_key": None,
        "required_predicates": ['organization_id'],
        "notes": 'ticket_sequences table.'
    },
    "tickets": {
        "columns": ['accepted_at', 'assigned_at', 'assigned_to', 'assigned_to_name', 'category', 'category_id', 'classification_override', 'classification_source', 'confidence', 'confidence_score', 'created_at', 'current_escalation_level', 'department', 'description', 'escalation_last_action_at', 'escalation_paused', 'floor_number', 'hierarchy_id', 'id', 'import_batch_id', 'internal', 'is_internal', 'is_vague', 'issue_code', 'llm_reasoning', 'location', 'organization_id', 'original_skill_group_id', 'override_at', 'override_by', 'photo_after_url', 'photo_before_url', 'priority', 'property_id', 'raised_by', 'raised_by_name', 'rating', 'resolution_notes', 'resolution_sla_hours', 'resolved_at', 'response_sla_hours', 'risk_flag', 'secondary_category_code', 'skill_group_code', 'skill_group_id', 'sla_breached', 'sla_deadline', 'sla_hours', 'sla_pause_reason', 'sla_paused', 'sla_paused_at', 'sla_started', 'status', 'ticket_number', 'title', 'total_paused_minutes', 'updated_at', 'validated_at', 'validated_by', 'validation_note', 'validation_status', 'video_after_url', 'video_before_url', 'wa_message_id', 'work_pause_reason', 'work_paused', 'work_paused_at', 'work_paused_by', 'work_started_at'],
        "primary_key": 'id',
        "required_predicates": ['organization_id', 'property_id'],
        "notes": 'tickets table.'
    },
    "user_achievements": {
        "columns": ['achievement_id', 'earned_at', 'id', 'property_id', 'user_id'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'user_achievements table.'
    },
    "user_engagement_metrics": {
        "columns": ['avg_duration_seconds', 'email', 'engagement_level', 'full_name', 'last_active', 'sessions_this_week', 'total_sessions', 'user_id'],
        "primary_key": None,
        "required_predicates": ['organization_id'],
        "notes": 'user_engagement_metrics table.'
    },
    "user_roles": {
        "columns": ['created_at', 'id', 'organization_id', 'role', 'user_id'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'user_roles table.'
    },
    "user_sessions": {
        "columns": ['created_at', 'duration_seconds', 'id', 'ip_address', 'last_activity', 'session_end', 'session_start', 'user_agent', 'user_id'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'user_sessions table.'
    },
    "user_status_summary": {
        "columns": ['count', 'organization_id', 'status'],
        "primary_key": None,
        "required_predicates": ['organization_id'],
        "notes": 'user_status_summary table.'
    },
    "users": {
        "columns": ['created_at', 'deleted_at', 'email', 'first_login', 'full_name', 'id', 'is_master_admin', 'last_activity', 'last_seen_at', 'metadata', 'onboarding_completed', 'online_status', 'phone', 'team', 'user_photo_url'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'users table.'
    },
    "vendor_daily_revenue": {
        "columns": ['created_at', 'entry_date', 'id', 'organization_id', 'property_id', 'revenue_amount', 'revenue_date', 'updated_at', 'vendor_id'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'vendor_daily_revenue table.'
    },
    "vendor_payments": {
        "columns": ['amount', 'created_at', 'cycle_id', 'gateway_name', 'gateway_txn_id', 'id', 'organization_id', 'receipt_url', 'status', 'updated_at', 'vendor_id'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'vendor_payments table.'
    },
    "vendor_property_assignments": {
        "columns": ['created_at', 'id', 'property_id', 'vendor_id'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'vendor_property_assignments table.'
    },
    "vendors": {
        "columns": ['commission_rate', 'created_at', 'id', 'organization_id', 'payment_enabled', 'payment_gateway_enabled', 'property_id', 'shop_name', 'status', 'updated_at', 'user_id', 'vendor_name'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'vendors table.'
    },
    "visitor_id_counters": {
        "columns": ['last_number', 'property_id'],
        "primary_key": None,
        "required_predicates": ['organization_id'],
        "notes": 'visitor_id_counters table.'
    },
    "visitor_logs": {
        "columns": ['category', 'checkin_time', 'checkout_time', 'coming_from', 'created_at', 'id', 'mobile', 'name', 'organization_id', 'photo_url', 'property_id', 'purpose', 'status', 'visitor_id', 'whom_to_meet'],
        "primary_key": 'id',
        "required_predicates": ['organization_id', 'property_id'],
        "notes": 'visitor_logs table.'
    },
    "vms_tickets": {
        "columns": ['created_at', 'description', 'id', 'organization_id', 'property_id', 'reported_by', 'status', 'title', 'updated_at'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'vms_tickets table.'
    },
    "whatsapp_queue": {
        "columns": ['created_at', 'error', 'event_type', 'id', 'media_type', 'media_url', 'message', 'phone', 'retry_count', 'sent_at', 'status', 'ticket_id', 'user_id'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'whatsapp_queue table.'
    },
    "whatsapp_sessions": {
        "columns": ['expires_at', 'pending_is_image', 'pending_is_video', 'pending_media_key', 'pending_media_url', 'pending_text', 'pending_video_key', 'pending_video_url', 'phone', 'property_options', 'state', 'user_id'],
        "primary_key": None,
        "required_predicates": ['organization_id'],
        "notes": 'whatsapp_sessions table.'
    },
    "zoho_po_audit_log": {
        "columns": ['ai_model_used', 'completed_at', 'confidence_score', 'created_at', 'created_by', 'error_message', 'extraction_confidence', 'id', 'invoice_amount', 'invoice_date', 'invoice_file_url', 'invoice_filename', 'invoice_number', 'is_new_vendor', 'organization_id', 'parsed_invoice_data', 'po_amount', 'po_id', 'po_number', 'po_status', 'processing_time_ms', 'property_id', 'retry_count', 'updated_at', 'user_context', 'vendor_id', 'vendor_name', 'zoho_response'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'zoho_po_audit_log table.'
    },
    "zoho_po_entity_master": {
        "columns": ['billing_address', 'created_at', 'entity_name', 'gstin', 'id', 'is_active', 'legal_entity_name', 'organization_id', 'shipping_address', 'state_code', 'state_name', 'updated_at', 'zoho_organization_id'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'zoho_po_entity_master table.'
    },
    "zoho_po_settings": {
        "columns": ['ai_model_name', 'ai_model_provider', 'auto_retry_enabled', 'created_at', 'id', 'is_enabled', 'max_retry_count', 'organization_id', 'po_approval_threshold', 'require_approval', 'updated_at', 'zoho_access_token', 'zoho_organization_id', 'zoho_refresh_token', 'zoho_token_expires_at'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'zoho_po_settings table.'
    },
    "zoho_po_tokens": {
        "columns": ['access_token', 'created_at', 'expires_at', 'id', 'organization_id', 'refresh_token', 'updated_at'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'zoho_po_tokens table.'
    },
    "zoho_po_vendor_cache": {
        "columns": ['bank_details', 'billing_address', 'contact_email', 'contact_phone', 'created_at', 'gstin', 'id', 'is_active', 'is_empanelled', 'last_synced_at', 'legal_name', 'organization_id', 'pan', 'payment_terms', 'updated_at', 'vendor_name', 'zoho_vendor_id'],
        "primary_key": 'id',
        "required_predicates": ['organization_id'],
        "notes": 'zoho_po_vendor_cache table.'
    },
}

# ---------------------------------------------------------------------------
# Valid Values (auto-generated)
# ---------------------------------------------------------------------------

VALID_STATUS = {
    "tickets": ["open", "assigned", "in_progress", "resolved", "closed", "waitlist"],
}

VALID_PRIORITY = {
    "tickets": ["low", "medium", "high", "urgent", "critical"],
}

# ---------------------------------------------------------------------------
# Column Name Corrections (Mobile → Schema)
# ---------------------------------------------------------------------------

COLUMN_ALIASES = {
    "created_date": "created_at",       # Timestamptz column
    "created_by": "raised_by",          # FK to users
    "avatar_url": "user_photo_url",     # User photo
    "comment": "comment",               # Correct column name for ticket_comments
    "content": "comment",              # Old name maps to 'comment'
}

# Status values that DON'T exist (retired/deprecated)
RETIRED_STATUS = {
    "tickets": ["satisfied", "paused", "pending_validation"],
}

# ---------------------------------------------------------------------------
# Query Templates
# ---------------------------------------------------------------------------

QUERY_TEMPLATES = {
    "yesterday_ticket_count": """
SELECT COUNT(*) as ticket_count
FROM tickets
WHERE organization_id = '{{org_id}}'
  AND property_id = '{{property_id}}'
  AND created_at >= CURRENT_DATE - INTERVAL '1 day'
  AND created_at < CURRENT_DATE;
""",

    "open_tickets_by_assignee": """
SELECT assigned_to, COUNT(*) as open_count
FROM tickets
WHERE organization_id = '{{org_id}}'
  AND property_id = '{{property_id}}'
  AND status = 'open'
GROUP BY assigned_to
ORDER BY open_count DESC
LIMIT 5;
""",

    "property_ticket_summary": """
SELECT
    status,
    COUNT(*) as count
FROM tickets
WHERE organization_id = '{{org_id}}'
  AND property_id = '{{property_id}}'
GROUP BY status
ORDER BY count DESC;
""",
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def get_valid_status(table: str) -> list[str]:
    """Return valid status values for a table."""
    return VALID_STATUS.get(table, [])

def get_valid_priority(table: str) -> list[str]:
    """Return valid priority values for a table."""
    return VALID_PRIORITY.get(table, [])

def get_required_predicates(table: str) -> list[str]:
    """Return required WHERE predicates for a table."""
    return TABLES.get(table, {}).get("required_predicates", [])

def get_table_columns(table: str) -> list[str]:
    """Return all columns for a table."""
    return TABLES.get(table, {}).get("columns", [])

def resolve_column(alias: str) -> str:
    """Resolve a column alias to the actual column name."""
    return COLUMN_ALIASES.get(alias, alias)
