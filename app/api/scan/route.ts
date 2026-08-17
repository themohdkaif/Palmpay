import { NextResponse } from "next/server";
import { IdentifyResponse } from "@/lib/types";

/**
 * PalmPay Scan Identification Mock Fallback Route
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { simulateFailure = false } = body;

    await new Promise((resolve) => setTimeout(resolve, 2500));

    if (simulateFailure) {
      return NextResponse.json(
        {
          matched: false,
          confidence: 0.23,
          message: "Sub-dermal vein pattern not recognized.",
        },
        { status: 400 }
      );
    }

    const mockScanResult: IdentifyResponse = {
      matched: true,
      customer_id: 1,
      name: "Aditya Sharma",
      masked_upi: "aditya@hdfcbank",
      confidence: 0.97,
      session_id: 101,
    };

    return NextResponse.json(mockScanResult);
  } catch (error) {
    return NextResponse.json(
      {
        matched: false,
        confidence: 0,
        message: "Internal server error during biometric processing.",
      },
      { status: 500 }
    );
  }
}
