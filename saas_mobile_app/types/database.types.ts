export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      amc_contracts: {
        Row: {
          contract_end_date: string
          contract_start_date: string
          contract_value: number | null
          created_at: string | null
          id: string
          notes: string | null
          organization_id: string
          payment_terms: string | null
          property_id: string | null
          scope_of_work: string | null
          status: string | null
          system_name: string
          updated_at: string | null
          vendor_contact: string | null
          vendor_id: string | null
          vendor_name: string
        }
        Insert: {
          contract_end_date: string
          contract_start_date: string
          contract_value?: number | null
          created_at?: string | null
          id?: string
          notes?: string | null
          organization_id: string
          payment_terms?: string | null
          property_id?: string | null
          scope_of_work?: string | null
          status?: string | null
          system_name: string
          updated_at?: string | null
          vendor_contact?: string | null
          vendor_id?: string | null
          vendor_name: string
        }
        Update: {
          contract_end_date?: string
          contract_start_date?: string
          contract_value?: number | null
          created_at?: string | null
          id?: string
          notes?: string | null
          organization_id?: string
          payment_terms?: string | null
          property_id?: string | null
          scope_of_work?: string | null
          status?: string | null
          system_name?: string
          updated_at?: string | null
          vendor_contact?: string | null
          vendor_id?: string | null
          vendor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "amc_contracts_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "maintenance_vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          event_at: string
          event_by: string | null
          id: number
          object_id: string | null
          object_type: string
          payload: Json | null
        }
        Insert: {
          action: string
          event_at?: string
          event_by?: string | null
          id?: number
          object_id?: string | null
          object_type: string
          payload?: Json | null
        }
        Update: {
          action?: string
          event_at?: string
          event_by?: string | null
          id?: number
          object_id?: string | null
          object_type?: string
          payload?: Json | null
        }
        Relationships: []
      }
      audit_master_items: {
        Row: {
          assigned_spoc_id: string | null
          category: string
          created_at: string | null
          id: string
          is_required_by_default: boolean | null
          organization_id: string
          period: string | null
          requirement: string
          si_no: number | null
          spoc_name: string | null
          updated_at: string | null
        }
        Insert: {
          assigned_spoc_id?: string | null
          category: string
          created_at?: string | null
          id?: string
          is_required_by_default?: boolean | null
          organization_id: string
          period?: string | null
          requirement: string
          si_no?: number | null
          spoc_name?: string | null
          updated_at?: string | null
        }
        Update: {
          assigned_spoc_id?: string | null
          category?: string
          created_at?: string | null
          id?: string
          is_required_by_default?: boolean | null
          organization_id?: string
          period?: string | null
          requirement?: string
          si_no?: number | null
          spoc_name?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      commission_cycles: {
        Row: {
          commission_amount: number | null
          commission_rate: number | null
          created_at: string | null
          cycle_end: string
          cycle_start: string
          id: string
          organization_id: string
          property_id: string
          status: string
          total_revenue: number | null
          vendor_id: string
        }
        Insert: {
          commission_amount?: number | null
          commission_rate?: number | null
          created_at?: string | null
          cycle_end: string
          cycle_start: string
          id?: string
          organization_id: string
          property_id: string
          status: string
          total_revenue?: number | null
          vendor_id: string
        }
        Update: {
          commission_amount?: number | null
          commission_rate?: number | null
          created_at?: string | null
          cycle_end?: string
          cycle_start?: string
          id?: string
          organization_id?: string
          property_id?: string
          status?: string
          total_revenue?: number | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_cycles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_cycles_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_cycles_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          id: string
          logo_url: string | null
          name: string
          organization_id: string
          property_id: string
          updated_at: string
        }
        Insert: {
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          organization_id: string
          property_id: string
          updated_at?: string
        }
        Update: {
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          organization_id?: string
          property_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "companies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      company_members: {
        Row: {
          company_id: string
          created_at: string
          id: string
          organization_id: string | null
          role: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          organization_id?: string | null
          role?: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          organization_id?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "company_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "company_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "company_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      dg_tariffs: {
        Row: {
          cost_per_litre: number
          created_at: string | null
          created_by: string | null
          effective_from: string
          effective_to: string | null
          generator_id: string
          id: string
        }
        Insert: {
          cost_per_litre: number
          created_at?: string | null
          created_by?: string | null
          effective_from: string
          effective_to?: string | null
          generator_id: string
          id?: string
        }
        Update: {
          cost_per_litre?: number
          created_at?: string | null
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          generator_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dg_tariffs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "dg_tariffs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "dg_tariffs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dg_tariffs_generator_id_fkey"
            columns: ["generator_id"]
            isOneToOne: false
            referencedRelation: "generators"
            referencedColumns: ["id"]
          },
        ]
      }
      diesel_readings: {
        Row: {
          alert_status: string | null
          closing_diesel_level: number | null
          closing_hours: number
          closing_kwh: number | null
          computed_consumed_litres: number | null
          computed_cost: number | null
          computed_run_hours: number | null
          created_at: string | null
          created_by: string | null
          diesel_added_litres: number | null
          generator_id: string
          id: string
          notes: string | null
          opening_diesel_level: number | null
          opening_hours: number
          opening_kwh: number | null
          property_id: string
          reading_date: string
          tariff_id: string | null
          tariff_rate_used: number | null
          updated_at: string | null
        }
        Insert: {
          alert_status?: string | null
          closing_diesel_level?: number | null
          closing_hours: number
          closing_kwh?: number | null
          computed_consumed_litres?: number | null
          computed_cost?: number | null
          computed_run_hours?: number | null
          created_at?: string | null
          created_by?: string | null
          diesel_added_litres?: number | null
          generator_id: string
          id?: string
          notes?: string | null
          opening_diesel_level?: number | null
          opening_hours: number
          opening_kwh?: number | null
          property_id: string
          reading_date?: string
          tariff_id?: string | null
          tariff_rate_used?: number | null
          updated_at?: string | null
        }
        Update: {
          alert_status?: string | null
          closing_diesel_level?: number | null
          closing_hours?: number
          closing_kwh?: number | null
          computed_consumed_litres?: number | null
          computed_cost?: number | null
          computed_run_hours?: number | null
          created_at?: string | null
          created_by?: string | null
          diesel_added_litres?: number | null
          generator_id?: string
          id?: string
          notes?: string | null
          opening_diesel_level?: number | null
          opening_hours?: number
          opening_kwh?: number | null
          property_id?: string
          reading_date?: string
          tariff_id?: string | null
          tariff_rate_used?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "diesel_readings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "diesel_readings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "diesel_readings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diesel_readings_generator_id_fkey"
            columns: ["generator_id"]
            isOneToOne: false
            referencedRelation: "generators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diesel_readings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "diesel_readings_tariff_id_fkey"
            columns: ["tariff_id"]
            isOneToOne: false
            referencedRelation: "dg_tariffs"
            referencedColumns: ["id"]
          },
        ]
      }
      electricity_meters: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          id: string
          last_reading: number | null
          max_load_kw: number | null
          meter_number: string | null
          meter_type: string | null
          name: string
          property_id: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          last_reading?: number | null
          max_load_kw?: number | null
          meter_number?: string | null
          meter_type?: string | null
          name: string
          property_id: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          id?: string
          last_reading?: number | null
          max_load_kw?: number | null
          meter_number?: string | null
          meter_type?: string | null
          name?: string
          property_id?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "electricity_meters_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      electricity_readings: {
        Row: {
          alert_status: string | null
          closing_reading: number
          computed_cost: number | null
          computed_units: number | null
          created_at: string | null
          created_by: string | null
          final_units: number | null
          id: string
          meter_id: string
          multiplier_id: string | null
          multiplier_value_used: number | null
          notes: string | null
          ocr_confidence: number | null
          ocr_raw_response: Json | null
          ocr_reading: number | null
          ocr_status: string | null
          ocr_unit_detected: string | null
          opening_reading: number
          peak_load_kw: number | null
          photo_url: string | null
          property_id: string
          reading_date: string
          tariff_id: string | null
          tariff_rate_used: number | null
          updated_at: string | null
        }
        Insert: {
          alert_status?: string | null
          closing_reading: number
          computed_cost?: number | null
          computed_units?: number | null
          created_at?: string | null
          created_by?: string | null
          final_units?: number | null
          id?: string
          meter_id: string
          multiplier_id?: string | null
          multiplier_value_used?: number | null
          notes?: string | null
          ocr_confidence?: number | null
          ocr_raw_response?: Json | null
          ocr_reading?: number | null
          ocr_status?: string | null
          ocr_unit_detected?: string | null
          opening_reading: number
          peak_load_kw?: number | null
          photo_url?: string | null
          property_id: string
          reading_date?: string
          tariff_id?: string | null
          tariff_rate_used?: number | null
          updated_at?: string | null
        }
        Update: {
          alert_status?: string | null
          closing_reading?: number
          computed_cost?: number | null
          computed_units?: number | null
          created_at?: string | null
          created_by?: string | null
          final_units?: number | null
          id?: string
          meter_id?: string
          multiplier_id?: string | null
          multiplier_value_used?: number | null
          notes?: string | null
          ocr_confidence?: number | null
          ocr_raw_response?: Json | null
          ocr_reading?: number | null
          ocr_status?: string | null
          ocr_unit_detected?: string | null
          opening_reading?: number
          peak_load_kw?: number | null
          photo_url?: string | null
          property_id?: string
          reading_date?: string
          tariff_id?: string | null
          tariff_rate_used?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "electricity_readings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "electricity_readings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "electricity_readings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "electricity_readings_meter_id_fkey"
            columns: ["meter_id"]
            isOneToOne: false
            referencedRelation: "electricity_meters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "electricity_readings_multiplier_id_fkey"
            columns: ["multiplier_id"]
            isOneToOne: false
            referencedRelation: "meter_multipliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "electricity_readings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "electricity_readings_tariff_id_fkey"
            columns: ["tariff_id"]
            isOneToOne: false
            referencedRelation: "grid_tariffs"
            referencedColumns: ["id"]
          },
        ]
      }
      escalation_hierarchies: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_default: boolean
          name: string
          organization_id: string
          property_id: string | null
          trigger_after_minutes: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean
          name: string
          organization_id: string
          property_id?: string | null
          trigger_after_minutes?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean
          name?: string
          organization_id?: string
          property_id?: string | null
          trigger_after_minutes?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "escalation_hierarchies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "escalation_hierarchies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "escalation_hierarchies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalation_hierarchies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalation_hierarchies_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      escalation_levels: {
        Row: {
          created_at: string | null
          employee_id: string | null
          escalation_time_minutes: number
          hierarchy_id: string
          id: string
          level_number: number
          notification_channels: string[] | null
        }
        Insert: {
          created_at?: string | null
          employee_id?: string | null
          escalation_time_minutes?: number
          hierarchy_id: string
          id?: string
          level_number: number
          notification_channels?: string[] | null
        }
        Update: {
          created_at?: string | null
          employee_id?: string | null
          escalation_time_minutes?: number
          hierarchy_id?: string
          id?: string
          level_number?: number
          notification_channels?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "escalation_levels_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "escalation_levels_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "escalation_levels_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "escalation_levels_hierarchy_id_fkey"
            columns: ["hierarchy_id"]
            isOneToOne: false
            referencedRelation: "escalation_hierarchies"
            referencedColumns: ["id"]
          },
        ]
      }
      export_logs: {
        Row: {
          created_at: string | null
          date_from: string | null
          date_to: string | null
          exported_by: string | null
          format: string | null
          id: string
          property_ids: string[] | null
          role: string | null
        }
        Insert: {
          created_at?: string | null
          date_from?: string | null
          date_to?: string | null
          exported_by?: string | null
          format?: string | null
          id?: string
          property_ids?: string[] | null
          role?: string | null
        }
        Update: {
          created_at?: string | null
          date_from?: string | null
          date_to?: string | null
          exported_by?: string | null
          format?: string | null
          id?: string
          property_ids?: string[] | null
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "export_logs_exported_by_fkey"
            columns: ["exported_by"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "export_logs_exported_by_fkey"
            columns: ["exported_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "export_logs_exported_by_fkey"
            columns: ["exported_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_usage_logs: {
        Row: {
          action: string
          created_at: string | null
          feature_name: string
          id: string
          metadata: Json | null
          organization_id: string
          property_id: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string | null
          feature_name: string
          id?: string
          metadata?: Json | null
          organization_id: string
          property_id?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string | null
          feature_name?: string
          id?: string
          metadata?: Json | null
          organization_id?: string
          property_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feature_usage_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_usage_logs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_usage_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "feature_usage_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "feature_usage_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      generators: {
        Row: {
          capacity_kva: number | null
          created_at: string | null
          effective_from_date: string | null
          fuel_efficiency_lphr: number | null
          id: string
          initial_diesel_level: number | null
          initial_kwh_reading: number | null
          initial_run_hours: number | null
          last_maintenance_date: string | null
          make: string | null
          name: string
          next_maintenance_date: string | null
          property_id: string
          status: string | null
          tank_capacity_litres: number | null
          updated_at: string | null
        }
        Insert: {
          capacity_kva?: number | null
          created_at?: string | null
          effective_from_date?: string | null
          fuel_efficiency_lphr?: number | null
          id?: string
          initial_diesel_level?: number | null
          initial_kwh_reading?: number | null
          initial_run_hours?: number | null
          last_maintenance_date?: string | null
          make?: string | null
          name: string
          next_maintenance_date?: string | null
          property_id: string
          status?: string | null
          tank_capacity_litres?: number | null
          updated_at?: string | null
        }
        Update: {
          capacity_kva?: number | null
          created_at?: string | null
          effective_from_date?: string | null
          fuel_efficiency_lphr?: number | null
          id?: string
          initial_diesel_level?: number | null
          initial_kwh_reading?: number | null
          initial_run_hours?: number | null
          last_maintenance_date?: string | null
          make?: string | null
          name?: string
          next_maintenance_date?: string | null
          property_id?: string
          status?: string | null
          tank_capacity_litres?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "generators_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      grid_tariffs: {
        Row: {
          created_at: string | null
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          property_id: string
          rate_per_unit: number
          unit_type: string | null
          utility_provider: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          effective_from: string
          effective_to?: string | null
          id?: string
          property_id: string
          rate_per_unit: number
          unit_type?: string | null
          utility_provider?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          property_id?: string
          rate_per_unit?: number
          unit_type?: string | null
          utility_provider?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grid_tariffs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "grid_tariffs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "grid_tariffs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grid_tariffs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_link_usage: {
        Row: {
          id: string
          invite_link_id: string
          metadata: Json | null
          used_at: string | null
          user_id: string | null
        }
        Insert: {
          id?: string
          invite_link_id: string
          metadata?: Json | null
          used_at?: string | null
          user_id?: string | null
        }
        Update: {
          id?: string
          invite_link_id?: string
          metadata?: Json | null
          used_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invite_link_usage_invite_link_id_fkey"
            columns: ["invite_link_id"]
            isOneToOne: false
            referencedRelation: "invite_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invite_link_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "invite_link_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "invite_link_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_links: {
        Row: {
          created_at: string | null
          created_by: string
          current_uses: number | null
          expires_at: string
          id: string
          invitation_code: string
          is_active: boolean | null
          max_uses: number | null
          metadata: Json | null
          organization_id: string
          property_id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          created_at?: string | null
          created_by: string
          current_uses?: number | null
          expires_at: string
          id?: string
          invitation_code: string
          is_active?: boolean | null
          max_uses?: number | null
          metadata?: Json | null
          organization_id: string
          property_id: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          created_at?: string | null
          created_by?: string
          current_uses?: number | null
          expires_at?: string
          id?: string
          invitation_code?: string
          is_active?: boolean | null
          max_uses?: number | null
          metadata?: Json | null
          organization_id?: string
          property_id?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "invite_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "invite_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "invite_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invite_links_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invite_links_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      issue_categories: {
        Row: {
          code: string
          created_at: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          priority: string | null
          property_id: string | null
          skill_group_id: string | null
          sla_hours: number | null
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          priority?: string | null
          property_id?: string | null
          skill_group_id?: string | null
          sla_hours?: number | null
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          priority?: string | null
          property_id?: string | null
          skill_group_id?: string | null
          sla_hours?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "issue_categories_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "issue_categories_skill_group_id_fkey"
            columns: ["skill_group_id"]
            isOneToOne: false
            referencedRelation: "skill_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      llm_health_metrics: {
        Row: {
          avg_latency_ms: number | null
          failure_count: number
          fallback_count: number
          id: string
          p95_latency_ms: number | null
          success_count: number
          timestamp: string
          window_minutes: number
        }
        Insert: {
          avg_latency_ms?: number | null
          failure_count?: number
          fallback_count?: number
          id?: string
          p95_latency_ms?: number | null
          success_count?: number
          timestamp?: string
          window_minutes?: number
        }
        Update: {
          avg_latency_ms?: number | null
          failure_count?: number
          fallback_count?: number
          id?: string
          p95_latency_ms?: number | null
          success_count?: number
          timestamp?: string
          window_minutes?: number
        }
        Relationships: []
      }
      maintenance_vendors: {
        Row: {
          bank_account_number: string | null
          bank_ifsc: string | null
          bank_name: string | null
          cancelled_cheque_url: string | null
          company_name: string
          contact_person: string
          created_at: string | null
          created_by: string | null
          email: string | null
          gst_doc_url: string | null
          gst_number: string | null
          id: string
          is_active: boolean | null
          kyc_rejection_reason: string | null
          kyc_status: string | null
          msme_doc_url: string | null
          msme_number: string | null
          organization_id: string
          pan_doc_url: string | null
          pan_number: string | null
          phone: string
          specialization: string[] | null
          updated_at: string | null
          user_id: string | null
          whatsapp_number: string | null
        }
        Insert: {
          bank_account_number?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          cancelled_cheque_url?: string | null
          company_name: string
          contact_person: string
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          gst_doc_url?: string | null
          gst_number?: string | null
          id?: string
          is_active?: boolean | null
          kyc_rejection_reason?: string | null
          kyc_status?: string | null
          msme_doc_url?: string | null
          msme_number?: string | null
          organization_id: string
          pan_doc_url?: string | null
          pan_number?: string | null
          phone: string
          specialization?: string[] | null
          updated_at?: string | null
          user_id?: string | null
          whatsapp_number?: string | null
        }
        Update: {
          bank_account_number?: string | null
          bank_ifsc?: string | null
          bank_name?: string | null
          cancelled_cheque_url?: string | null
          company_name?: string
          contact_person?: string
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          gst_doc_url?: string | null
          gst_number?: string | null
          id?: string
          is_active?: boolean | null
          kyc_rejection_reason?: string | null
          kyc_status?: string | null
          msme_doc_url?: string | null
          msme_number?: string | null
          organization_id?: string
          pan_doc_url?: string | null
          pan_number?: string | null
          phone?: string
          specialization?: string[] | null
          updated_at?: string | null
          user_id?: string | null
          whatsapp_number?: string | null
        }
        Relationships: []
      }
      material_request_items: {
        Row: {
          catalog_item_id: string | null
          created_at: string | null
          description: string | null
          id: string
          links: string[] | null
          name: string
          organization_id: string
          photo_url: string | null
          quantity: number
          request_id: string
          total_price: number
          unit_price: number
        }
        Insert: {
          catalog_item_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          links?: string[] | null
          name: string
          organization_id: string
          photo_url?: string | null
          quantity?: number
          request_id: string
          total_price?: number
          unit_price?: number
        }
        Update: {
          catalog_item_id?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          links?: string[] | null
          name?: string
          organization_id?: string
          photo_url?: string | null
          quantity?: number
          request_id?: string
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "material_request_items_catalog_item_id_fkey"
            columns: ["catalog_item_id"]
            isOneToOne: false
            referencedRelation: "procurement_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_request_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_request_items_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "material_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      material_requests: {
        Row: {
          approval_level: number | null
          approved_at: string | null
          approved_by: string | null
          assignee_uid: string | null
          budget_type: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          created_at: string | null
          delivered_at: string | null
          escalated_at: string | null
          escalated_by: string | null
          has_custom_items: boolean | null
          id: string
          items: Json
          ordered_at: string | null
          organization_id: string | null
          property_id: string
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          requested_by: string
          status: string
          target_approver_id: string | null
          target_approver_ids: string[] | null
          ticket_id: string
          total_amount: number | null
          updated_at: string | null
        }
        Insert: {
          approval_level?: number | null
          approved_at?: string | null
          approved_by?: string | null
          assignee_uid?: string | null
          budget_type?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          created_at?: string | null
          delivered_at?: string | null
          escalated_at?: string | null
          escalated_by?: string | null
          has_custom_items?: boolean | null
          id?: string
          items?: Json
          ordered_at?: string | null
          organization_id?: string | null
          property_id: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          requested_by: string
          status?: string
          target_approver_id?: string | null
          target_approver_ids?: string[] | null
          ticket_id: string
          total_amount?: number | null
          updated_at?: string | null
        }
        Update: {
          approval_level?: number | null
          approved_at?: string | null
          approved_by?: string | null
          assignee_uid?: string | null
          budget_type?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          created_at?: string | null
          delivered_at?: string | null
          escalated_at?: string | null
          escalated_by?: string | null
          has_custom_items?: boolean | null
          id?: string
          items?: Json
          ordered_at?: string | null
          organization_id?: string | null
          property_id?: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          requested_by?: string
          status?: string
          target_approver_id?: string | null
          target_approver_ids?: string[] | null
          ticket_id?: string
          total_amount?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "material_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "material_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "material_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_requests_assignee_uid_fkey"
            columns: ["assignee_uid"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "material_requests_assignee_uid_fkey"
            columns: ["assignee_uid"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "material_requests_assignee_uid_fkey"
            columns: ["assignee_uid"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_requests_escalated_by_fkey"
            columns: ["escalated_by"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "material_requests_escalated_by_fkey"
            columns: ["escalated_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "material_requests_escalated_by_fkey"
            columns: ["escalated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_requests_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_requests_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "material_requests_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "material_requests_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "material_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "material_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_requests_target_approver_id_fkey"
            columns: ["target_approver_id"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "material_requests_target_approver_id_fkey"
            columns: ["target_approver_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "material_requests_target_approver_id_fkey"
            columns: ["target_approver_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "material_requests_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_room_bookings: {
        Row: {
          booking_date: string
          company_id: string | null
          created_at: string | null
          end_time: string
          id: string
          meeting_room_id: string
          organization_id: string | null
          property_id: string
          start_time: string
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          booking_date: string
          company_id?: string | null
          created_at?: string | null
          end_time: string
          id?: string
          meeting_room_id: string
          organization_id?: string | null
          property_id: string
          start_time: string
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          booking_date?: string
          company_id?: string | null
          created_at?: string | null
          end_time?: string
          id?: string
          meeting_room_id?: string
          organization_id?: string | null
          property_id?: string
          start_time?: string
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_room_bookings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_room_bookings_meeting_room_id_fkey"
            columns: ["meeting_room_id"]
            isOneToOne: false
            referencedRelation: "meeting_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_room_bookings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_room_bookings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "meeting_room_bookings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "meeting_room_bookings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_room_credit_log: {
        Row: {
          action: string
          booking_id: string | null
          company_id: string | null
          created_at: string
          credit_id: string
          hours_after: number
          hours_changed: number
          id: string
          notes: string | null
          organization_id: string | null
          performed_by: string | null
          request_id: string | null
          user_id: string
        }
        Insert: {
          action: string
          booking_id?: string | null
          company_id?: string | null
          created_at?: string
          credit_id: string
          hours_after: number
          hours_changed: number
          id?: string
          notes?: string | null
          organization_id?: string | null
          performed_by?: string | null
          request_id?: string | null
          user_id: string
        }
        Update: {
          action?: string
          booking_id?: string | null
          company_id?: string | null
          created_at?: string
          credit_id?: string
          hours_after?: number
          hours_changed?: number
          id?: string
          notes?: string | null
          organization_id?: string | null
          performed_by?: string | null
          request_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_room_credit_log_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "meeting_room_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_room_credit_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_room_credit_log_credit_id_fkey"
            columns: ["credit_id"]
            isOneToOne: false
            referencedRelation: "meeting_room_credits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_room_credit_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_room_credit_log_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "meeting_room_credit_log_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "meeting_room_credit_log_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_room_credit_log_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "meeting_room_credit_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_room_credit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "meeting_room_credit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "meeting_room_credit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_room_credit_requests: {
        Row: {
          admin_note: string | null
          created_at: string
          id: string
          property_id: string
          reason: string | null
          requested_hours: number
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          admin_note?: string | null
          created_at?: string
          id?: string
          property_id: string
          reason?: string | null
          requested_hours?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          admin_note?: string | null
          created_at?: string
          id?: string
          property_id?: string
          reason?: string | null
          requested_hours?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meeting_room_credit_requests_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_room_credit_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "meeting_room_credit_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "meeting_room_credit_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_room_credit_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "meeting_room_credit_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "meeting_room_credit_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_room_credits: {
        Row: {
          assigned_by: string | null
          company_id: string | null
          created_at: string
          id: string
          last_reset_at: string
          monthly_hours: number
          next_reset_at: string
          organization_id: string | null
          property_id: string
          remaining_hours: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          assigned_by?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          last_reset_at?: string
          monthly_hours?: number
          next_reset_at?: string
          organization_id?: string | null
          property_id: string
          remaining_hours?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          assigned_by?: string | null
          company_id?: string | null
          created_at?: string
          id?: string
          last_reset_at?: string
          monthly_hours?: number
          next_reset_at?: string
          organization_id?: string | null
          property_id?: string
          remaining_hours?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meeting_room_credits_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "meeting_room_credits_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "meeting_room_credits_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_room_credits_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_room_credits_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_room_credits_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meeting_room_credits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "meeting_room_credits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "meeting_room_credits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      meeting_room_slots: {
        Row: {
          created_at: string | null
          end_time: string
          id: string
          start_time: string
        }
        Insert: {
          created_at?: string | null
          end_time: string
          id?: string
          start_time: string
        }
        Update: {
          created_at?: string | null
          end_time?: string
          id?: string
          start_time?: string
        }
        Relationships: []
      }
      meeting_rooms: {
        Row: {
          amenities: Json | null
          capacity: number
          created_at: string | null
          created_by: string
          deleted_at: string | null
          id: string
          location: string | null
          name: string
          photo_url: string | null
          property_id: string
          size: number | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          amenities?: Json | null
          capacity: number
          created_at?: string | null
          created_by: string
          deleted_at?: string | null
          id?: string
          location?: string | null
          name: string
          photo_url?: string | null
          property_id: string
          size?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          amenities?: Json | null
          capacity?: number
          created_at?: string | null
          created_by?: string
          deleted_at?: string | null
          id?: string
          location?: string | null
          name?: string
          photo_url?: string | null
          property_id?: string
          size?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          body: string
          created_at: string | null
          id: string
          metadata: Json | null
          room_id: string
          sender_id: string | null
        }
        Insert: {
          body: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          room_id: string
          sender_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string | null
          id?: string
          metadata?: Json | null
          room_id?: string
          sender_id?: string | null
        }
        Relationships: []
      }
      meter_multipliers: {
        Row: {
          created_at: string | null
          created_by: string | null
          ct_ratio_primary: number
          ct_ratio_secondary: number
          effective_from: string
          effective_to: string | null
          id: string
          meter_constant: number
          meter_id: string
          multiplier_value: number | null
          pt_ratio_primary: number
          pt_ratio_secondary: number
          reason: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          ct_ratio_primary?: number
          ct_ratio_secondary?: number
          effective_from: string
          effective_to?: string | null
          id?: string
          meter_constant?: number
          meter_id: string
          multiplier_value?: number | null
          pt_ratio_primary?: number
          pt_ratio_secondary?: number
          reason?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          ct_ratio_primary?: number
          ct_ratio_secondary?: number
          effective_from?: string
          effective_to?: string | null
          id?: string
          meter_constant?: number
          meter_id?: string
          multiplier_value?: number | null
          pt_ratio_primary?: number
          pt_ratio_secondary?: number
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meter_multipliers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "meter_multipliers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "meter_multipliers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meter_multipliers_meter_id_fkey"
            columns: ["meter_id"]
            isOneToOne: false
            referencedRelation: "electricity_meters"
            referencedColumns: ["id"]
          },
        ]
      }
      mst_achievements: {
        Row: {
          code: string
          color: string | null
          created_at: string | null
          criteria: Json
          description: string
          icon: string
          id: string
          is_active: boolean | null
          name: string
          points_bonus: number | null
          tier: string | null
        }
        Insert: {
          code: string
          color?: string | null
          created_at?: string | null
          criteria: Json
          description: string
          icon: string
          id?: string
          is_active?: boolean | null
          name: string
          points_bonus?: number | null
          tier?: string | null
        }
        Update: {
          code?: string
          color?: string | null
          created_at?: string | null
          criteria?: Json
          description?: string
          icon?: string
          id?: string
          is_active?: boolean | null
          name?: string
          points_bonus?: number | null
          tier?: string | null
        }
        Relationships: []
      }
      mst_daily_scores: {
        Row: {
          avg_resolution_minutes: number | null
          first_time_fixes: number | null
          last_activity_at: string | null
          property_id: string
          score_date: string
          sla_breached_count: number | null
          sla_met_count: number | null
          streak_days: number | null
          tickets_resolved: number | null
          total_points: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          avg_resolution_minutes?: number | null
          first_time_fixes?: number | null
          last_activity_at?: string | null
          property_id: string
          score_date?: string
          sla_breached_count?: number | null
          sla_met_count?: number | null
          streak_days?: number | null
          tickets_resolved?: number | null
          total_points?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          avg_resolution_minutes?: number | null
          first_time_fixes?: number | null
          last_activity_at?: string | null
          property_id?: string
          score_date?: string
          sla_breached_count?: number | null
          sla_met_count?: number | null
          streak_days?: number | null
          tickets_resolved?: number | null
          total_points?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mst_daily_scores_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mst_daily_scores_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "mst_daily_scores_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "mst_daily_scores_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      mst_point_transactions: {
        Row: {
          created_at: string | null
          event_type: string
          id: string
          metadata: Json | null
          points: number
          property_id: string
          source_ticket_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          event_type: string
          id?: string
          metadata?: Json | null
          points: number
          property_id: string
          source_ticket_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          points?: number
          property_id?: string
          source_ticket_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mst_point_transactions_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mst_point_transactions_source_ticket_id_fkey"
            columns: ["source_ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mst_point_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "mst_point_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "mst_point_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      mst_skills: {
        Row: {
          skill_code: string
          user_id: string
        }
        Insert: {
          skill_code: string
          user_id: string
        }
        Update: {
          skill_code?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mst_skills_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "mst_skills_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "mst_skills_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      mst_streaks: {
        Row: {
          current_streak: number | null
          last_active_date: string | null
          longest_streak: number | null
          property_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          current_streak?: number | null
          last_active_date?: string | null
          longest_streak?: number | null
          property_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          current_streak?: number | null
          last_active_date?: string | null
          longest_streak?: number | null
          property_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mst_streaks_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mst_streaks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "mst_streaks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "mst_streaks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      mst_user_badges: {
        Row: {
          achievement_id: string
          earned_at: string | null
          user_id: string
        }
        Insert: {
          achievement_id: string
          earned_at?: string | null
          user_id: string
        }
        Update: {
          achievement_id?: string
          earned_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mst_user_badges_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "mst_achievements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mst_user_badges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "mst_user_badges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "mst_user_badges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_delivery: {
        Row: {
          clicked_at: string | null
          delivered_at: string | null
          delivery_status: string | null
          id: string
          notification_id: string | null
          push_token: string | null
        }
        Insert: {
          clicked_at?: string | null
          delivered_at?: string | null
          delivery_status?: string | null
          id?: string
          notification_id?: string | null
          push_token?: string | null
        }
        Update: {
          clicked_at?: string | null
          delivered_at?: string | null
          delivery_status?: string | null
          id?: string
          notification_id?: string | null
          push_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_delivery_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          booking_id: string | null
          created_at: string | null
          deep_link: string
          id: string
          is_read: boolean | null
          message: string
          notification_type: string
          organization_id: string | null
          property_id: string
          ticket_id: string | null
          title: string
          user_id: string
          whatsapp_error: string | null
          whatsapp_sent_at: string | null
          whatsapp_status: string | null
        }
        Insert: {
          booking_id?: string | null
          created_at?: string | null
          deep_link: string
          id?: string
          is_read?: boolean | null
          message: string
          notification_type: string
          organization_id?: string | null
          property_id: string
          ticket_id?: string | null
          title: string
          user_id: string
          whatsapp_error?: string | null
          whatsapp_sent_at?: string | null
          whatsapp_status?: string | null
        }
        Update: {
          booking_id?: string | null
          created_at?: string | null
          deep_link?: string
          id?: string
          is_read?: boolean | null
          message?: string
          notification_type?: string
          organization_id?: string | null
          property_id?: string
          ticket_id?: string | null
          title?: string
          user_id?: string
          whatsapp_error?: string | null
          whatsapp_sent_at?: string | null
          whatsapp_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "meeting_room_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ocr_audit_logs: {
        Row: {
          created_at: string | null
          event_type: string
          id: string
          payload: Json | null
          property_id: string | null
          reading_id: string | null
        }
        Insert: {
          created_at?: string | null
          event_type: string
          id?: string
          payload?: Json | null
          property_id?: string | null
          reading_id?: string | null
        }
        Update: {
          created_at?: string | null
          event_type?: string
          id?: string
          payload?: Json | null
          property_id?: string | null
          reading_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ocr_audit_logs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocr_audit_logs_reading_id_fkey"
            columns: ["reading_id"]
            isOneToOne: false
            referencedRelation: "electricity_readings"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_memberships: {
        Row: {
          created_at: string | null
          is_active: boolean | null
          organization_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          is_active?: boolean | null
          organization_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          is_active?: boolean | null
          organization_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "organization_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "organization_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          available_modules: string[] | null
          code: string | null
          created_at: string | null
          deleted_at: string | null
          deletion_secret: string | null
          id: string
          is_deleted: boolean | null
          name: string
          status: string | null
          updated_at: string | null
        }
        Insert: {
          available_modules?: string[] | null
          code?: string | null
          created_at?: string | null
          deleted_at?: string | null
          deletion_secret?: string | null
          id?: string
          is_deleted?: boolean | null
          name: string
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          available_modules?: string[] | null
          code?: string | null
          created_at?: string | null
          deleted_at?: string | null
          deletion_secret?: string | null
          id?: string
          is_deleted?: boolean | null
          name?: string
          status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      payment_transactions: {
        Row: {
          amount: number
          commission_cycle_id: string | null
          created_at: string | null
          gateway: string | null
          gateway_ref: string | null
          id: string
          property_id: string
          status: string
          vendor_id: string
        }
        Insert: {
          amount: number
          commission_cycle_id?: string | null
          created_at?: string | null
          gateway?: string | null
          gateway_ref?: string | null
          id?: string
          property_id: string
          status: string
          vendor_id: string
        }
        Update: {
          amount?: number
          commission_cycle_id?: string | null
          created_at?: string | null
          gateway?: string | null
          gateway_ref?: string | null
          id?: string
          property_id?: string
          status?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_transactions_commission_cycle_id_fkey"
            columns: ["commission_cycle_id"]
            isOneToOne: false
            referencedRelation: "commission_cycles"
            referencedColumns: ["id"]
          },
        ]
      }
      ppm_audit_items: {
        Row: {
          attachment_url: string | null
          audit_report_id: string
          created_at: string | null
          has_completion_report: boolean
          id: string
          ppm_item_id: string
        }
        Insert: {
          attachment_url?: string | null
          audit_report_id: string
          created_at?: string | null
          has_completion_report?: boolean
          id?: string
          ppm_item_id: string
        }
        Update: {
          attachment_url?: string | null
          audit_report_id?: string
          created_at?: string | null
          has_completion_report?: boolean
          id?: string
          ppm_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ppm_audit_items_audit_report_id_fkey"
            columns: ["audit_report_id"]
            isOneToOne: false
            referencedRelation: "ppm_audit_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      ppm_audit_reports: {
        Row: {
          audit_month: string
          completed_tasks: number
          compliance_pct: number
          generated_at: string | null
          id: string
          organization_id: string
          pending_tasks: number
          property_id: string
          total_tasks: number
        }
        Insert: {
          audit_month: string
          completed_tasks?: number
          compliance_pct?: number
          generated_at?: string | null
          id?: string
          organization_id: string
          pending_tasks?: number
          property_id: string
          total_tasks?: number
        }
        Update: {
          audit_month?: string
          completed_tasks?: number
          compliance_pct?: number
          generated_at?: string | null
          id?: string
          organization_id?: string
          pending_tasks?: number
          property_id?: string
          total_tasks?: number
        }
        Relationships: []
      }
      ppm_schedules: {
        Row: {
          attachments: Json | null
          checker: string | null
          completion_doc_url: string | null
          completion_photos: string[] | null
          created_at: string
          detail_name: string | null
          done_date: string | null
          frequency: string | null
          id: string
          invoice_url: string | null
          location: string | null
          maker: string | null
          organization_id: string | null
          planned_date: string
          property_id: string | null
          rejection_reason: string | null
          remark: string | null
          scope_of_work: string | null
          si_no: string | null
          status: string
          system_name: string
          updated_at: string
          vendor_contact_person: string | null
          vendor_id: string | null
          vendor_name: string | null
          vendor_phone: string | null
          verification_status: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          attachments?: Json | null
          checker?: string | null
          completion_doc_url?: string | null
          completion_photos?: string[] | null
          created_at?: string
          detail_name?: string | null
          done_date?: string | null
          frequency?: string | null
          id?: string
          invoice_url?: string | null
          location?: string | null
          maker?: string | null
          organization_id?: string | null
          planned_date: string
          property_id?: string | null
          rejection_reason?: string | null
          remark?: string | null
          scope_of_work?: string | null
          si_no?: string | null
          status?: string
          system_name: string
          updated_at?: string
          vendor_contact_person?: string | null
          vendor_id?: string | null
          vendor_name?: string | null
          vendor_phone?: string | null
          verification_status?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          attachments?: Json | null
          checker?: string | null
          completion_doc_url?: string | null
          completion_photos?: string[] | null
          created_at?: string
          detail_name?: string | null
          done_date?: string | null
          frequency?: string | null
          id?: string
          invoice_url?: string | null
          location?: string | null
          maker?: string | null
          organization_id?: string | null
          planned_date?: string
          property_id?: string | null
          rejection_reason?: string | null
          remark?: string | null
          scope_of_work?: string | null
          si_no?: string | null
          status?: string
          system_name?: string
          updated_at?: string
          vendor_contact_person?: string | null
          vendor_id?: string | null
          vendor_name?: string | null
          vendor_phone?: string | null
          verification_status?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ppm_schedules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ppm_schedules_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ppm_schedules_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "maintenance_vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_activity_log: {
        Row: {
          action: string
          created_at: string | null
          id: string
          material_request_id: string | null
          metadata: Json | null
          new_value: string | null
          old_value: string | null
          procurement_order_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          material_request_id?: string | null
          metadata?: Json | null
          new_value?: string | null
          old_value?: string | null
          procurement_order_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          material_request_id?: string | null
          metadata?: Json | null
          new_value?: string | null
          old_value?: string | null
          procurement_order_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "procurement_activity_log_material_request_id_fkey"
            columns: ["material_request_id"]
            isOneToOne: false
            referencedRelation: "material_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_activity_log_procurement_order_id_fkey"
            columns: ["procurement_order_id"]
            isOneToOne: false
            referencedRelation: "procurement_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_activity_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "procurement_activity_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "procurement_activity_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_budgets: {
        Row: {
          budget_type: string
          created_at: string | null
          id: string
          organization_id: string
          period_end: string | null
          period_start: string
          property_id: string
          spent_amount: number
          total_amount: number
          updated_at: string | null
        }
        Insert: {
          budget_type: string
          created_at?: string | null
          id?: string
          organization_id: string
          period_end?: string | null
          period_start?: string
          property_id: string
          spent_amount?: number
          total_amount?: number
          updated_at?: string | null
        }
        Update: {
          budget_type?: string
          created_at?: string | null
          id?: string
          organization_id?: string
          period_end?: string | null
          period_start?: string
          property_id?: string
          spent_amount?: number
          total_amount?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "procurement_budgets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_budgets_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_catalog: {
        Row: {
          category: string | null
          created_at: string | null
          description: string | null
          estimated_price: number | null
          id: string
          is_active: boolean | null
          name: string
          organization_id: string
          photo_data: string | null
          photo_url: string | null
          stock_item_id: string | null
          unit: string | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          estimated_price?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          organization_id: string
          photo_data?: string | null
          photo_url?: string | null
          stock_item_id?: string | null
          unit?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          description?: string | null
          estimated_price?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          organization_id?: string
          photo_data?: string | null
          photo_url?: string | null
          stock_item_id?: string | null
          unit?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "procurement_catalog_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_catalog_stock_item_id_fkey"
            columns: ["stock_item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_orders: {
        Row: {
          actual_delivery: string | null
          created_at: string | null
          delivery_status: string | null
          expected_delivery: string | null
          id: string
          invoice_number: string | null
          invoice_url: string | null
          items: Json
          material_request_id: string
          notes: string | null
          ordered_by: string
          organization_id: string
          payment_status: string | null
          property_id: string
          total_amount: number | null
          updated_at: string | null
          vendor_contact: string | null
          vendor_name: string | null
        }
        Insert: {
          actual_delivery?: string | null
          created_at?: string | null
          delivery_status?: string | null
          expected_delivery?: string | null
          id?: string
          invoice_number?: string | null
          invoice_url?: string | null
          items?: Json
          material_request_id: string
          notes?: string | null
          ordered_by: string
          organization_id: string
          payment_status?: string | null
          property_id: string
          total_amount?: number | null
          updated_at?: string | null
          vendor_contact?: string | null
          vendor_name?: string | null
        }
        Update: {
          actual_delivery?: string | null
          created_at?: string | null
          delivery_status?: string | null
          expected_delivery?: string | null
          id?: string
          invoice_number?: string | null
          invoice_url?: string | null
          items?: Json
          material_request_id?: string
          notes?: string | null
          ordered_by?: string
          organization_id?: string
          payment_status?: string | null
          property_id?: string
          total_amount?: number | null
          updated_at?: string | null
          vendor_contact?: string | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "procurement_orders_material_request_id_fkey"
            columns: ["material_request_id"]
            isOneToOne: false
            referencedRelation: "material_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_orders_ordered_by_fkey"
            columns: ["ordered_by"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "procurement_orders_ordered_by_fkey"
            columns: ["ordered_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "procurement_orders_ordered_by_fkey"
            columns: ["ordered_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_orders_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_price_visibility: {
        Row: {
          created_at: string | null
          id: string
          organization_id: string
          property_id: string | null
          roles: string[] | null
          updated_at: string | null
          users: string[] | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          organization_id: string
          property_id?: string | null
          roles?: string[] | null
          updated_at?: string | null
          users?: string[] | null
        }
        Update: {
          created_at?: string | null
          id?: string
          organization_id?: string
          property_id?: string | null
          roles?: string[] | null
          updated_at?: string | null
          users?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "procurement_price_visibility_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_price_visibility_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      procurement_settings: {
        Row: {
          created_at: string | null
          high_approver_id: string | null
          low_approver_id: string | null
          organization_id: string
          price_visibility_roles: string[] | null
          property_id: string
          threshold_amount: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          high_approver_id?: string | null
          low_approver_id?: string | null
          organization_id: string
          price_visibility_roles?: string[] | null
          property_id: string
          threshold_amount?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          high_approver_id?: string | null
          low_approver_id?: string | null
          organization_id?: string
          price_visibility_roles?: string[] | null
          property_id?: string
          threshold_amount?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "procurement_settings_high_approver_id_fkey"
            columns: ["high_approver_id"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "procurement_settings_high_approver_id_fkey"
            columns: ["high_approver_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "procurement_settings_high_approver_id_fkey"
            columns: ["high_approver_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_settings_low_approver_id_fkey"
            columns: ["low_approver_id"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "procurement_settings_low_approver_id_fkey"
            columns: ["low_approver_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "procurement_settings_low_approver_id_fkey"
            columns: ["low_approver_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procurement_settings_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          address: string | null
          capacity: number | null
          city: string | null
          code: string
          created_at: string | null
          id: string
          image_url: string | null
          is_active: boolean | null
          name: string
          organization_id: string | null
          status: string | null
        }
        Insert: {
          address?: string | null
          capacity?: number | null
          city?: string | null
          code: string
          created_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name: string
          organization_id?: string | null
          status?: string | null
        }
        Update: {
          address?: string | null
          capacity?: number | null
          city?: string | null
          code?: string
          created_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean | null
          name?: string
          organization_id?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "properties_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      property_activities: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          organization_id: string
          property_id: string
          status: string | null
          type: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          organization_id: string
          property_id: string
          status?: string | null
          type?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          organization_id?: string
          property_id?: string
          status?: string | null
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_activities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "property_activities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "property_activities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      property_audit_submissions: {
        Row: {
          audit_period_year: string | null
          created_at: string | null
          id: string
          master_item_id: string
          organization_id: string
          proof_url: string | null
          property_id: string
          remark: string | null
          status: string | null
          submitted_at: string | null
          submitted_by: string | null
          updated_at: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          audit_period_year?: string | null
          created_at?: string | null
          id?: string
          master_item_id: string
          organization_id: string
          proof_url?: string | null
          property_id: string
          remark?: string | null
          status?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          audit_period_year?: string | null
          created_at?: string | null
          id?: string
          master_item_id?: string
          organization_id?: string
          proof_url?: string | null
          property_id?: string
          remark?: string | null
          status?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          updated_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_audit_submissions_master_item_id_fkey"
            columns: ["master_item_id"]
            isOneToOne: false
            referencedRelation: "audit_master_items"
            referencedColumns: ["id"]
          },
        ]
      }
      property_features: {
        Row: {
          created_at: string | null
          feature_key: string
          id: string
          is_enabled: boolean | null
          property_id: string
          settings: Json | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          feature_key: string
          id?: string
          is_enabled?: boolean | null
          property_id: string
          settings?: Json | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          feature_key?: string
          id?: string
          is_enabled?: boolean | null
          property_id?: string
          settings?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_features_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      property_memberships: {
        Row: {
          created_at: string | null
          is_active: boolean | null
          organization_id: string | null
          property_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          is_active?: boolean | null
          organization_id?: string | null
          property_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          is_active?: boolean | null
          organization_id?: string | null
          property_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_memberships_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "property_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "property_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "property_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          browser: string | null
          created_at: string | null
          device_info: string | null
          id: string
          is_active: boolean | null
          property_id: string | null
          token: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          browser?: string | null
          created_at?: string | null
          device_info?: string | null
          id?: string
          is_active?: boolean | null
          property_id?: string | null
          token: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          browser?: string | null
          created_at?: string | null
          device_info?: string | null
          id?: string
          is_active?: boolean | null
          property_id?: string | null
          token?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      resolver_stats: {
        Row: {
          avg_resolution_minutes: number | null
          created_at: string | null
          current_floor: number | null
          id: string
          is_available: boolean | null
          is_checked_in: boolean | null
          last_assigned_at: string | null
          last_ticket_at: string | null
          property_id: string
          skill_group_id: string | null
          total_resolved: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          avg_resolution_minutes?: number | null
          created_at?: string | null
          current_floor?: number | null
          id?: string
          is_available?: boolean | null
          is_checked_in?: boolean | null
          last_assigned_at?: string | null
          last_ticket_at?: string | null
          property_id: string
          skill_group_id?: string | null
          total_resolved?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          avg_resolution_minutes?: number | null
          created_at?: string | null
          current_floor?: number | null
          id?: string
          is_available?: boolean | null
          is_checked_in?: boolean | null
          last_assigned_at?: string | null
          last_ticket_at?: string | null
          property_id?: string
          skill_group_id?: string | null
          total_resolved?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resolver_stats_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resolver_stats_skill_group_id_fkey"
            columns: ["skill_group_id"]
            isOneToOne: false
            referencedRelation: "skill_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resolver_stats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "resolver_stats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "resolver_stats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_logs: {
        Row: {
          check_in_at: string | null
          check_out_at: string | null
          created_at: string | null
          id: string
          property_id: string
          status: string | null
          user_id: string
        }
        Insert: {
          check_in_at?: string | null
          check_out_at?: string | null
          created_at?: string | null
          id?: string
          property_id: string
          status?: string | null
          user_id: string
        }
        Update: {
          check_in_at?: string | null
          check_out_at?: string | null
          created_at?: string | null
          id?: string
          property_id?: string
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_logs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shift_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "shift_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "shift_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      skill_groups: {
        Row: {
          code: string
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_manual_assign: boolean | null
          name: string
          property_id: string | null
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_manual_assign?: boolean | null
          name: string
          property_id?: string | null
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_manual_assign?: boolean | null
          name?: string
          property_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "skill_groups_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_templates: {
        Row: {
          category_code: string
          created_at: string | null
          id: string
          is_active: boolean | null
          organization_id: string | null
          priority: string | null
          property_id: string | null
          resolution_sla_hours: number | null
          response_sla_hours: number | null
          updated_at: string | null
        }
        Insert: {
          category_code: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          organization_id?: string | null
          priority?: string | null
          property_id?: string | null
          resolution_sla_hours?: number | null
          response_sla_hours?: number | null
          updated_at?: string | null
        }
        Update: {
          category_code?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          organization_id?: string | null
          priority?: string | null
          property_id?: string | null
          resolution_sla_hours?: number | null
          response_sla_hours?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sla_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_templates_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      snag_imports: {
        Row: {
          completed_at: string | null
          created_at: string | null
          error_rows: number | null
          filename: string
          id: string
          imported_by: string
          organization_id: string
          property_id: string
          status: string | null
          total_rows: number
          valid_rows: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          error_rows?: number | null
          filename: string
          id?: string
          imported_by: string
          organization_id: string
          property_id: string
          status?: string | null
          total_rows: number
          valid_rows: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          error_rows?: number | null
          filename?: string
          id?: string
          imported_by?: string
          organization_id?: string
          property_id?: string
          status?: string | null
          total_rows?: number
          valid_rows?: number
        }
        Relationships: [
          {
            foreignKeyName: "snag_imports_imported_by_fkey"
            columns: ["imported_by"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "snag_imports_imported_by_fkey"
            columns: ["imported_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "snag_imports_imported_by_fkey"
            columns: ["imported_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "snag_imports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "snag_imports_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      sop_checklist_items: {
        Row: {
          created_at: string | null
          description: string | null
          end_time: string | null
          id: string
          is_mandatory: boolean | null
          is_optional: boolean | null
          order_index: number
          requires_comment: boolean | null
          requires_photo: boolean | null
          start_time: string | null
          template_id: string
          title: string
          type: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          end_time?: string | null
          id?: string
          is_mandatory?: boolean | null
          is_optional?: boolean | null
          order_index?: number
          requires_comment?: boolean | null
          requires_photo?: boolean | null
          start_time?: string | null
          template_id: string
          title: string
          type?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          end_time?: string | null
          id?: string
          is_mandatory?: boolean | null
          is_optional?: boolean | null
          order_index?: number
          requires_comment?: boolean | null
          requires_photo?: boolean | null
          start_time?: string | null
          template_id?: string
          title?: string
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sop_checklist_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "sop_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      sop_completion_items: {
        Row: {
          checked_at: string | null
          checked_by: string | null
          checklist_item_id: string
          comment: string | null
          completion_id: string
          id: string
          is_checked: boolean | null
          photo_url: string | null
          satisfaction_at: string | null
          satisfaction_by: string | null
          satisfaction_rating: number | null
          updated_at: string | null
          value: string | null
          video_url: string | null
        }
        Insert: {
          checked_at?: string | null
          checked_by?: string | null
          checklist_item_id: string
          comment?: string | null
          completion_id: string
          id?: string
          is_checked?: boolean | null
          photo_url?: string | null
          satisfaction_at?: string | null
          satisfaction_by?: string | null
          satisfaction_rating?: number | null
          updated_at?: string | null
          value?: string | null
          video_url?: string | null
        }
        Update: {
          checked_at?: string | null
          checked_by?: string | null
          checklist_item_id?: string
          comment?: string | null
          completion_id?: string
          id?: string
          is_checked?: boolean | null
          photo_url?: string | null
          satisfaction_at?: string | null
          satisfaction_by?: string | null
          satisfaction_rating?: number | null
          updated_at?: string | null
          value?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sop_completion_items_checked_by_fkey"
            columns: ["checked_by"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "sop_completion_items_checked_by_fkey"
            columns: ["checked_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "sop_completion_items_checked_by_fkey"
            columns: ["checked_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sop_completion_items_checklist_item_id_fkey"
            columns: ["checklist_item_id"]
            isOneToOne: false
            referencedRelation: "sop_checklist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sop_completion_items_completion_id_fkey"
            columns: ["completion_id"]
            isOneToOne: false
            referencedRelation: "sop_completions"
            referencedColumns: ["id"]
          },
        ]
      }
      sop_completions: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          completion_date: string
          created_at: string | null
          due_at: string | null
          id: string
          is_late: boolean | null
          notes: string | null
          organization_id: string
          property_id: string
          slot_time: string | null
          status: string
          template_id: string
          updated_at: string | null
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          completion_date?: string
          created_at?: string | null
          due_at?: string | null
          id?: string
          is_late?: boolean | null
          notes?: string | null
          organization_id: string
          property_id: string
          slot_time?: string | null
          status?: string
          template_id: string
          updated_at?: string | null
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          completion_date?: string
          created_at?: string | null
          due_at?: string | null
          id?: string
          is_late?: boolean | null
          notes?: string | null
          organization_id?: string
          property_id?: string
          slot_time?: string | null
          status?: string
          template_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sop_completions_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "sop_completions_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "sop_completions_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sop_completions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sop_completions_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sop_completions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "sop_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      sop_templates: {
        Row: {
          assigned_to: string[]
          category: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          end_time: string | null
          frequency: string
          id: string
          is_active: boolean | null
          is_running: boolean
          organization_id: string
          property_id: string
          start_time: string | null
          started_at: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string[]
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          frequency?: string
          id?: string
          is_active?: boolean | null
          is_running?: boolean
          organization_id: string
          property_id: string
          start_time?: string | null
          started_at?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string[]
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          frequency?: string
          id?: string
          is_active?: boolean | null
          is_running?: boolean
          organization_id?: string
          property_id?: string
          start_time?: string | null
          started_at?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sop_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "sop_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "sop_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sop_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sop_templates_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_items: {
        Row: {
          barcode: string | null
          barcode_format: string | null
          barcode_generated_at: string | null
          category: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          item_code: string
          location: string | null
          min_threshold: number | null
          name: string
          organization_id: string
          per_unit_cost: number | null
          property_id: string
          qr_code_data: Json | null
          quantity: number
          unit: string | null
          updated_at: string | null
        }
        Insert: {
          barcode?: string | null
          barcode_format?: string | null
          barcode_generated_at?: string | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          item_code: string
          location?: string | null
          min_threshold?: number | null
          name: string
          organization_id: string
          per_unit_cost?: number | null
          property_id: string
          qr_code_data?: Json | null
          quantity?: number
          unit?: string | null
          updated_at?: string | null
        }
        Update: {
          barcode?: string | null
          barcode_format?: string | null
          barcode_generated_at?: string | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          item_code?: string
          location?: string | null
          min_threshold?: number | null
          name?: string
          organization_id?: string
          per_unit_cost?: number | null
          property_id?: string
          qr_code_data?: Json | null
          quantity?: number
          unit?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "stock_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "stock_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_items_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          action: string
          created_at: string | null
          id: string
          item_id: string
          notes: string | null
          organization_id: string
          property_id: string
          quantity_after: number
          quantity_before: number
          quantity_change: number
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          item_id: string
          notes?: string | null
          organization_id: string
          property_id: string
          quantity_after: number
          quantity_before: number
          quantity_change: number
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          item_id?: string
          notes?: string | null
          organization_id?: string
          property_id?: string
          quantity_after?: number
          quantity_before?: number
          quantity_change?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "stock_movements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "stock_movements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_reports: {
        Row: {
          generated_at: string | null
          generated_by: string | null
          id: string
          low_stock_count: number
          organization_id: string
          property_id: string
          report_data: Json | null
          report_date: string
          total_added: number
          total_items: number
          total_removed: number
        }
        Insert: {
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          low_stock_count?: number
          organization_id: string
          property_id: string
          report_data?: Json | null
          report_date: string
          total_added?: number
          total_items?: number
          total_removed?: number
        }
        Update: {
          generated_at?: string | null
          generated_by?: string | null
          id?: string
          low_stock_count?: number
          organization_id?: string
          property_id?: string
          report_data?: Json | null
          report_date?: string
          total_added?: number
          total_items?: number
          total_removed?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_reports_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "stock_reports_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "stock_reports_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_reports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_reports_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      super_tenant_properties: {
        Row: {
          assigned_by: string | null
          created_at: string | null
          id: string
          organization_id: string
          property_id: string
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string | null
          id?: string
          organization_id: string
          property_id: string
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string | null
          id?: string
          organization_id?: string
          property_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "super_tenant_properties_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "super_tenant_properties_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "super_tenant_properties_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "super_tenant_properties_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "super_tenant_properties_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "super_tenant_properties_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "super_tenant_properties_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "super_tenant_properties_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_activity_log: {
        Row: {
          action: string
          created_at: string | null
          id: string
          new_value: string | null
          old_value: string | null
          ticket_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          ticket_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          new_value?: string | null
          old_value?: string | null
          ticket_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_activity_log_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_activity_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "ticket_activity_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "ticket_activity_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_classification_logs: {
        Row: {
          completion_tokens: number | null
          created_at: string | null
          decision_source: string
          entropy: number | null
          final_bucket: string
          id: string
          llm_bucket: string | null
          llm_confidence: number | null
          llm_latency_ms: number | null
          llm_reason: string | null
          llm_risk_flag: string | null
          llm_secondary_bucket: string | null
          llm_used: boolean
          prompt_tokens: number | null
          rule_margin: number
          rule_scores: Json
          rule_top_bucket: string
          ticket_id: string
          total_tokens: number | null
          zone: string
        }
        Insert: {
          completion_tokens?: number | null
          created_at?: string | null
          decision_source?: string
          entropy?: number | null
          final_bucket: string
          id?: string
          llm_bucket?: string | null
          llm_confidence?: number | null
          llm_latency_ms?: number | null
          llm_reason?: string | null
          llm_risk_flag?: string | null
          llm_secondary_bucket?: string | null
          llm_used?: boolean
          prompt_tokens?: number | null
          rule_margin?: number
          rule_scores?: Json
          rule_top_bucket: string
          ticket_id: string
          total_tokens?: number | null
          zone?: string
        }
        Update: {
          completion_tokens?: number | null
          created_at?: string | null
          decision_source?: string
          entropy?: number | null
          final_bucket?: string
          id?: string
          llm_bucket?: string | null
          llm_confidence?: number | null
          llm_latency_ms?: number | null
          llm_reason?: string | null
          llm_risk_flag?: string | null
          llm_secondary_bucket?: string | null
          llm_used?: boolean
          prompt_tokens?: number | null
          rule_margin?: number
          rule_scores?: Json
          rule_top_bucket?: string
          ticket_id?: string
          total_tokens?: number | null
          zone?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_classification_logs_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_comments: {
        Row: {
          comment: string
          created_at: string | null
          id: string
          is_internal: boolean | null
          metadata: Json | null
          ticket_id: string
          user_id: string
        }
        Insert: {
          comment: string
          created_at?: string | null
          id?: string
          is_internal?: boolean | null
          metadata?: Json | null
          ticket_id: string
          user_id: string
        }
        Update: {
          comment?: string
          created_at?: string | null
          id?: string
          is_internal?: boolean | null
          metadata?: Json | null
          ticket_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_comments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "ticket_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "ticket_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_counters: {
        Row: {
          last_number: number | null
          property_id: string
        }
        Insert: {
          last_number?: number | null
          property_id: string
        }
        Update: {
          last_number?: number | null
          property_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_counters_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_escalation_logs: {
        Row: {
          escalated_at: string | null
          from_employee_id: string | null
          from_level: number | null
          hierarchy_id: string | null
          id: string
          reason: string | null
          ticket_id: string
          to_employee_id: string | null
          to_level: number | null
        }
        Insert: {
          escalated_at?: string | null
          from_employee_id?: string | null
          from_level?: number | null
          hierarchy_id?: string | null
          id?: string
          reason?: string | null
          ticket_id: string
          to_employee_id?: string | null
          to_level?: number | null
        }
        Update: {
          escalated_at?: string | null
          from_employee_id?: string | null
          from_level?: number | null
          hierarchy_id?: string | null
          id?: string
          reason?: string | null
          ticket_id?: string
          to_employee_id?: string | null
          to_level?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_escalation_logs_from_employee_id_fkey"
            columns: ["from_employee_id"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "ticket_escalation_logs_from_employee_id_fkey"
            columns: ["from_employee_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "ticket_escalation_logs_from_employee_id_fkey"
            columns: ["from_employee_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_escalation_logs_hierarchy_id_fkey"
            columns: ["hierarchy_id"]
            isOneToOne: false
            referencedRelation: "escalation_hierarchies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_escalation_logs_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_escalation_logs_to_employee_id_fkey"
            columns: ["to_employee_id"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "ticket_escalation_logs_to_employee_id_fkey"
            columns: ["to_employee_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "ticket_escalation_logs_to_employee_id_fkey"
            columns: ["to_employee_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_sequences: {
        Row: {
          last_number: number
          property_id: string
          updated_at: string
        }
        Insert: {
          last_number?: number
          property_id: string
          updated_at?: string
        }
        Update: {
          last_number?: number
          property_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_sequences_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          accepted_at: string | null
          assigned_at: string | null
          assigned_to: string | null
          assigned_to_name: string | null
          category: string | null
          category_id: string | null
          classification_override: boolean | null
          classification_source: string | null
          confidence: string | null
          confidence_score: number | null
          created_at: string | null
          current_escalation_level: number | null
          department: Database["public"]["Enums"]["ticket_department"] | null
          description: string
          escalation_last_action_at: string | null
          escalation_paused: boolean | null
          floor_number: number | null
          hierarchy_id: string | null
          id: string
          import_batch_id: string | null
          internal: boolean
          is_internal: boolean | null
          is_vague: boolean | null
          issue_code: string | null
          llm_reasoning: string | null
          location: string | null
          organization_id: string
          original_skill_group_id: string | null
          override_at: string | null
          override_by: string | null
          photo_after_url: string | null
          photo_before_url: string | null
          priority: string | null
          property_id: string | null
          raised_by: string
          raised_by_name: string | null
          rating: number | null
          resolution_notes: string | null
          resolution_sla_hours: number | null
          resolved_at: string | null
          response_sla_hours: number | null
          risk_flag: string | null
          secondary_category_code: string | null
          skill_group_code: string | null
          skill_group_id: string | null
          sla_breached: boolean | null
          sla_deadline: string | null
          sla_hours: number | null
          sla_pause_reason: string | null
          sla_paused: boolean | null
          sla_paused_at: string | null
          sla_started: boolean | null
          status: string | null
          ticket_number: string | null
          title: string
          total_paused_minutes: number | null
          updated_at: string | null
          validated_at: string | null
          validated_by: string | null
          validation_note: string | null
          validation_status: string | null
          video_after_url: string | null
          video_before_url: string | null
          wa_message_id: string | null
          work_pause_reason: string | null
          work_paused: boolean | null
          work_paused_at: string | null
          work_paused_by: string | null
          work_started_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          assigned_at?: string | null
          assigned_to?: string | null
          assigned_to_name?: string | null
          category?: string | null
          category_id?: string | null
          classification_override?: boolean | null
          classification_source?: string | null
          confidence?: string | null
          confidence_score?: number | null
          created_at?: string | null
          current_escalation_level?: number | null
          department?: Database["public"]["Enums"]["ticket_department"] | null
          description: string
          escalation_last_action_at?: string | null
          escalation_paused?: boolean | null
          floor_number?: number | null
          hierarchy_id?: string | null
          id?: string
          import_batch_id?: string | null
          internal?: boolean
          is_internal?: boolean | null
          is_vague?: boolean | null
          issue_code?: string | null
          llm_reasoning?: string | null
          location?: string | null
          organization_id: string
          original_skill_group_id?: string | null
          override_at?: string | null
          override_by?: string | null
          photo_after_url?: string | null
          photo_before_url?: string | null
          priority?: string | null
          property_id?: string | null
          raised_by: string
          raised_by_name?: string | null
          rating?: number | null
          resolution_notes?: string | null
          resolution_sla_hours?: number | null
          resolved_at?: string | null
          response_sla_hours?: number | null
          risk_flag?: string | null
          secondary_category_code?: string | null
          skill_group_code?: string | null
          skill_group_id?: string | null
          sla_breached?: boolean | null
          sla_deadline?: string | null
          sla_hours?: number | null
          sla_pause_reason?: string | null
          sla_paused?: boolean | null
          sla_paused_at?: string | null
          sla_started?: boolean | null
          status?: string | null
          ticket_number?: string | null
          title: string
          total_paused_minutes?: number | null
          updated_at?: string | null
          validated_at?: string | null
          validated_by?: string | null
          validation_note?: string | null
          validation_status?: string | null
          video_after_url?: string | null
          video_before_url?: string | null
          wa_message_id?: string | null
          work_pause_reason?: string | null
          work_paused?: boolean | null
          work_paused_at?: string | null
          work_paused_by?: string | null
          work_started_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          assigned_at?: string | null
          assigned_to?: string | null
          assigned_to_name?: string | null
          category?: string | null
          category_id?: string | null
          classification_override?: boolean | null
          classification_source?: string | null
          confidence?: string | null
          confidence_score?: number | null
          created_at?: string | null
          current_escalation_level?: number | null
          department?: Database["public"]["Enums"]["ticket_department"] | null
          description?: string
          escalation_last_action_at?: string | null
          escalation_paused?: boolean | null
          floor_number?: number | null
          hierarchy_id?: string | null
          id?: string
          import_batch_id?: string | null
          internal?: boolean
          is_internal?: boolean | null
          is_vague?: boolean | null
          issue_code?: string | null
          llm_reasoning?: string | null
          location?: string | null
          organization_id?: string
          original_skill_group_id?: string | null
          override_at?: string | null
          override_by?: string | null
          photo_after_url?: string | null
          photo_before_url?: string | null
          priority?: string | null
          property_id?: string | null
          raised_by?: string
          raised_by_name?: string | null
          rating?: number | null
          resolution_notes?: string | null
          resolution_sla_hours?: number | null
          resolved_at?: string | null
          response_sla_hours?: number | null
          risk_flag?: string | null
          secondary_category_code?: string | null
          skill_group_code?: string | null
          skill_group_id?: string | null
          sla_breached?: boolean | null
          sla_deadline?: string | null
          sla_hours?: number | null
          sla_pause_reason?: string | null
          sla_paused?: boolean | null
          sla_paused_at?: string | null
          sla_started?: boolean | null
          status?: string | null
          ticket_number?: string | null
          title?: string
          total_paused_minutes?: number | null
          updated_at?: string | null
          validated_at?: string | null
          validated_by?: string | null
          validation_note?: string | null
          validation_status?: string | null
          video_after_url?: string | null
          video_before_url?: string | null
          wa_message_id?: string | null
          work_pause_reason?: string | null
          work_paused?: boolean | null
          work_paused_at?: string | null
          work_paused_by?: string | null
          work_started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "tickets_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "issue_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_hierarchy_id_fkey"
            columns: ["hierarchy_id"]
            isOneToOne: false
            referencedRelation: "escalation_hierarchies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_override_by_fkey"
            columns: ["override_by"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "tickets_override_by_fkey"
            columns: ["override_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "tickets_override_by_fkey"
            columns: ["override_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_raised_by_fkey"
            columns: ["raised_by"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "tickets_raised_by_fkey"
            columns: ["raised_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "tickets_raised_by_fkey"
            columns: ["raised_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_skill_group_id_fkey"
            columns: ["skill_group_id"]
            isOneToOne: false
            referencedRelation: "skill_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_validated_by_fkey"
            columns: ["validated_by"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "tickets_validated_by_fkey"
            columns: ["validated_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "tickets_validated_by_fkey"
            columns: ["validated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_work_paused_by_fkey"
            columns: ["work_paused_by"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "tickets_work_paused_by_fkey"
            columns: ["work_paused_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "tickets_work_paused_by_fkey"
            columns: ["work_paused_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_achievements: {
        Row: {
          achievement_id: string
          earned_at: string | null
          id: string
          property_id: string
          user_id: string
        }
        Insert: {
          achievement_id: string
          earned_at?: string | null
          id?: string
          property_id: string
          user_id: string
        }
        Update: {
          achievement_id?: string
          earned_at?: string | null
          id?: string
          property_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "mst_achievements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_achievements_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_achievements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_achievements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "user_achievements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          organization_id: string | null
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          organization_id?: string | null
          role: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          organization_id?: string | null
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      user_sessions: {
        Row: {
          created_at: string | null
          duration_seconds: number | null
          id: string
          ip_address: string | null
          last_activity: string
          session_end: string | null
          session_start: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          duration_seconds?: number | null
          id?: string
          ip_address?: string | null
          last_activity?: string
          session_end?: string | null
          session_start?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          duration_seconds?: number | null
          id?: string
          ip_address?: string | null
          last_activity?: string
          session_end?: string | null
          session_start?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          email: string
          first_login: string | null
          full_name: string | null
          id: string
          is_master_admin: boolean | null
          last_activity: string | null
          last_seen_at: string | null
          metadata: Json | null
          onboarding_completed: boolean | null
          online_status: string | null
          phone: string | null
          team: string | null
          user_photo_url: string | null
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          email: string
          first_login?: string | null
          full_name?: string | null
          id: string
          is_master_admin?: boolean | null
          last_activity?: string | null
          last_seen_at?: string | null
          metadata?: Json | null
          onboarding_completed?: boolean | null
          online_status?: string | null
          phone?: string | null
          team?: string | null
          user_photo_url?: string | null
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          email?: string
          first_login?: string | null
          full_name?: string | null
          id?: string
          is_master_admin?: boolean | null
          last_activity?: string | null
          last_seen_at?: string | null
          metadata?: Json | null
          onboarding_completed?: boolean | null
          online_status?: string | null
          phone?: string | null
          team?: string | null
          user_photo_url?: string | null
        }
        Relationships: []
      }
      vendor_daily_revenue: {
        Row: {
          created_at: string | null
          entry_date: string | null
          id: string
          organization_id: string
          property_id: string
          revenue_amount: number
          revenue_date: string
          updated_at: string | null
          vendor_id: string
        }
        Insert: {
          created_at?: string | null
          entry_date?: string | null
          id?: string
          organization_id: string
          property_id: string
          revenue_amount: number
          revenue_date: string
          updated_at?: string | null
          vendor_id: string
        }
        Update: {
          created_at?: string | null
          entry_date?: string | null
          id?: string
          organization_id?: string
          property_id?: string
          revenue_amount?: number
          revenue_date?: string
          updated_at?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_daily_revenue_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_daily_revenue_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_daily_revenue_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_payments: {
        Row: {
          amount: number
          created_at: string | null
          cycle_id: string
          gateway_name: string | null
          gateway_txn_id: string | null
          id: string
          organization_id: string
          receipt_url: string | null
          status: string | null
          updated_at: string | null
          vendor_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          cycle_id: string
          gateway_name?: string | null
          gateway_txn_id?: string | null
          id?: string
          organization_id: string
          receipt_url?: string | null
          status?: string | null
          updated_at?: string | null
          vendor_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          cycle_id?: string
          gateway_name?: string | null
          gateway_txn_id?: string | null
          id?: string
          organization_id?: string
          receipt_url?: string | null
          status?: string | null
          updated_at?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_payments_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "commission_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_payments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_payments_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_property_assignments: {
        Row: {
          created_at: string | null
          id: string
          property_id: string
          vendor_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          property_id: string
          vendor_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          property_id?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_property_assignments_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_property_assignments_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "maintenance_vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          commission_rate: number
          created_at: string | null
          id: string
          organization_id: string
          payment_enabled: boolean | null
          payment_gateway_enabled: boolean | null
          property_id: string
          shop_name: string
          status: string | null
          updated_at: string | null
          user_id: string
          vendor_name: string
        }
        Insert: {
          commission_rate: number
          created_at?: string | null
          id?: string
          organization_id: string
          payment_enabled?: boolean | null
          payment_gateway_enabled?: boolean | null
          property_id: string
          shop_name: string
          status?: string | null
          updated_at?: string | null
          user_id: string
          vendor_name: string
        }
        Update: {
          commission_rate?: number
          created_at?: string | null
          id?: string
          organization_id?: string
          payment_enabled?: boolean | null
          payment_gateway_enabled?: boolean | null
          property_id?: string
          shop_name?: string
          status?: string | null
          updated_at?: string | null
          user_id?: string
          vendor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendors_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendors_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "vendors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "vendors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      visitor_id_counters: {
        Row: {
          last_number: number | null
          property_id: string
        }
        Insert: {
          last_number?: number | null
          property_id: string
        }
        Update: {
          last_number?: number | null
          property_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visitor_id_counters_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: true
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      visitor_logs: {
        Row: {
          category: string
          checkin_time: string | null
          checkout_time: string | null
          coming_from: string | null
          created_at: string | null
          id: string
          mobile: string | null
          name: string
          organization_id: string
          photo_url: string | null
          property_id: string
          purpose: string | null
          status: string | null
          visitor_id: string
          whom_to_meet: string
        }
        Insert: {
          category: string
          checkin_time?: string | null
          checkout_time?: string | null
          coming_from?: string | null
          created_at?: string | null
          id?: string
          mobile?: string | null
          name: string
          organization_id: string
          photo_url?: string | null
          property_id: string
          purpose?: string | null
          status?: string | null
          visitor_id: string
          whom_to_meet: string
        }
        Update: {
          category?: string
          checkin_time?: string | null
          checkout_time?: string | null
          coming_from?: string | null
          created_at?: string | null
          id?: string
          mobile?: string | null
          name?: string
          organization_id?: string
          photo_url?: string | null
          property_id?: string
          purpose?: string | null
          status?: string | null
          visitor_id?: string
          whom_to_meet?: string
        }
        Relationships: [
          {
            foreignKeyName: "visitor_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visitor_logs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      vms_tickets: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          organization_id: string
          property_id: string
          reported_by: string | null
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          organization_id: string
          property_id: string
          reported_by?: string | null
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          organization_id?: string
          property_id?: string
          reported_by?: string | null
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vms_tickets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vms_tickets_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vms_tickets_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "vms_tickets_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "vms_tickets_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_queue: {
        Row: {
          created_at: string
          error: string | null
          event_type: string
          id: string
          media_type: string | null
          media_url: string | null
          message: string
          phone: string
          retry_count: number
          sent_at: string | null
          status: string
          ticket_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          error?: string | null
          event_type: string
          id?: string
          media_type?: string | null
          media_url?: string | null
          message: string
          phone: string
          retry_count?: number
          sent_at?: string | null
          status?: string
          ticket_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          error?: string | null
          event_type?: string
          id?: string
          media_type?: string | null
          media_url?: string | null
          message?: string
          phone?: string
          retry_count?: number
          sent_at?: string | null
          status?: string
          ticket_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_queue_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_queue_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "mst_workload"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "whatsapp_queue_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_engagement_metrics"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "whatsapp_queue_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_sessions: {
        Row: {
          expires_at: string
          pending_is_image: boolean | null
          pending_is_video: boolean | null
          pending_media_key: string | null
          pending_media_url: string | null
          pending_text: string | null
          pending_video_key: string | null
          pending_video_url: string | null
          phone: string
          property_options: Json | null
          state: string
          user_id: string
        }
        Insert: {
          expires_at: string
          pending_is_image?: boolean | null
          pending_is_video?: boolean | null
          pending_media_key?: string | null
          pending_media_url?: string | null
          pending_text?: string | null
          pending_video_key?: string | null
          pending_video_url?: string | null
          phone: string
          property_options?: Json | null
          state?: string
          user_id: string
        }
        Update: {
          expires_at?: string
          pending_is_image?: boolean | null
          pending_is_video?: boolean | null
          pending_media_key?: string | null
          pending_media_url?: string | null
          pending_text?: string | null
          pending_video_key?: string | null
          pending_video_url?: string | null
          phone?: string
          property_options?: Json | null
          state?: string
          user_id?: string
        }
        Relationships: []
      }
      zoho_po_audit_log: {
        Row: {
          ai_model_used: string
          completed_at: string | null
          confidence_score: number | null
          created_at: string | null
          created_by: string
          error_message: string | null
          extraction_confidence: number | null
          id: string
          invoice_amount: number | null
          invoice_date: string | null
          invoice_file_url: string | null
          invoice_filename: string
          invoice_number: string | null
          is_new_vendor: boolean | null
          organization_id: string
          parsed_invoice_data: Json | null
          po_amount: number | null
          po_id: string | null
          po_number: string | null
          po_status: string | null
          processing_time_ms: number | null
          property_id: string | null
          retry_count: number | null
          updated_at: string | null
          user_context: Json | null
          vendor_id: string | null
          vendor_name: string | null
          zoho_response: Json | null
        }
        Insert: {
          ai_model_used: string
          completed_at?: string | null
          confidence_score?: number | null
          created_at?: string | null
          created_by: string
          error_message?: string | null
          extraction_confidence?: number | null
          id?: string
          invoice_amount?: number | null
          invoice_date?: string | null
          invoice_file_url?: string | null
          invoice_filename: string
          invoice_number?: string | null
          is_new_vendor?: boolean | null
          organization_id: string
          parsed_invoice_data?: Json | null
          po_amount?: number | null
          po_id?: string | null
          po_number?: string | null
          po_status?: string | null
          processing_time_ms?: number | null
          property_id?: string | null
          retry_count?: number | null
          updated_at?: string | null
          user_context?: Json | null
          vendor_id?: string | null
          vendor_name?: string | null
          zoho_response?: Json | null
        }
        Update: {
          ai_model_used?: string
          completed_at?: string | null
          confidence_score?: number | null
          created_at?: string | null
          created_by?: string
          error_message?: string | null
          extraction_confidence?: number | null
          id?: string
          invoice_amount?: number | null
          invoice_date?: string | null
          invoice_file_url?: string | null
          invoice_filename?: string
          invoice_number?: string | null
          is_new_vendor?: boolean | null
          organization_id?: string
          parsed_invoice_data?: Json | null
          po_amount?: number | null
          po_id?: string | null
          po_number?: string | null
          po_status?: string | null
          processing_time_ms?: number | null
          property_id?: string | null
          retry_count?: number | null
          updated_at?: string | null
          user_context?: Json | null
          vendor_id?: string | null
          vendor_name?: string | null
          zoho_response?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "zoho_po_audit_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zoho_po_audit_log_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      zoho_po_entity_master: {
        Row: {
          billing_address: Json
          created_at: string | null
          entity_name: string
          gstin: string
          id: string
          is_active: boolean | null
          legal_entity_name: string | null
          organization_id: string
          shipping_address: Json | null
          state_code: string
          state_name: string
          updated_at: string | null
          zoho_organization_id: string | null
        }
        Insert: {
          billing_address: Json
          created_at?: string | null
          entity_name: string
          gstin: string
          id?: string
          is_active?: boolean | null
          legal_entity_name?: string | null
          organization_id: string
          shipping_address?: Json | null
          state_code: string
          state_name: string
          updated_at?: string | null
          zoho_organization_id?: string | null
        }
        Update: {
          billing_address?: Json
          created_at?: string | null
          entity_name?: string
          gstin?: string
          id?: string
          is_active?: boolean | null
          legal_entity_name?: string | null
          organization_id?: string
          shipping_address?: Json | null
          state_code?: string
          state_name?: string
          updated_at?: string | null
          zoho_organization_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "zoho_po_entity_master_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      zoho_po_settings: {
        Row: {
          ai_model_name: string | null
          ai_model_provider: string | null
          auto_retry_enabled: boolean | null
          created_at: string | null
          id: string
          is_enabled: boolean | null
          max_retry_count: number | null
          organization_id: string
          po_approval_threshold: number | null
          require_approval: boolean | null
          updated_at: string | null
          zoho_access_token: string | null
          zoho_organization_id: string | null
          zoho_refresh_token: string | null
          zoho_token_expires_at: string | null
        }
        Insert: {
          ai_model_name?: string | null
          ai_model_provider?: string | null
          auto_retry_enabled?: boolean | null
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          max_retry_count?: number | null
          organization_id: string
          po_approval_threshold?: number | null
          require_approval?: boolean | null
          updated_at?: string | null
          zoho_access_token?: string | null
          zoho_organization_id?: string | null
          zoho_refresh_token?: string | null
          zoho_token_expires_at?: string | null
        }
        Update: {
          ai_model_name?: string | null
          ai_model_provider?: string | null
          auto_retry_enabled?: boolean | null
          created_at?: string | null
          id?: string
          is_enabled?: boolean | null
          max_retry_count?: number | null
          organization_id?: string
          po_approval_threshold?: number | null
          require_approval?: boolean | null
          updated_at?: string | null
          zoho_access_token?: string | null
          zoho_organization_id?: string | null
          zoho_refresh_token?: string | null
          zoho_token_expires_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "zoho_po_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      zoho_po_tokens: {
        Row: {
          access_token: string
          created_at: string | null
          expires_at: string
          id: string
          organization_id: string
          refresh_token: string
          updated_at: string | null
        }
        Insert: {
          access_token: string
          created_at?: string | null
          expires_at: string
          id?: string
          organization_id: string
          refresh_token: string
          updated_at?: string | null
        }
        Update: {
          access_token?: string
          created_at?: string | null
          expires_at?: string
          id?: string
          organization_id?: string
          refresh_token?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "zoho_po_tokens_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      zoho_po_vendor_cache: {
        Row: {
          bank_details: Json | null
          billing_address: Json | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string | null
          gstin: string | null
          id: string
          is_active: boolean | null
          is_empanelled: boolean | null
          last_synced_at: string | null
          legal_name: string | null
          organization_id: string
          pan: string | null
          payment_terms: string | null
          updated_at: string | null
          vendor_name: string
          zoho_vendor_id: string
        }
        Insert: {
          bank_details?: Json | null
          billing_address?: Json | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string | null
          gstin?: string | null
          id?: string
          is_active?: boolean | null
          is_empanelled?: boolean | null
          last_synced_at?: string | null
          legal_name?: string | null
          organization_id: string
          pan?: string | null
          payment_terms?: string | null
          updated_at?: string | null
          vendor_name: string
          zoho_vendor_id: string
        }
        Update: {
          bank_details?: Json | null
          billing_address?: Json | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string | null
          gstin?: string | null
          id?: string
          is_active?: boolean | null
          is_empanelled?: boolean | null
          last_synced_at?: string | null
          legal_name?: string | null
          organization_id?: string
          pan?: string | null
          payment_terms?: string | null
          updated_at?: string | null
          vendor_name?: string
          zoho_vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "zoho_po_vendor_cache_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      feature_usage_summary: {
        Row: {
          feature_name: string | null
          last_used: string | null
          organization_id: string | null
          unique_users: number | null
          usage_count: number | null
          usage_date: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feature_usage_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      module_usage_summary: {
        Row: {
          active_users: number | null
          last_used: string | null
          module_name: string | null
          organization_id: string | null
          total_uses: number | null
        }
        Relationships: [
          {
            foreignKeyName: "feature_usage_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      mst_workload: {
        Row: {
          active_tickets: number | null
          completed_this_week: number | null
          full_name: string | null
          is_available: boolean | null
          paused_tickets: number | null
          property_id: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "property_memberships_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      user_engagement_metrics: {
        Row: {
          avg_duration_seconds: number | null
          email: string | null
          engagement_level: string | null
          full_name: string | null
          last_active: string | null
          sessions_this_week: number | null
          total_sessions: number | null
          user_id: string | null
        }
        Relationships: []
      }
      user_status_summary: {
        Row: {
          count: number | null
          organization_id: string | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      check_is_master_admin_safe: { Args: never; Returns: boolean }
      classify_ticket_department: {
        Args: { description: string }
        Returns: Database["public"]["Enums"]["ticket_department"]
      }
      close_stale_sessions: { Args: never; Returns: number }
      current_auth_uid: { Args: never; Returns: string }
      execute_ai_select: { Args: { sql_query: string }; Returns: Json }
      execute_readonly_sql: { Args: { sql_text: string }; Returns: Json }
      execute_sql: { Args: { query_text: string }; Returns: Json }
      find_best_resolver:
        | {
            Args: {
              p_floor_number?: number
              p_property_id: string
              p_skill_group_code: string
            }
            Returns: string
          }
        | {
            Args: { p_property_id: string; p_skill_group_id: string }
            Returns: string
          }
        | {
            Args: {
              p_floor_number?: number
              p_property_id: string
              p_skill_group_id: string
            }
            Returns: string
          }
      find_least_loaded_resolver: {
        Args: { p_property_id: string; p_skill_group_id: string }
        Returns: string
      }
      generate_invite_code: { Args: never; Returns: string }
      generate_property_code: { Args: { p_org_id: string }; Returns: string }
      generate_sop_completions: {
        Args: { p_target_date: string }
        Returns: undefined
      }
      generate_ticket_number: {
        Args: { p_property_id: string }
        Returns: string
      }
      generate_visitor_id: { Args: { p_property_id: string }; Returns: string }
      get_active_dg_tariff: {
        Args: { p_date?: string; p_generator_id: string }
        Returns: {
          cost_per_litre: number
          effective_from: string
          id: string
        }[]
      }
      get_active_grid_tariff: {
        Args: { p_date?: string; p_property_id: string }
        Returns: {
          effective_from: string
          id: string
          rate_per_unit: number
          utility_provider: string
        }[]
      }
      get_active_multiplier: {
        Args: { p_date?: string; p_meter_id: string }
        Returns: {
          ct_ratio_primary: number
          ct_ratio_secondary: number
          effective_from: string
          id: string
          meter_constant: number
          multiplier_value: number
          pt_ratio_primary: number
          pt_ratio_secondary: number
        }[]
      }
      get_attention_items: {
        Args: { p_limit?: number; p_property_id: string }
        Returns: {
          action_label: string
          created_at: string
          description: string
          entity_id: string
          entity_type: string
          id: string
          severity: string
          title: string
          type: string
        }[]
      }
      get_mobile_dashboard_stats: {
        Args: { period?: string; prop_id: string }
        Returns: Json
      }
      get_my_org_ids: { Args: never; Returns: string[] }
      get_org_metrics: { Args: { p_org_id: string }; Returns: Json }
      get_org_storage_usage: {
        Args: { p_org_id: string }
        Returns: {
          property_id: string
          property_name: string
          storage_bytes: number
        }[]
      }
      get_property_health_score: {
        Args: { p_property_id: string }
        Returns: Json
      }
      get_recent_activity: {
        Args: { p_limit?: number; p_property_id: string }
        Returns: {
          action_type: string
          actor_name: string
          actor_role: string
          created_at: string
          entity_title: string
          entity_type: string
          id: string
        }[]
      }
      get_request_user_email: { Args: never; Returns: string }
      get_ticket_created_recipients: {
        Args: {
          p_creator_id: string
          p_organization_id: string
          p_property_id: string
        }
        Returns: {
          role: string
          user_id: string
        }[]
      }
      get_ticket_funnel: {
        Args: { p_days?: number; p_property_id: string }
        Returns: {
          avg_hours: number
          status_label: string
          ticket_count: number
        }[]
      }
      is_master_admin: { Args: never; Returns: boolean }
      is_master_admin_v2: { Args: never; Returns: boolean }
      is_org_admin: { Args: { org_id: string }; Returns: boolean }
      is_org_admin_safe: { Args: { org_id: string }; Returns: boolean }
      is_org_admin_safe_v2: { Args: { org_id: string }; Returns: boolean }
      is_org_admin_v2: { Args: { p_org_id: string }; Returns: boolean }
      is_org_member_v2: { Args: { p_org_id: string }; Returns: boolean }
      is_org_super_admin: { Args: { target_user_id: string }; Returns: boolean }
      is_property_member_v2: { Args: { p_prop_id: string }; Returns: boolean }
      log_feature_usage: {
        Args: {
          p_action: string
          p_feature_name: string
          p_metadata?: Json
          p_organization_id: string
          p_property_id: string
        }
        Returns: undefined
      }
      match_vendor_name_to_id: {
        Args: { p_company_name: string; p_org_id: string; p_vendor_id: string }
        Returns: undefined
      }
      refresh_feature_usage_summary: { Args: never; Returns: undefined }
      update_missed_sop_completions: { Args: never; Returns: undefined }
      update_mst_streak: {
        Args: { p_property_id: string; p_user_id: string }
        Returns: undefined
      }
      update_procurement_budget_spent: {
        Args: { p_amount: number; p_budget_type: string; p_property_id: string }
        Returns: undefined
      }
      use_invite_link: { Args: { p_code: string }; Returns: Json }
      user_is_member_of_org: {
        Args: { check_org_id: string; check_user_id: string }
        Returns: boolean
      }
      user_is_org_admin: {
        Args: { check_org_id: string; check_user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "master_admin"
        | "org_super_admin"
        | "property_admin"
        | "staff"
        | "tenant"
        | "food_vendor"
        | "mst"
        | "security"
        | "vendor"
        | "soft_service_staff"
        | "soft_service_supervisor"
        | "soft_service_manager"
        | "super_tenant"
        | "maintenance_vendor"
        | "procurement"
      ticket_department: "technical" | "soft_services" | "vendor"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "master_admin",
        "org_super_admin",
        "property_admin",
        "staff",
        "tenant",
        "food_vendor",
        "mst",
        "security",
        "vendor",
        "soft_service_staff",
        "soft_service_supervisor",
        "soft_service_manager",
        "super_tenant",
        "maintenance_vendor",
        "procurement",
      ],
      ticket_department: ["technical", "soft_services", "vendor"],
    },
  },
} as const
