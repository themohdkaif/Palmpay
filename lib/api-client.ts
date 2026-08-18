/**
 * ===============================================================================
 * PALMPAY BACKEND API CONTRACT & CLIENT HELPERS
 * ===============================================================================
 * This file defines the expected backend API contract. No backend is currently
 * running — see INTEGRATION.md for the full expected endpoint/message list this
 * frontend depends on.
 * ===============================================================================
 */

import { IdentifyResponse, AuthorizeResponse, RegisterResponse, RegisterFormData, AdminCustomer } from "./types";

// Backend API Base URL placeholder - point this at your new backend once ready
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * Converts base64 JPEG data URL from react-webcam to a File object for multipart form uploads
 */
export function dataURItoFile(dataURI: string, filename = "palm_photo.jpg"): File {
  const arr = dataURI.split(",");
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
  const bstr = atob(arr[1] || "");
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
}

/**
 * Helper to generate a dummy synthetic image if no camera hardware is available
 */
function createDummyPalmFile(): File {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 800;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#0F1A14";
    ctx.fillRect(0, 0, 640, 800);
    ctx.fillStyle = "#B08D46";
    ctx.beginPath();
    ctx.arc(320, 400, 150, 0, Math.PI * 2);
    ctx.fill();
  }
  const dataUrl = canvas.toDataURL("image/jpeg");
  return dataURItoFile(dataUrl, "dummy_palm.jpg");
}

/**
 * Scan 1: Identify customer from palm photo
 */
export async function identifyPalm(
  imageBase64: string | null,
  merchantId = "PalmPay Store"
): Promise<IdentifyResponse> {
  const targetUrl = `${API_BASE_URL}/session/identify`;
  const formData = new FormData();
  formData.append("merchant_id", merchantId);

  const palmFile = imageBase64 ? dataURItoFile(imageBase64) : createDummyPalmFile();
  formData.append("palm_photo", palmFile);

  console.log(`[API REQUEST] POST ${targetUrl}`, {
    merchant_id: merchantId,
    file_name: palmFile.name,
    file_size: palmFile.size,
    file_type: palmFile.type,
  });

  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      body: formData,
    });

    const rawText = await response.text();
    let jsonBody: any = {};
    try {
      jsonBody = JSON.parse(rawText);
    } catch {
      jsonBody = { rawText };
    }

    console.log(`[API RESPONSE] POST ${targetUrl}`, {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      body: jsonBody,
    });

    if (!response.ok) {
      const detail = jsonBody.detail || (Array.isArray(jsonBody.detail) ? JSON.stringify(jsonBody.detail) : "Failed to identify palm pattern");
      throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
    }

    return jsonBody as IdentifyResponse;
  } catch (error: any) {
    console.error(`[API ERROR] POST ${targetUrl}:`, error);
    throw error;
  }
}

/**
 * Set transaction amount for session
 */
export async function setSessionAmount(sessionId: number, amountRupees: number): Promise<{ ok: boolean; amount_rupees: number }> {
  const targetUrl = `${API_BASE_URL}/session/set-amount`;
  const payload = { session_id: sessionId, amount_rupees: amountRupees };

  console.log(`[API REQUEST] POST ${targetUrl}`, payload);

  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const jsonBody = await response.json().catch(() => ({}));

    console.log(`[API RESPONSE] POST ${targetUrl}`, {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      body: jsonBody,
    });

    if (!response.ok) {
      throw new Error(jsonBody.detail || "Failed to set transaction amount");
    }

    return jsonBody;
  } catch (error: any) {
    console.error(`[API ERROR] POST ${targetUrl}:`, error);
    throw error;
  }
}

/**
 * Scan 2: Authorize payment with second palm scan
 */
export async function authorizePalm(
  sessionId: number,
  imageBase64: string | null
): Promise<AuthorizeResponse> {
  const targetUrl = `${API_BASE_URL}/session/authorize`;
  const formData = new FormData();
  formData.append("session_id", String(sessionId));

  const palmFile = imageBase64 ? dataURItoFile(imageBase64) : createDummyPalmFile();
  formData.append("palm_photo", palmFile);

  console.log(`[API REQUEST] POST ${targetUrl}`, {
    session_id: sessionId,
    file_name: palmFile.name,
    file_size: palmFile.size,
  });

  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      body: formData,
    });

    const jsonBody = await response.json().catch(() => ({}));

    console.log(`[API RESPONSE] POST ${targetUrl}`, {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      body: jsonBody,
    });

    if (!response.ok) {
      throw new Error(jsonBody.detail || "Failed to authorize remittance payment");
    }

    return jsonBody as AuthorizeResponse;
  } catch (error: any) {
    console.error(`[API ERROR] POST ${targetUrl}:`, error);
    throw error;
  }
}

/**
 * Step-Up verification for borderline biometric scans
 */
export async function stepUpVerify(sessionId: number, secret: string): Promise<AuthorizeResponse | any> {
  const targetUrl = `${API_BASE_URL}/session/step-up-verify`;
  const payload = { session_id: sessionId, secret };

  console.log(`[API REQUEST] POST ${targetUrl}`, payload);

  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const jsonBody = await response.json().catch(() => ({}));

    console.log(`[API RESPONSE] POST ${targetUrl}`, {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      body: jsonBody,
    });

    if (!response.ok) {
      throw new Error(jsonBody.detail || "Invalid security PIN or phone verification code");
    }

    return jsonBody;
  } catch (error: any) {
    console.error(`[API ERROR] POST ${targetUrl}:`, error);
    throw error;
  }
}

