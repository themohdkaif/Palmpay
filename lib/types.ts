/**
 * ===============================================================================
 * PALMPAY BACKEND DATA TYPE CONTRACTS
 * ===============================================================================
 * This file defines the expected response/request data types. No backend is currently
 * running — see INTEGRATION.md for the full expected API contract this frontend expects.
 * ===============================================================================
 */

export interface IdentifyResponse {
  matched: boolean;
  status?: "matched" | "borderline" | "unmatched" | string;
  requires_step_up?: boolean;
  step_up_prompt?: string;
  customer_id?: number;
  name?: string;
  masked_upi?: string;
  confidence: number;
  session_id?: number;
  message?: string;
}

export interface AuthorizeResponse {
  status: "paid" | "borderline" | "rejected_mismatch" | "failed" | string;
  requires_step_up?: boolean;
  step_up_prompt?: string;
  razorpay_payment_id?: string;
  receipt_url?: string;
  reason?: string;
}

export interface RegisterResponse {
  customer_id: number;
  mandate_order_id: string;
  message: string;
}

export interface RegisterFormData {
  name: string;
  contact: string;
  email: string;
  upi_vpa: string;
  step_up_pin?: string;
  consent_given_at?: string;
  consent_version?: string;
}

export interface AdminCustomer {
  id: number;
  name: string;
  contact: string;
  email?: string;
  upi_vpa: string;
  masked_upi: string;
  razorpay_customer_id?: string;
  mandate_order_id?: string;
  mandate_token_id?: string;
  mandate_approved: boolean;
  embedding_count: number;
  consent_given_at?: string;
  consent_version?: string;
  created_at: string;
}

export type PaymentFlowStatus =
  | "idle"
  | "identifying"
  | "identified"
  | "borderline_step_up"
  | "unrecognized"
  | "registering"
  | "setting_amount"
  | "authorizing"
  | "completed"
  | "failed";

// Legacy type aliases for full compatibility
export type ScanResponse = IdentifyResponse;
export type PayResponse = AuthorizeResponse;
