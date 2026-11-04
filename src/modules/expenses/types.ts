export type SplitMode = 'none' | 'equal' | 'custom'

export interface ExpenseShare {
  user_id: string
  amount: number | string
}

export interface Expense {
  id: string
  family_id: string
  description: string
  category: string
  amount: number | string
  spent_on: string
  paid_by: string | null
  split_mode: SplitMode
  purchase_id: string | null
  notes: string | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
  expense_shares: ExpenseShare[]
}

export interface Balance {
  family_id: string
  user_id: string
  paid: number | string
  owed: number | string
  sent: number | string
  received: number | string
  balance: number | string
}

export interface Settlement {
  id: string
  family_id: string
  from_user: string
  to_user: string
  amount: number | string
  settled_on: string
  notes: string | null
  created_by: string | null
  created_at: string
}

/** O que é enviado para save_expense. */
export interface ExpenseInput {
  id: string
  description: string
  category: string
  amount: string
  spent_on: string
  paid_by: string | null
  split_mode: SplitMode
  /** equal: ids na ordem; custom: valores por pessoa. */
  participants: string[] | { user_id: string; amount: string }[]
  notes: string | null
  purchase_id: string | null
}
