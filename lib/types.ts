export interface IdentifyResponse {
  matched: boolean;
  customer_id?: number;
  name?: string;
  masked_upi?: string;
  confidence: number;
  session_id?: number;
  message?: string;
}

export interface AuthorizeResponse {
  status: "paid" | "rejected_mismatch" | "failed" | string;
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
  | "unrecognized"
  | "registering"
  | "setting_amount"
  | "authorizing"
  | "completed"
  | "failed";

// Legacy type aliases for full compatibility
export type ScanResponse = IdentifyResponse;
export type PayResponse = AuthorizeResponse;
