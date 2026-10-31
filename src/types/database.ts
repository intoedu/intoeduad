
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "access_tokens": {
                  Row: {
                    "created_at": string,"created_by": string | null,"expires_at": string,"id": string,"lead_id": string | null,"purpose": string,"registration_id": string | null,"revoked_at": string | null,"token_hash": string,"used_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"expires_at": string,"id"?: string,"lead_id"?: string | null,"purpose": string,"registration_id"?: string | null,"revoked_at"?: string | null,"token_hash": string,"used_at"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"expires_at"?: string,"id"?: string,"lead_id"?: string | null,"purpose"?: string,"registration_id"?: string | null,"revoked_at"?: string | null,"token_hash"?: string,"used_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "access_tokens_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "staff_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "access_tokens_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "access_tokens_registration_id_fkey"
      columns: ["registration_id"]
isOneToOne: false
      referencedRelation: "registrations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "access_tokens_registration_id_fkey"
      columns: ["registration_id"]
isOneToOne: false
      referencedRelation: "v_registration_board"
      referencedColumns: ["id"]
    }
                  ]
                },"activity_logs": {
                  Row: {
                    "action": string,"actor_id": string | null,"after": Json | null,"before": Json | null,"changed_fields": (string)[] | null,"created_at": string,"entity_id": string | null,"entity_type": string,"id": number
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"after"?: Json | null,"before"?: Json | null,"changed_fields"?: (string)[] | null,"created_at"?: string,"entity_id"?: string | null,"entity_type": string,"id"?: never
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"after"?: Json | null,"before"?: Json | null,"changed_fields"?: (string)[] | null,"created_at"?: string,"entity_id"?: string | null,"entity_type"?: string,"id"?: never
                  }
                  Relationships: [
                    
                  ]
                },"consent_documents": {
                  Row: {
                    "body": string,"created_at": string,"created_by": string | null,"id": string,"kind": string,"title": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"kind": string,"title": string,"version": number
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"created_by"?: string | null,"id"?: string,"kind"?: string,"title"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "consent_documents_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "staff_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"consent_records": {
                  Row: {
                    "agreed": boolean,"agreed_at": string | null,"created_at": string,"document_version": number,"id": string,"kind": string,"lead_id": string | null,"registration_id": string | null,"rendered_text": string,"withdrawn_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "agreed": boolean,"agreed_at"?: string | null,"created_at"?: string,"document_version": number,"id"?: string,"kind": string,"lead_id"?: string | null,"registration_id"?: string | null,"rendered_text": string,"withdrawn_at"?: string | null
                  }
                  Update: {
                    "agreed"?: boolean,"agreed_at"?: string | null,"created_at"?: string,"document_version"?: number,"id"?: string,"kind"?: string,"lead_id"?: string | null,"registration_id"?: string | null,"rendered_text"?: string,"withdrawn_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "consent_records_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "consent_records_registration_id_fkey"
      columns: ["registration_id"]
isOneToOne: false
      referencedRelation: "registrations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "consent_records_registration_id_fkey"
      columns: ["registration_id"]
isOneToOne: false
      referencedRelation: "v_registration_board"
      referencedColumns: ["id"]
    }
                  ]
                },"consultation_slots": {
                  Row: {
                    "booked_count": number,"capacity": number,"created_at": string,"ends_at": string,"id": string,"is_open": boolean,"starts_at": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "booked_count"?: number,"capacity"?: number,"created_at"?: string,"ends_at": string,"id"?: string,"is_open"?: boolean,"starts_at": string,"updated_at"?: string
                  }
                  Update: {
                    "booked_count"?: number,"capacity"?: number,"created_at"?: string,"ends_at"?: string,"id"?: string,"is_open"?: boolean,"starts_at"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"consultations": {
                  Row: {
                    "created_at": string,"decided_at": string | null,"decided_by": string | null,"id": string,"lead_id": string,"meeting_url": string | null,"method": string,"notes": string | null,"scheduled_at": string | null,"slot_id": string | null,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"id"?: string,"lead_id": string,"meeting_url"?: string | null,"method"?: string,"notes"?: string | null,"scheduled_at"?: string | null,"slot_id"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"decided_at"?: string | null,"decided_by"?: string | null,"id"?: string,"lead_id"?: string,"meeting_url"?: string | null,"method"?: string,"notes"?: string | null,"scheduled_at"?: string | null,"slot_id"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "consultations_decided_by_fkey"
      columns: ["decided_by"]
isOneToOne: false
      referencedRelation: "staff_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "consultations_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "consultations_slot_id_fkey"
      columns: ["slot_id"]
isOneToOne: false
      referencedRelation: "consultation_slots"
      referencedColumns: ["id"]
    }
                  ]
                },"destruction_requests": {
                  Row: {
                    "approved_at": string | null,"approved_by": string | null,"created_at": string,"destroyed_items": Json | null,"due_date": string,"error": string | null,"executed_at": string | null,"held_at": string | null,"held_by": string | null,"hold_reason": string | null,"id": string,"lead_id": string | null,"program_id": string | null,"registration_id": string | null,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"created_at"?: string,"destroyed_items"?: Json | null,"due_date": string,"error"?: string | null,"executed_at"?: string | null,"held_at"?: string | null,"held_by"?: string | null,"hold_reason"?: string | null,"id"?: string,"lead_id"?: string | null,"program_id"?: string | null,"registration_id"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"created_at"?: string,"destroyed_items"?: Json | null,"due_date"?: string,"error"?: string | null,"executed_at"?: string | null,"held_at"?: string | null,"held_by"?: string | null,"hold_reason"?: string | null,"id"?: string,"lead_id"?: string | null,"program_id"?: string | null,"registration_id"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "destruction_requests_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "staff_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "destruction_requests_held_by_fkey"
      columns: ["held_by"]
isOneToOne: false
      referencedRelation: "staff_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "destruction_requests_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: true
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "destruction_requests_program_id_fkey"
      columns: ["program_id"]
isOneToOne: false
      referencedRelation: "programs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "destruction_requests_registration_id_fkey"
      columns: ["registration_id"]
isOneToOne: true
      referencedRelation: "registrations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "destruction_requests_registration_id_fkey"
      columns: ["registration_id"]
isOneToOne: true
      referencedRelation: "v_registration_board"
      referencedColumns: ["id"]
    }
                  ]
                },"important_events": {
                  Row: {
                    "category": string,"created_at": string,"date": string,"deleted_at": string | null,"done_at": string | null,"id": string,"is_system": boolean,"memo": string | null,"owner_id": string | null,"priority": string,"program_id": string | null,"show_dday": boolean,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category"?: string,"created_at"?: string,"date": string,"deleted_at"?: string | null,"done_at"?: string | null,"id"?: string,"is_system"?: boolean,"memo"?: string | null,"owner_id"?: string | null,"priority"?: string,"program_id"?: string | null,"show_dday"?: boolean,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "category"?: string,"created_at"?: string,"date"?: string,"deleted_at"?: string | null,"done_at"?: string | null,"id"?: string,"is_system"?: boolean,"memo"?: string | null,"owner_id"?: string | null,"priority"?: string,"program_id"?: string | null,"show_dday"?: boolean,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "important_events_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "staff_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "important_events_program_id_fkey"
      columns: ["program_id"]
isOneToOne: false
      referencedRelation: "programs"
      referencedColumns: ["id"]
    }
                  ]
                },"lead_program_interests": {
                  Row: {
                    "lead_id": string,"program_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "lead_id": string,"program_id": string
                  }
                  Update: {
                    "lead_id"?: string,"program_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "lead_program_interests_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "lead_program_interests_program_id_fkey"
      columns: ["program_id"]
isOneToOne: false
      referencedRelation: "programs"
      referencedColumns: ["id"]
    }
                  ]
                },"leads": {
                  Row: {
                    "assigned_to": string | null,"attribution_confirmed_at": string | null,"attribution_confirmed_by": string | null,"attribution_source": string | null,"created_at": string,"deleted_at": string | null,"destroy_due_date": string | null,"destroyed_at": string | null,"id": string,"interests": (string)[],"message": string | null,"parent_name": string | null,"parent_phone": string | null,"partner_contact_id": string | null,"partner_id": string | null,"relation": string | null,"source_other": string | null,"status": string,"student_grade": string | null,"student_name": string | null,"topics": (string)[],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "assigned_to"?: string | null,"attribution_confirmed_at"?: string | null,"attribution_confirmed_by"?: string | null,"attribution_source"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"destroy_due_date"?: string | null,"destroyed_at"?: string | null,"id"?: string,"interests"?: (string)[],"message"?: string | null,"parent_name"?: string | null,"parent_phone"?: string | null,"partner_contact_id"?: string | null,"partner_id"?: string | null,"relation"?: string | null,"source_other"?: string | null,"status"?: string,"student_grade"?: string | null,"student_name"?: string | null,"topics"?: (string)[],"updated_at"?: string
                  }
                  Update: {
                    "assigned_to"?: string | null,"attribution_confirmed_at"?: string | null,"attribution_confirmed_by"?: string | null,"attribution_source"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"destroy_due_date"?: string | null,"destroyed_at"?: string | null,"id"?: string,"interests"?: (string)[],"message"?: string | null,"parent_name"?: string | null,"parent_phone"?: string | null,"partner_contact_id"?: string | null,"partner_id"?: string | null,"relation"?: string | null,"source_other"?: string | null,"status"?: string,"student_grade"?: string | null,"student_name"?: string | null,"topics"?: (string)[],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "leads_assigned_to_fkey"
      columns: ["assigned_to"]
isOneToOne: false
      referencedRelation: "staff_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leads_attribution_confirmed_by_fkey"
      columns: ["attribution_confirmed_by"]
isOneToOne: false
      referencedRelation: "staff_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leads_partner_contact_id_fkey"
      columns: ["partner_contact_id"]
isOneToOne: false
      referencedRelation: "partner_contacts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "leads_partner_id_fkey"
      columns: ["partner_id"]
isOneToOne: false
      referencedRelation: "partners"
      referencedColumns: ["id"]
    }
                  ]
                },"message_logs": {
                  Row: {
                    "channel": string,"created_at": string,"error": string | null,"id": string,"provider_message_id": string | null,"purpose": string,"related_id": string | null,"related_type": string | null,"sent_at": string | null,"status": string,"template_code": string | null,"to_hash": string | null,"to_masked": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "channel": string,"created_at"?: string,"error"?: string | null,"id"?: string,"provider_message_id"?: string | null,"purpose": string,"related_id"?: string | null,"related_type"?: string | null,"sent_at"?: string | null,"status": string,"template_code"?: string | null,"to_hash"?: string | null,"to_masked"?: string | null
                  }
                  Update: {
                    "channel"?: string,"created_at"?: string,"error"?: string | null,"id"?: string,"provider_message_id"?: string | null,"purpose"?: string,"related_id"?: string | null,"related_type"?: string | null,"sent_at"?: string | null,"status"?: string,"template_code"?: string | null,"to_hash"?: string | null,"to_masked"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"notes": {
                  Row: {
                    "author_id": string,"body": string,"created_at": string,"deleted_at": string | null,"entity_id": string,"entity_type": string,"id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id": string,"body": string,"created_at"?: string,"deleted_at"?: string | null,"entity_id": string,"entity_type": string,"id"?: string,"updated_at"?: string
                  }
                  Update: {
                    "author_id"?: string,"body"?: string,"created_at"?: string,"deleted_at"?: string | null,"entity_id"?: string,"entity_type"?: string,"id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notes_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "staff_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"partner_agreements": {
                  Row: {
                    "agreement_type": string,"auto_renew": boolean,"contact_id": string | null,"created_at": string,"end_date": string,"exclusive_region": string | null,"form": string,"id": string,"memo": string | null,"partner_id": string,"signed_on": string | null,"start_date": string,"terminated_on": string | null,"termination_notified_on": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "agreement_type"?: string,"auto_renew"?: boolean,"contact_id"?: string | null,"created_at"?: string,"end_date": string,"exclusive_region"?: string | null,"form"?: string,"id"?: string,"memo"?: string | null,"partner_id": string,"signed_on"?: string | null,"start_date": string,"terminated_on"?: string | null,"termination_notified_on"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "agreement_type"?: string,"auto_renew"?: boolean,"contact_id"?: string | null,"created_at"?: string,"end_date"?: string,"exclusive_region"?: string | null,"form"?: string,"id"?: string,"memo"?: string | null,"partner_id"?: string,"signed_on"?: string | null,"start_date"?: string,"terminated_on"?: string | null,"termination_notified_on"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "partner_agreements_contact_id_fkey"
      columns: ["contact_id"]
isOneToOne: false
      referencedRelation: "partner_contacts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "partner_agreements_partner_id_fkey"
      columns: ["partner_id"]
isOneToOne: false
      referencedRelation: "partners"
      referencedColumns: ["id"]
    }
                  ]
                },"partner_contacts": {
                  Row: {
                    "active": boolean,"code": string,"code_locked": boolean,"created_at": string,"email": string | null,"id": string,"memo": string | null,"name": string,"partner_id": string,"phone": string | null,"role": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"code": string,"code_locked"?: boolean,"created_at"?: string,"email"?: string | null,"id"?: string,"memo"?: string | null,"name": string,"partner_id": string,"phone"?: string | null,"role"?: string,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"code"?: string,"code_locked"?: boolean,"created_at"?: string,"email"?: string | null,"id"?: string,"memo"?: string | null,"name"?: string,"partner_id"?: string,"phone"?: string | null,"role"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "partner_contacts_partner_id_fkey"
      columns: ["partner_id"]
isOneToOne: false
      referencedRelation: "partners"
      referencedColumns: ["id"]
    }
                  ]
                },"partners": {
                  Row: {
                    "active": boolean,"address": string | null,"business_registration_no": string | null,"code": string,"code_locked": boolean,"created_at": string,"deleted_at": string | null,"director_name": string | null,"email": string | null,"id": string,"memo": string | null,"name": string,"phone": string | null,"referred_by_partner_id": string | null,"region": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"address"?: string | null,"business_registration_no"?: string | null,"code": string,"code_locked"?: boolean,"created_at"?: string,"deleted_at"?: string | null,"director_name"?: string | null,"email"?: string | null,"id"?: string,"memo"?: string | null,"name": string,"phone"?: string | null,"referred_by_partner_id"?: string | null,"region"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"address"?: string | null,"business_registration_no"?: string | null,"code"?: string,"code_locked"?: boolean,"created_at"?: string,"deleted_at"?: string | null,"director_name"?: string | null,"email"?: string | null,"id"?: string,"memo"?: string | null,"name"?: string,"phone"?: string | null,"referred_by_partner_id"?: string | null,"region"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "partners_referred_by_partner_id_fkey"
      columns: ["referred_by_partner_id"]
isOneToOne: false
      referencedRelation: "partners"
      referencedColumns: ["id"]
    }
                  ]
                },"passport_access_logs": {
                  Row: {
                    "action": string,"actor_id": string | null,"actor_name": string | null,"created_at": string,"id": number,"ip": unknown,"passport_file_id": string,"registration_id": string,"user_agent": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"actor_name"?: string | null,"created_at"?: string,"id"?: never,"ip"?: unknown,"passport_file_id": string,"registration_id": string,"user_agent"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"actor_name"?: string | null,"created_at"?: string,"id"?: never,"ip"?: unknown,"passport_file_id"?: string,"registration_id"?: string,"user_agent"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "passport_access_logs_passport_file_id_fkey"
      columns: ["passport_file_id"]
isOneToOne: false
      referencedRelation: "passport_files"
      referencedColumns: ["id"]
    }
                  ]
                },"passport_files": {
                  Row: {
                    "deleted_at": string | null,"deleted_reason": string | null,"id": string,"iv": string,"key_version": number,"mime_type": string,"registration_id": string,"size_bytes": number,"storage_path": string,"uploaded_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "deleted_at"?: string | null,"deleted_reason"?: string | null,"id"?: string,"iv": string,"key_version"?: number,"mime_type": string,"registration_id": string,"size_bytes": number,"storage_path": string,"uploaded_at"?: string
                  }
                  Update: {
                    "deleted_at"?: string | null,"deleted_reason"?: string | null,"id"?: string,"iv"?: string,"key_version"?: number,"mime_type"?: string,"registration_id"?: string,"size_bytes"?: number,"storage_path"?: string,"uploaded_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "passport_files_registration_id_fkey"
      columns: ["registration_id"]
isOneToOne: false
      referencedRelation: "registrations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "passport_files_registration_id_fkey"
      columns: ["registration_id"]
isOneToOne: false
      referencedRelation: "v_registration_board"
      referencedColumns: ["id"]
    }
                  ]
                },"payment_schedules": {
                  Row: {
                    "amount_due": number,"canceled_at": string | null,"change_reason": string | null,"created_at": string,"created_from_rule_id": string | null,"due_date": string,"id": string,"kind": string,"label": string,"registration_id": string,"sort": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_due": number,"canceled_at"?: string | null,"change_reason"?: string | null,"created_at"?: string,"created_from_rule_id"?: string | null,"due_date": string,"id"?: string,"kind": string,"label": string,"registration_id": string,"sort"?: number,"updated_at"?: string
                  }
                  Update: {
                    "amount_due"?: number,"canceled_at"?: string | null,"change_reason"?: string | null,"created_at"?: string,"created_from_rule_id"?: string | null,"due_date"?: string,"id"?: string,"kind"?: string,"label"?: string,"registration_id"?: string,"sort"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payment_schedules_created_from_rule_id_fkey"
      columns: ["created_from_rule_id"]
isOneToOne: false
      referencedRelation: "program_payment_rules"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_schedules_registration_id_fkey"
      columns: ["registration_id"]
isOneToOne: false
      referencedRelation: "registrations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_schedules_registration_id_fkey"
      columns: ["registration_id"]
isOneToOne: false
      referencedRelation: "v_registration_board"
      referencedColumns: ["id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount": number,"created_at": string,"external_payment_id": string | null,"id": string,"memo": string | null,"method": string,"method_detail": Json | null,"paid_at": string,"pg_provider": string | null,"recorded_by": string | null,"schedule_id": string,"status": string,"voided_at": string | null,"voided_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"created_at"?: string,"external_payment_id"?: string | null,"id"?: string,"memo"?: string | null,"method": string,"method_detail"?: Json | null,"paid_at"?: string,"pg_provider"?: string | null,"recorded_by"?: string | null,"schedule_id": string,"status"?: string,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"external_payment_id"?: string | null,"id"?: string,"memo"?: string | null,"method"?: string,"method_detail"?: Json | null,"paid_at"?: string,"pg_provider"?: string | null,"recorded_by"?: string | null,"schedule_id"?: string,"status"?: string,"voided_at"?: string | null,"voided_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_recorded_by_fkey"
      columns: ["recorded_by"]
isOneToOne: false
      referencedRelation: "staff_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_schedule_id_fkey"
      columns: ["schedule_id"]
isOneToOne: false
      referencedRelation: "payment_schedules"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_schedule_id_fkey"
      columns: ["schedule_id"]
isOneToOne: false
      referencedRelation: "v_payment_board"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_schedule_id_fkey"
      columns: ["schedule_id"]
isOneToOne: false
      referencedRelation: "v_payment_schedules"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_voided_by_fkey"
      columns: ["voided_by"]
isOneToOne: false
      referencedRelation: "staff_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"payout_accounts": {
                  Row: {
                    "account_holder": string,"account_number": string,"bank_name": string,"contact_id": string | null,"created_at": string,"id": string,"memo": string | null,"partner_id": string | null,"settlement_method": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_holder": string,"account_number": string,"bank_name": string,"contact_id"?: string | null,"created_at"?: string,"id"?: string,"memo"?: string | null,"partner_id"?: string | null,"settlement_method"?: string,"updated_at"?: string
                  }
                  Update: {
                    "account_holder"?: string,"account_number"?: string,"bank_name"?: string,"contact_id"?: string | null,"created_at"?: string,"id"?: string,"memo"?: string | null,"partner_id"?: string | null,"settlement_method"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payout_accounts_contact_id_fkey"
      columns: ["contact_id"]
isOneToOne: true
      referencedRelation: "partner_contacts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payout_accounts_partner_id_fkey"
      columns: ["partner_id"]
isOneToOne: true
      referencedRelation: "partners"
      referencedColumns: ["id"]
    }
                  ]
                },"prep_item_templates": {
                  Row: {
                    "active": boolean,"audience": string | null,"description": string | null,"due_anchor": string,"due_offset_days": number,"gate_open": boolean,"key": string,"kind": string,"required": boolean,"sort": number,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"audience"?: string | null,"description"?: string | null,"due_anchor"?: string,"due_offset_days"?: number,"gate_open"?: boolean,"key": string,"kind": string,"required"?: boolean,"sort"?: number,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"audience"?: string | null,"description"?: string | null,"due_anchor"?: string,"due_offset_days"?: number,"gate_open"?: boolean,"key"?: string,"kind"?: string,"required"?: boolean,"sort"?: number,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"program_milestones": {
                  Row: {
                    "category": string,"created_at": string,"date": string,"id": string,"memo": string | null,"program_id": string,"show_dday": boolean,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category"?: string,"created_at"?: string,"date": string,"id"?: string,"memo"?: string | null,"program_id": string,"show_dday"?: boolean,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "category"?: string,"created_at"?: string,"date"?: string,"id"?: string,"memo"?: string | null,"program_id"?: string,"show_dday"?: boolean,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "program_milestones_program_id_fkey"
      columns: ["program_id"]
isOneToOne: false
      referencedRelation: "programs"
      referencedColumns: ["id"]
    }
                  ]
                },"program_payment_rules": {
                  Row: {
                    "amount": number,"created_at": string,"due_fixed_date": string | null,"due_offset_days": number | null,"due_rule_type": string,"id": string,"kind": string,"label": string,"program_id": string,"sort": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"created_at"?: string,"due_fixed_date"?: string | null,"due_offset_days"?: number | null,"due_rule_type": string,"id"?: string,"kind": string,"label": string,"program_id": string,"sort"?: number,"updated_at"?: string
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"due_fixed_date"?: string | null,"due_offset_days"?: number | null,"due_rule_type"?: string,"id"?: string,"kind"?: string,"label"?: string,"program_id"?: string,"sort"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "program_payment_rules_program_id_fkey"
      columns: ["program_id"]
isOneToOne: false
      referencedRelation: "programs"
      referencedColumns: ["id"]
    }
                  ]
                },"program_prep_items": {
                  Row: {
                    "approved_at": string | null,"approved_by": string | null,"audience": string | null,"checklist": NonNullable<Json>,"created_at": string,"deleted_at": string | null,"distributed_on": string | null,"distribution_channel": string | null,"due_anchor": string,"due_date": string | null,"due_manual": boolean,"due_offset_days": number,"gate_open": boolean,"id": string,"kind": string,"memo": string | null,"needs_recheck": boolean,"owner_id": string | null,"partner_id": string | null,"program_id": string,"recheck_reason": string | null,"request": NonNullable<Json>,"required": boolean,"result_url": string | null,"reviewer_id": string | null,"sort": number,"status": string,"template_key": string | null,"title": string,"updated_at": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"audience"?: string | null,"checklist"?: NonNullable<Json>,"created_at"?: string,"deleted_at"?: string | null,"distributed_on"?: string | null,"distribution_channel"?: string | null,"due_anchor"?: string,"due_date"?: string | null,"due_manual"?: boolean,"due_offset_days"?: number,"gate_open"?: boolean,"id"?: string,"kind": string,"memo"?: string | null,"needs_recheck"?: boolean,"owner_id"?: string | null,"partner_id"?: string | null,"program_id": string,"recheck_reason"?: string | null,"request"?: NonNullable<Json>,"required"?: boolean,"result_url"?: string | null,"reviewer_id"?: string | null,"sort"?: number,"status"?: string,"template_key"?: string | null,"title": string,"updated_at"?: string,"version"?: number
                  }
                  Update: {
                    "approved_at"?: string | null,"approved_by"?: string | null,"audience"?: string | null,"checklist"?: NonNullable<Json>,"created_at"?: string,"deleted_at"?: string | null,"distributed_on"?: string | null,"distribution_channel"?: string | null,"due_anchor"?: string,"due_date"?: string | null,"due_manual"?: boolean,"due_offset_days"?: number,"gate_open"?: boolean,"id"?: string,"kind"?: string,"memo"?: string | null,"needs_recheck"?: boolean,"owner_id"?: string | null,"partner_id"?: string | null,"program_id"?: string,"recheck_reason"?: string | null,"request"?: NonNullable<Json>,"required"?: boolean,"result_url"?: string | null,"reviewer_id"?: string | null,"sort"?: number,"status"?: string,"template_key"?: string | null,"title"?: string,"updated_at"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "program_prep_items_approved_by_fkey"
      columns: ["approved_by"]
isOneToOne: false
      referencedRelation: "staff_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "program_prep_items_owner_id_fkey"
      columns: ["owner_id"]
isOneToOne: false
      referencedRelation: "staff_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "program_prep_items_partner_id_fkey"
      columns: ["partner_id"]
isOneToOne: false
      referencedRelation: "partners"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "program_prep_items_program_id_fkey"
      columns: ["program_id"]
isOneToOne: false
      referencedRelation: "programs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "program_prep_items_reviewer_id_fkey"
      columns: ["reviewer_id"]
isOneToOne: false
      referencedRelation: "staff_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"program_prep_versions": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"item_id": string,"note": string | null,"url": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"item_id": string,"note"?: string | null,"url": string,"version": number
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"item_id"?: string,"note"?: string | null,"url"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "program_prep_versions_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "staff_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "program_prep_versions_item_id_fkey"
      columns: ["item_id"]
isOneToOne: false
      referencedRelation: "program_prep_items"
      referencedColumns: ["id"]
    }
                  ]
                },"programs": {
                  Row: {
                    "capacity": number | null,"commission_amount": number | null,"commission_notice_sent_on": string | null,"copied_from": string | null,"country": string | null,"created_at": string,"created_by": string | null,"deleted_at": string | null,"description": string | null,"destroy_after_days": number,"end_date": string,"form_config": NonNullable<Json>,"health_field_enabled": boolean,"id": string,"name": string,"passport_upload_enabled": boolean,"prep_override_reason": string | null,"recruit_start_date": string | null,"refund_policy_text": string | null,"refund_policy_version": number,"refund_rules": NonNullable<Json>,"season": string | null,"slug": string,"slug_locked": boolean,"start_date": string,"status": string,"third_party_recipients": NonNullable<Json>,"total_price": number,"type": string,"updated_at": string,"waitlist_enabled": boolean
                  }
                  ComputedFields: never
                  Insert: {
                    "capacity"?: number | null,"commission_amount"?: number | null,"commission_notice_sent_on"?: string | null,"copied_from"?: string | null,"country"?: string | null,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"description"?: string | null,"destroy_after_days"?: number,"end_date": string,"form_config"?: NonNullable<Json>,"health_field_enabled"?: boolean,"id"?: string,"name": string,"passport_upload_enabled"?: boolean,"prep_override_reason"?: string | null,"recruit_start_date"?: string | null,"refund_policy_text"?: string | null,"refund_policy_version"?: number,"refund_rules"?: NonNullable<Json>,"season"?: string | null,"slug": string,"slug_locked"?: boolean,"start_date": string,"status"?: string,"third_party_recipients"?: NonNullable<Json>,"total_price"?: number,"type": string,"updated_at"?: string,"waitlist_enabled"?: boolean
                  }
                  Update: {
                    "capacity"?: number | null,"commission_amount"?: number | null,"commission_notice_sent_on"?: string | null,"copied_from"?: string | null,"country"?: string | null,"created_at"?: string,"created_by"?: string | null,"deleted_at"?: string | null,"description"?: string | null,"destroy_after_days"?: number,"end_date"?: string,"form_config"?: NonNullable<Json>,"health_field_enabled"?: boolean,"id"?: string,"name"?: string,"passport_upload_enabled"?: boolean,"prep_override_reason"?: string | null,"recruit_start_date"?: string | null,"refund_policy_text"?: string | null,"refund_policy_version"?: number,"refund_rules"?: NonNullable<Json>,"season"?: string | null,"slug"?: string,"slug_locked"?: boolean,"start_date"?: string,"status"?: string,"third_party_recipients"?: NonNullable<Json>,"total_price"?: number,"type"?: string,"updated_at"?: string,"waitlist_enabled"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "programs_copied_from_fkey"
      columns: ["copied_from"]
isOneToOne: false
      referencedRelation: "programs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "programs_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "staff_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"refunds": {
                  Row: {
                    "created_at": string,"days_before_start": number | null,"deduction_rate": number | null,"expected_amount": number | null,"final_amount": number | null,"id": string,"memo": string | null,"paid_total": number | null,"processed_at": string | null,"processed_by": string | null,"reason_type": string,"registration_id": string,"requested_at": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"days_before_start"?: number | null,"deduction_rate"?: number | null,"expected_amount"?: number | null,"final_amount"?: number | null,"id"?: string,"memo"?: string | null,"paid_total"?: number | null,"processed_at"?: string | null,"processed_by"?: string | null,"reason_type": string,"registration_id": string,"requested_at": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"days_before_start"?: number | null,"deduction_rate"?: number | null,"expected_amount"?: number | null,"final_amount"?: number | null,"id"?: string,"memo"?: string | null,"paid_total"?: number | null,"processed_at"?: string | null,"processed_by"?: string | null,"reason_type"?: string,"registration_id"?: string,"requested_at"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "refunds_processed_by_fkey"
      columns: ["processed_by"]
isOneToOne: false
      referencedRelation: "staff_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "refunds_registration_id_fkey"
      columns: ["registration_id"]
isOneToOne: false
      referencedRelation: "registrations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "refunds_registration_id_fkey"
      columns: ["registration_id"]
isOneToOne: false
      referencedRelation: "v_registration_board"
      referencedColumns: ["id"]
    }
                  ]
                },"registration_health_notes": {
                  Row: {
                    "body": string,"created_at": string,"registration_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "body": string,"created_at"?: string,"registration_id": string,"updated_at"?: string
                  }
                  Update: {
                    "body"?: string,"created_at"?: string,"registration_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "registration_health_notes_registration_id_fkey"
      columns: ["registration_id"]
isOneToOne: true
      referencedRelation: "registrations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "registration_health_notes_registration_id_fkey"
      columns: ["registration_id"]
isOneToOne: true
      referencedRelation: "v_registration_board"
      referencedColumns: ["id"]
    }
                  ]
                },"registrations": {
                  Row: {
                    "address": string | null,"assigned_to": string | null,"attribution_confirmed_at": string | null,"attribution_confirmed_by": string | null,"attribution_source": string | null,"birth_date": string | null,"canceled_at": string | null,"created_at": string,"deleted_at": string | null,"destroy_due_date": string | null,"destroyed_at": string | null,"emergency_name": string | null,"emergency_phone": string | null,"emergency_relation": string | null,"english_level": string | null,"gender": string | null,"grade": string | null,"id": string,"lead_id": string | null,"parent_email": string | null,"parent_name": string | null,"parent_phone": string | null,"partner_contact_id": string | null,"partner_id": string | null,"partner_share_agreed": boolean,"passport_status": string,"payment_changed_at": string | null,"payment_correction_sent_at": string | null,"program_id": string,"registered_on": string,"school": string | null,"source_other": string | null,"special_notes": string | null,"status": string,"student_name_en": string | null,"student_name_ko": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"assigned_to"?: string | null,"attribution_confirmed_at"?: string | null,"attribution_confirmed_by"?: string | null,"attribution_source"?: string | null,"birth_date"?: string | null,"canceled_at"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"destroy_due_date"?: string | null,"destroyed_at"?: string | null,"emergency_name"?: string | null,"emergency_phone"?: string | null,"emergency_relation"?: string | null,"english_level"?: string | null,"gender"?: string | null,"grade"?: string | null,"id"?: string,"lead_id"?: string | null,"parent_email"?: string | null,"parent_name"?: string | null,"parent_phone"?: string | null,"partner_contact_id"?: string | null,"partner_id"?: string | null,"partner_share_agreed"?: boolean,"passport_status"?: string,"payment_changed_at"?: string | null,"payment_correction_sent_at"?: string | null,"program_id": string,"registered_on"?: string,"school"?: string | null,"source_other"?: string | null,"special_notes"?: string | null,"status"?: string,"student_name_en"?: string | null,"student_name_ko"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string | null,"assigned_to"?: string | null,"attribution_confirmed_at"?: string | null,"attribution_confirmed_by"?: string | null,"attribution_source"?: string | null,"birth_date"?: string | null,"canceled_at"?: string | null,"created_at"?: string,"deleted_at"?: string | null,"destroy_due_date"?: string | null,"destroyed_at"?: string | null,"emergency_name"?: string | null,"emergency_phone"?: string | null,"emergency_relation"?: string | null,"english_level"?: string | null,"gender"?: string | null,"grade"?: string | null,"id"?: string,"lead_id"?: string | null,"parent_email"?: string | null,"parent_name"?: string | null,"parent_phone"?: string | null,"partner_contact_id"?: string | null,"partner_id"?: string | null,"partner_share_agreed"?: boolean,"passport_status"?: string,"payment_changed_at"?: string | null,"payment_correction_sent_at"?: string | null,"program_id"?: string,"registered_on"?: string,"school"?: string | null,"source_other"?: string | null,"special_notes"?: string | null,"status"?: string,"student_name_en"?: string | null,"student_name_ko"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "registrations_assigned_to_fkey"
      columns: ["assigned_to"]
isOneToOne: false
      referencedRelation: "staff_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "registrations_attribution_confirmed_by_fkey"
      columns: ["attribution_confirmed_by"]
isOneToOne: false
      referencedRelation: "staff_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "registrations_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "registrations_partner_contact_id_fkey"
      columns: ["partner_contact_id"]
isOneToOne: false
      referencedRelation: "partner_contacts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "registrations_partner_id_fkey"
      columns: ["partner_id"]
isOneToOne: false
      referencedRelation: "partners"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "registrations_program_id_fkey"
      columns: ["program_id"]
isOneToOne: false
      referencedRelation: "programs"
      referencedColumns: ["id"]
    }
                  ]
                },"settings": {
                  Row: {
                    "key": string,"updated_at": string,"updated_by": string | null,"value": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "key": string,"updated_at"?: string,"updated_by"?: string | null,"value": NonNullable<Json>
                  }
                  Update: {
                    "key"?: string,"updated_at"?: string,"updated_by"?: string | null,"value"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "settings_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "staff_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"staff_profiles": {
                  Row: {
                    "active": boolean,"can_view_passport": boolean,"created_at": string,"email": string,"id": string,"must_change_password": boolean,"name": string,"notify_channels": (string)[],"phone": string | null,"role": string,"team": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"can_view_passport"?: boolean,"created_at"?: string,"email": string,"id": string,"must_change_password"?: boolean,"name": string,"notify_channels"?: (string)[],"phone"?: string | null,"role": string,"team"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"can_view_passport"?: boolean,"created_at"?: string,"email"?: string,"id"?: string,"must_change_password"?: boolean,"name"?: string,"notify_channels"?: (string)[],"phone"?: string | null,"role"?: string,"team"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"staff_program_assignments": {
                  Row: {
                    "created_at": string,"program_id": string,"staff_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"program_id": string,"staff_id": string
                  }
                  Update: {
                    "created_at"?: string,"program_id"?: string,"staff_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "staff_program_assignments_program_id_fkey"
      columns: ["program_id"]
isOneToOne: false
      referencedRelation: "programs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "staff_program_assignments_staff_id_fkey"
      columns: ["staff_id"]
isOneToOne: false
      referencedRelation: "staff_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"submission_throttle": {
                  Row: {
                    "created_at": string,"id": number,"kind": string,"phone_hash": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: never,"kind": string,"phone_hash": string
                  }
                  Update: {
                    "created_at"?: string,"id"?: never,"kind"?: string,"phone_hash"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "v_partner_agreements": {
                  Row: {
                    "agreement_type": string,"auto_renew": boolean,"contact_id": string | null,"created_at": string,"effective_end_date": string | null,"end_date": string,"exclusive_region": string | null,"form": string,"id": string,"memo": string | null,"partner_id": string,"signed_on": string | null,"start_date": string,"status": string | null,"terminated_on": string | null,"termination_notified_on": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                           "agreement_type"?: string | null,"auto_renew"?: boolean | null,"contact_id"?: string | null,"created_at"?: string | null,"effective_end_date"?: never,"end_date"?: string | null,"exclusive_region"?: string | null,"form"?: string | null,"id"?: string | null,"memo"?: string | null,"partner_id"?: string | null,"signed_on"?: string | null,"start_date"?: string | null,"status"?: never,"terminated_on"?: string | null,"termination_notified_on"?: string | null,"updated_at"?: string | null
                         }
                        Update: {
                           "agreement_type"?: string | null,"auto_renew"?: boolean | null,"contact_id"?: string | null,"created_at"?: string | null,"effective_end_date"?: never,"end_date"?: string | null,"exclusive_region"?: string | null,"form"?: string | null,"id"?: string | null,"memo"?: string | null,"partner_id"?: string | null,"signed_on"?: string | null,"start_date"?: string | null,"status"?: never,"terminated_on"?: string | null,"termination_notified_on"?: string | null,"updated_at"?: string | null
                         }
                        Relationships: [
                    {
      foreignKeyName: "partner_agreements_contact_id_fkey"
      columns: ["contact_id"]
isOneToOne: false
      referencedRelation: "partner_contacts"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "partner_agreements_partner_id_fkey"
      columns: ["partner_id"]
isOneToOne: false
      referencedRelation: "partners"
      referencedColumns: ["id"]
    }
                  ]
                },"v_payment_board": {
                  Row: {
                    "amount_due": number,"canceled_at": string | null,"change_reason": string | null,"destroyed_at": string | null,"due_date": string,"id": string,"kind": string,"label": string,"paid_amount": number | null,"parent_name": string | null,"program_id": string,"program_name": string,"program_season": string | null,"registration_id": string,"registration_status": string,"status": string | null,"student_name_ko": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "payment_schedules_registration_id_fkey"
      columns: ["registration_id"]
isOneToOne: false
      referencedRelation: "registrations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_schedules_registration_id_fkey"
      columns: ["registration_id"]
isOneToOne: false
      referencedRelation: "v_registration_board"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "registrations_program_id_fkey"
      columns: ["program_id"]
isOneToOne: false
      referencedRelation: "programs"
      referencedColumns: ["id"]
    }
                  ]
                },"v_payment_schedules": {
                  Row: {
                    "amount_due": number,"canceled_at": string | null,"change_reason": string | null,"created_at": string,"created_from_rule_id": string | null,"due_date": string,"id": string,"kind": string,"label": string,"paid_amount": number | null,"registration_id": string,"sort": number,"status": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "payment_schedules_created_from_rule_id_fkey"
      columns: ["created_from_rule_id"]
isOneToOne: false
      referencedRelation: "program_payment_rules"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_schedules_registration_id_fkey"
      columns: ["registration_id"]
isOneToOne: false
      referencedRelation: "registrations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payment_schedules_registration_id_fkey"
      columns: ["registration_id"]
isOneToOne: false
      referencedRelation: "v_registration_board"
      referencedColumns: ["id"]
    }
                  ]
                },"v_registration_board": {
                  Row: {
                    "attribution_confirmed_at": string | null,"core_paid": boolean | null,"created_at": string,"destroyed_at": string | null,"id": string,"lead_id": string | null,"next_due_date": string | null,"overdue_count": number | null,"parent_name": string | null,"parent_phone": string | null,"partner_id": string | null,"partner_name": string | null,"passport_status": string,"program_id": string,"program_name": string,"program_season": string | null,"program_start": string,"registered_on": string,"status": string,"student_name_ko": string | null,"total_due": number | null,"total_paid": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "registrations_lead_id_fkey"
      columns: ["lead_id"]
isOneToOne: false
      referencedRelation: "leads"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "registrations_partner_id_fkey"
      columns: ["partner_id"]
isOneToOne: false
      referencedRelation: "partners"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "registrations_program_id_fkey"
      columns: ["program_id"]
isOneToOne: false
      referencedRelation: "programs"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Functions: {
            "add_consent_version":
{ Args: { "p_body": string,"p_kind": string,"p_title": string }; Returns: number
                           },
"add_prep_version":
{ Args: { "p_item_id": string,"p_note"?: string,"p_url": string }; Returns: number
                           },
"admin_create_staff_profile":
{ Args: { "p_can_view_passport"?: boolean,"p_email": string,"p_id": string,"p_name": string,"p_role": string,"p_team"?: string }; Returns: undefined
                           },
"agreement_effective_end":
{ Args: { "p_auto_renew": boolean,"p_end": string,"p_terminated_on": string,"p_today"?: string }; Returns: string
                           },
"apply_registration_status":
{ Args: { "p_registration_id": string }; Returns: undefined
                           },
"can_view_passport":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"cancel_registration":
{ Args: { "p_memo": string,"p_reason_type": string,"p_registration_id": string,"p_requested_on": string }; Returns: string
                           },
"clear_must_change_password":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"compute_payment_schedule":
{ Args: { "p_program_id": string,"p_registered_on": string }; Returns: {
              "adjusted": boolean,"amount": number,"due_date": string,"kind": string,"label": string,"rule_id": string,"sort": number
            }[]
                           },
"compute_registration_status":
{ Args: { "p_registration_id": string }; Returns: string
                           },
"confirm_registration_receipt":
{ Args: { "p_registration_id": string }; Returns: string
                           },
"create_access_token":
{ Args: { "p_lead_id"?: string,"p_purpose": string,"p_registration_id"?: string,"p_ttl_days"?: number }; Returns: string
                           },
"create_passport_link":
{ Args: { "p_registration_id": string }; Returns: string
                           },
"current_staff_role":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"duplicate_program":
{ Args: { "p_new_season"?: string,"p_new_start": string,"p_program_id": string }; Returns: string
                           },
"fill_placeholders":
{ Args: { "p_text": string,"p_values": Json }; Returns: string
                           },
"flag_prep_recheck":
{ Args: { "p_program_id": string,"p_reason": string }; Returns: undefined
                           },
"format_date_ko":
{ Args: { "p": string }; Returns: string
                           },
"generate_consultation_slots":
{ Args: { "p_breaks"?: Json,"p_capacity"?: number,"p_end": string,"p_from": string,"p_interval_minutes": number,"p_start": string,"p_to": string,"p_weekdays": (number)[] }; Returns: number
                           },
"generate_prep_items":
{ Args: { "p_program_id": string }; Returns: number
                           },
"is_active_staff":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_staff_or_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"jsonb_text_array":
{ Args: { "p": Json }; Returns: (string)[]
                           },
"kst_today":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"log_passport_access":
{ Args: { "p_action": string,"p_actor": string,"p_file_id": string,"p_ip": unknown,"p_user_agent": string }; Returns: undefined
                           },
"mark_passport_deleted":
{ Args: { "p_actor": string,"p_file_id": string,"p_ip": unknown,"p_reason": string,"p_user_agent": string }; Returns: string
                           },
"partner_referral_counts":
{ Args: Record<PropertyKey, never>; Returns: {
              "lead_count": number,"partner_id": string,"registration_count": number
            }[]
                           },
"passport_upload_target":
{ Args: { "p_token": string }; Returns: Json
                           },
"prep_due_date":
{ Args: { "p_anchor": string,"p_offset": number,"p_recruit_start": string,"p_start": string }; Returns: string
                           },
"prep_item_complete":
{ Args: { "p_needs_recheck": boolean,"p_status": string }; Returns: boolean
                           },
"prep_review_keys":
{ Args: Record<PropertyKey, never>; Returns: (string)[]
                           },
"process_refund":
{ Args: { "p_final_amount": number,"p_memo": string,"p_refund_id": string }; Returns: undefined
                           },
"program_enrolled_count":
{ Args: { "p_program_id": string }; Returns: number
                           },
"program_enrollment_counts":
{ Args: Record<PropertyKey, never>; Returns: {
              "enrolled": number,"program_id": string,"waitlisted": number
            }[]
                           },
"program_prep_progress":
{ Args: Record<PropertyKey, never>; Returns: {
              "due_soon": number,"gate_pending": number,"needs_recheck": number,"overdue": number,"program_id": string,"required_done": number,"required_total": number
            }[]
                           },
"promote_waitlisted":
{ Args: { "p_registration_id": string }; Returns: undefined
                           },
"public_available_slots":
{ Args: { "p_from": string,"p_to": string }; Returns: {
              "ends_at": string,"id": string,"starts_at": string
            }[]
                           },
"public_lead_form_config":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"public_partner_by_code":
{ Args: { "p_code": string }; Returns: {
              "contacts": Json,"id": string,"name": string
            }[]
                           },
"public_partner_contacts":
{ Args: { "p_partner_id": string }; Returns: {
              "id": string,"name": string,"role": string
            }[]
                           },
"public_partners":
{ Args: Record<PropertyKey, never>; Returns: {
              "id": string,"name": string,"region": string
            }[]
                           },
"public_programs":
{ Args: Record<PropertyKey, never>; Returns: {
              "id": string,"name": string,"season": string,"type": string
            }[]
                           },
"public_register_form":
{ Args: { "p_slug": string }; Returns: Json
                           },
"record_passport_upload":
{ Args: { "p_consent": boolean,"p_ip": unknown,"p_iv": string,"p_key_version": number,"p_mime": string,"p_path": string,"p_registration_id": string,"p_size": number,"p_user_agent": string }; Returns: Json
                           },
"refresh_registration_statuses":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"refund_deduction_rate":
{ Args: { "p_days": number,"p_rules": Json }; Returns: number
                           },
"registration_consent_values":
{ Args: { "p_partner_name": string,"p_program_id": string }; Returns: Json
                           },
"registration_consents":
{ Args: { "p_partner_name": string,"p_program_id": string }; Returns: {
              "body": string,"kind": string,"required": boolean,"title": string,"version": number
            }[]
                           },
"registration_field_modes":
{ Args: { "p_config": Json }; Returns: Json
                           },
"registration_prefill":
{ Args: { "p_token": string }; Returns: Json
                           },
"registration_refund_text":
{ Args: { "p_program_id": string }; Returns: string
                           },
"registration_summary":
{ Args: { "p_registration_id": string }; Returns: Json
                           },
"registration_summary_by_token":
{ Args: { "p_token": string }; Returns: Json
                           },
"submit_lead":
{ Args: { "p": Json }; Returns: Json
                           },
"submit_registration":
{ Args: { "p": Json }; Returns: Json
                           },
"viewer_has_program":
{ Args: { "p_program_id": string }; Returns: boolean
                           },
"viewer_has_registration":
{ Args: { "p_registration_id": string }; Returns: boolean
                           },
"viewer_list_registrations":
{ Args: { "p_program_id": string }; Returns: {
              "birth_date": string,"emergency_name": string,"emergency_phone": string,"emergency_relation": string,"english_level": string,"gender": string,"grade": string,"health_note": string,"id": string,"parent_name": string,"parent_phone": string,"passport_status": string,"program_id": string,"school": string,"special_notes": string,"status": string,"student_name_en": string,"student_name_ko": string
            }[]
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
