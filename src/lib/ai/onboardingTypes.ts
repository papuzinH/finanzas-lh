/**
 * Tipos para el flujo de onboarding conversacional con Chanchito.
 */

export type OnboardingStep =
  | 'name'
  | 'categories'
  | 'confirm_categories'
  | 'payment_methods'
  | 'default_payment'

export interface OnboardingRequest {
  message: string
  step: OnboardingStep
  /** Contexto acumulado del onboarding (categorías propuestas, etc.) */
  context?: OnboardingContext
}

export interface OnboardingContext {
  proposedCategories?: ProposedCategory[]
  savedPaymentMethods?: SavedPaymentMethod[]
  history?: Array<{ role: 'user' | 'chanchito'; content: string }>
  /** Credit cards pending follow-up for closing/payment day */
  pendingCreditCards?: string[]
}

export interface ProposedCategory {
  emoji: string
  name: string
  description: string
}

export interface SavedPaymentMethod {
  id: number
  name: string
  type: 'credit' | 'debit' | 'cash'
  closingDay: number | null
  paymentDay: number | null
}

// --- Resultados de Gemini para cada paso ---

export interface NameResult {
  name: string
}

export interface CategoriesResult {
  categories: ProposedCategory[]
}

export interface ConfirmCategoriesResult {
  confirmed: boolean
  adjustments?: string
}

export interface PaymentMethodResult {
  intention: 'create' | 'finish' | 'create_batch' | 'delete' | 'edit'
  name?: string
  type?: 'credit' | 'debit' | 'cash'
  closingDay?: number | null
  paymentDay?: number | null
  // Batch fields
  methods?: Array<{
    name: string
    type: 'credit' | 'debit' | 'cash'
    closing_day?: number | null
    payment_day?: number | null
  }>
  needs_follow_up?: string[] // credit cards that need closing/payment day
  // Delete fields
  delete_name?: string
  // Edit fields
  old_name?: string
  new_name?: string
  new_type?: 'credit' | 'debit' | 'cash'
}

export interface DefaultPaymentResult {
  paymentMethodName: string
}

export interface OnboardingResponse {
  success: boolean
  message: string
  step: OnboardingStep
  nextStep?: OnboardingStep
  data?: {
    categories?: ProposedCategory[]
    paymentMethod?: SavedPaymentMethod
    allPaymentMethods?: SavedPaymentMethod[]
    onboardingComplete?: boolean
    pendingCreditCards?: string[]
  }
}
