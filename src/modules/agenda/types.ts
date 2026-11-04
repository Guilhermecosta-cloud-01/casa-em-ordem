import type { Recurrence } from '@/lib/recurrence'

export type EventKind = 'appointment' | 'important_date' | 'maintenance' | 'restock'

export interface AgendaEvent {
  id: string
  family_id: string
  kind: EventKind
  title: string
  notes: string | null
  location: string | null
  starts_on: string
  start_time: string | null
  end_time: string | null
  recurrence: Recurrence
  recurrence_interval: number
  until_on: string | null
  remind_minutes: number | null
  product_id: string | null
  stock_item_id: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export type EventFields = Pick<
  AgendaEvent,
  | 'kind'
  | 'title'
  | 'notes'
  | 'location'
  | 'starts_on'
  | 'start_time'
  | 'end_time'
  | 'recurrence'
  | 'recurrence_interval'
  | 'until_on'
  | 'remind_minutes'
  | 'product_id'
  | 'stock_item_id'
>

export interface EventLog {
  id: string
  family_id: string
  event_id: string
  occurs_on: string | null
  done_on: string
  notes: string | null
  created_by: string | null
  created_at: string
}