/**
 * Register new customer with palm embeddings & Razorpay UPI Autopay mandate
 */
export async function registerCustomer(
  formData: RegisterFormData,
  imageBase64: string | null
): Promise<RegisterResponse> {
  const targetUrl = `${API_BASE_URL}/customers/register`;
  const payload = new FormData();
  payload.append("name", formData.name);
  payload.append("contact", formData.contact);
  payload.append("email", formData.email);
  payload.append("upi_vpa", formData.upi_vpa);
  if (formData.step_up_pin) {
    payload.append("step_up_pin", formData.step_up_pin);
  }
  if (formData.consent_given_at) {
    payload.append("consent_given_at", formData.consent_given_at);
  }
  if (formData.consent_version) {
    payload.append("consent_version", formData.consent_version);
  }

  const palmFile = imageBase64 ? dataURItoFile(imageBase64) : createDummyPalmFile();
  payload.append("palm_photos", palmFile);

  console.log(`[API REQUEST] POST ${targetUrl}`, {
    name: formData.name,
    contact: formData.contact,
    email: formData.email,
    upi_vpa: formData.upi_vpa,
    file_name: palmFile.name,
    file_size: palmFile.size,
  });

  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      body: payload,
    });

    const rawText = await response.text();
    let jsonBody: any = {};
    try {
      jsonBody = JSON.parse(rawText);
    } catch {
      jsonBody = { rawText };
    }

    console.log(`[API RESPONSE] POST ${targetUrl}`, {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      body: jsonBody,
    });

    if (!response.ok) {
      const detail = jsonBody.detail;
      const errorMsg = typeof detail === "string" ? detail : Array.isArray(detail) ? detail.map((d: any) => `${d.loc?.join(".")}: ${d.msg}`).join(", ") : JSON.stringify(detail || jsonBody);
      throw new Error(errorMsg || "Failed to register customer");
    }

    return jsonBody as RegisterResponse;
  } catch (error: any) {
    console.error(`[API ERROR] POST ${targetUrl}:`, error);
    throw error;
  }
}

/**
 * Fetch transaction history for merchant ledger
 */
export async function fetchTransactions(): Promise<{ transactions: any[] }> {
  const targetUrl = `${API_BASE_URL}/transactions`;
  console.log(`[API REQUEST] GET ${targetUrl}`);

  try {
    const response = await fetch(targetUrl);
    const jsonBody = await response.json().catch(() => ({ transactions: [] }));
    console.log(`[API RESPONSE] GET ${targetUrl}`, jsonBody);

    if (!response.ok) {
      throw new Error(jsonBody.detail || "Failed to fetch transactions");
    }

    return jsonBody;
  } catch (error: any) {
    console.error(`[API ERROR] GET ${targetUrl}:`, error);
    return { transactions: [] };
  }
}

/**
 * Fetch all registered customers for admin management panel
 */
export async function fetchCustomers(): Promise<AdminCustomer[]> {
  const targetUrl = `${API_BASE_URL}/customers`;
  console.log(`[API REQUEST] GET ${targetUrl}`);

  try {
    const response = await fetch(targetUrl);
    const jsonBody = await response.json().catch(() => []);
    console.log(`[API RESPONSE] GET ${targetUrl}`, jsonBody);

    if (!response.ok) {
      throw new Error(jsonBody.detail || "Failed to fetch customer directory");
    }

    return jsonBody as AdminCustomer[];
  } catch (error: any) {
    console.error(`[API ERROR] GET ${targetUrl}:`, error);
    throw error;
  }
}

/**
 * Update editable customer details (name, contact, email, upi_vpa)
 */
export async function updateCustomer(
  customerId: number,
  data: { name: string; contact: string; email: string; upi_vpa: string }
): Promise<AdminCustomer> {
  const targetUrl = `${API_BASE_URL}/customers/${customerId}`;
  console.log(`[API REQUEST] PUT ${targetUrl}`, data);

  try {
    const response = await fetch(targetUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    const jsonBody = await response.json().catch(() => ({}));
    console.log(`[API RESPONSE] PUT ${targetUrl}`, jsonBody);

    if (!response.ok) {
      const detail = jsonBody.detail;
      const msg = typeof detail === "string" ? detail : Array.isArray(detail) ? detail.map((d: any) => d.msg).join(", ") : "Failed to update customer";
      throw new Error(msg);
    }

    return jsonBody as AdminCustomer;
  } catch (error: any) {
    console.error(`[API ERROR] PUT ${targetUrl}:`, error);
    throw error;
  }
}

/**
 * Permanently delete customer record and palm vector embeddings
 */
export async function deleteCustomer(customerId: number): Promise<{ ok: boolean; message: string }> {
  const targetUrl = `${API_BASE_URL}/customers/${customerId}`;
  console.log(`[API REQUEST] DELETE ${targetUrl}`);

  try {
    const response = await fetch(targetUrl, {
      method: "DELETE",
    });

    const jsonBody = await response.json().catch(() => ({}));
    console.log(`[API RESPONSE] DELETE ${targetUrl}`, jsonBody);

    if (!response.ok) {
      throw new Error(jsonBody.detail || "Failed to delete customer");
    }

    return jsonBody;
  } catch (error: any) {
    console.error(`[API ERROR] DELETE ${targetUrl}:`, error);
    throw error;
  }
}
