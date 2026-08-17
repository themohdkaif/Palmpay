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
