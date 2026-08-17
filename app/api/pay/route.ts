import { NextResponse } from "next/server";
import { AuthorizeResponse } from "@/lib/types";

/**
 * PalmPay Payment Authorization Mock Fallback Route
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { amount = 50 } = body;

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const mockPayResult: AuthorizeResponse = {
      status: "paid",
      razorpay_payment_id: `pay_mock_${Math.floor(100000000 + Math.random() * 900000000)}`,
      receipt_url: "/receipts/1",
      reason: `Payment of ₹${Number(amount).toFixed(2)} completed successfully.`,
    };

    return NextResponse.json(mockPayResult);
  } catch (error) {
    return NextResponse.json(
      {
        status: "failed",
        reason: "Payment authorization failed.",
      },
      { status: 500 }
    );
  }
}
