"use client";

import React from "react";
import Link from "next/link";
import { Download, RotateCcw, Building2, User, Hash, Calendar, ShieldCheck, Landmark, CreditCard, BookOpen } from "lucide-react";
import { SuccessAnimation } from "@/components/SuccessAnimation";
import { VeinGuilloché } from "@/components/VeinGuilloché";
import { ReceiptQRCode } from "@/components/ReceiptQRCode";
import { IdentifyResponse, AuthorizeResponse } from "@/lib/types";
import { useLanguage } from "@/lib/i18n/LanguageContext";

interface ReceiptCardProps {
  customer: IdentifyResponse;
  amount: number;
  paymentResult: AuthorizeResponse;
  onReset: () => void;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const ReceiptCard: React.FC<ReceiptCardProps> = ({
  customer,
  amount,
  paymentResult,
  onReset,
}) => {
  const { t } = useLanguage();

  const handleDownloadReceipt = () => {
    if (paymentResult.receipt_url) {
      const pdfUrl = paymentResult.receipt_url.startsWith("http")
        ? paymentResult.receipt_url
        : `${API_BASE_URL}${paymentResult.receipt_url}`;
      window.open(pdfUrl, "_blank");
      return;
    }

    // Client-side text receipt fallback
    const receiptText = `
===========================================================
             PALMPAY CERTIFICATE OF AUTHENTICITY           
===========================================================
STATUS:           PAYMENT CERTIFIED (VEIN-GUILLOCHÉ AUTHORIZED)
RAZORPAY ID:      ${paymentResult.razorpay_payment_id || "TXN-884920194"}
TIMESTAMP:        ${new Date().toLocaleString()}
TOTAL AMOUNT:     ₹${amount.toFixed(2)} INR
PAYEE MERCHANT:   PalmPay Store

REMITTER BIOMETRIC ACCOUNT LEDGER:
ACCOUNT HOLDER:   ${customer.name || "Enrolled Customer"}
CUSTOMER ID:      #${customer.customer_id || 1}
MASKED UPI VPA:   ${customer.masked_upi || "XXXX@UPI"}
AUTHENTICATION:   VEIN PATTERN VERIFIED (${((customer.confidence || 0.97) * 100).toFixed(0)}% MATCH)
===========================================================
EST. 2026 // PALMPAY BIOMETRIC CURRENCY INSTRUMENT
    `.trim();

    const blob = new Blob([receiptText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `PalmPay_Receipt_${paymentResult.razorpay_payment_id || "TXN"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full max-w-xl mx-auto">
      {/* Banknote Certificate Container */}
      <div className="relative w-full rounded-2xl bg-paper text-ink p-6 sm:p-10 shadow-certificate border-4 border-brass/80 overflow-hidden space-y-6">
        
        {/* Banknote Guilloché Watermark Background Layer */}
        <div className="absolute inset-0 pointer-events-none opacity-5 p-6 flex items-center justify-center">
          <VeinGuilloché className="w-full h-full text-ink" strokeColor="#0F1A14" />
        </div>

        {/* Engraved Corner Flourishes SVG */}
        <svg className="absolute inset-0 w-full h-full text-brass/70 pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none" fill="none">
          <path d="M 3 10 L 3 3 L 10 3" stroke="currentColor" strokeWidth="1" />
          <path d="M 90 3 L 97 3 L 97 10" stroke="currentColor" strokeWidth="1" />
          <path d="M 3 90 L 3 97 L 10 97" stroke="currentColor" strokeWidth="1" />
          <path d="M 90 97 L 97 97 L 97 90" stroke="currentColor" strokeWidth="1" />
        </svg>

        {/* Certificate Header Banner */}
        <div className="relative z-10 text-center border-b-2 border-brass/40 pb-4">
          <span className="font-mono text-[10px] uppercase tracking-widest text-brass block mb-1">
            BIOMETRIC CERTIFICATE OF AUTHENTICITY // SERIES 2026
          </span>
          <h1 className="font-serif text-2xl sm:text-3xl font-bold tracking-tight text-ink">
            {t("receipt.certificateTitle")}
          </h1>
        </div>

        {/* Animated Security Seal & Amount */}
        <div className="relative z-10 py-2">
          <SuccessAnimation
            amount={amount}
            currency="INR"
            merchant="PalmPay Merchant POS"
          />
        </div>

        {/* Certificate Details Ledger Grid */}
        <div className="relative z-10 space-y-3 font-mono text-xs border-y-2 border-brass/40 py-4">
          
          <div className="grid grid-cols-2 gap-4 items-center">
            <span className="text-ink/60 flex items-center gap-2">
              <User className="w-3.5 h-3.5 text-brass shrink-0" />
              <span>{t("receipt.remitterName")}</span>
            </span>
            <span className="font-serif font-bold text-ink text-sm text-right truncate">
              {customer.name}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 items-center pt-2 border-t border-brass/15">
            <span className="text-ink/60 flex items-center gap-2">
              <CreditCard className="w-3.5 h-3.5 text-brass shrink-0" />
              <span>{t("receipt.linkedVpa")}</span>
            </span>
            <span className="font-mono font-semibold text-ink text-right">
              {customer.masked_upi}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 items-center pt-2 border-t border-brass/15">
            <span className="text-ink/60 flex items-center gap-2">
              <Landmark className="w-3.5 h-3.5 text-brass shrink-0" />
              <span>{t("receipt.razorpayRef")}</span>
            </span>
            <span className="font-mono text-xs font-bold text-vein text-right truncate">
              {paymentResult.razorpay_payment_id || "pay_simulated_test"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 items-center pt-2 border-t border-brass/15">
            <span className="text-ink/60 flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-brass shrink-0" />
              <span>{t("receipt.timestamp")}</span>
            </span>
            <span className="text-ink/80 text-right">
              {new Date().toLocaleString("en-IN", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 items-center pt-2 border-t border-brass/15">
            <span className="text-ink/60 flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-brass shrink-0" />
              <span>{t("receipt.authentication")}</span>
            </span>
            <div className="text-right">
              <span className="inline-block text-[11px] font-semibold text-vein bg-vein/10 px-2.5 py-0.5 rounded border border-vein/30">
                {((customer.confidence || 0.97) * 100).toFixed(0)}% {t("receipt.veinVerified")}
              </span>
            </div>
          </div>
        </div>

        {/* Certificate QR Code & Passbook Ledger Footer */}
        <div className="relative z-10 flex items-center justify-between pt-1">
          <div className="space-y-1">
            <span className="font-mono text-[10px] text-ink/60 uppercase block">
              {t("receipt.qrSeal")}
            </span>
            <Link
              href="/ledger"
              className="inline-flex items-center gap-1.5 font-mono text-[11px] text-vein font-bold hover:underline"
            >
              <BookOpen className="w-3.5 h-3.5 text-brass" />
              <span>{t("receipt.viewLedgerLink")}</span>
            </Link>
          </div>

          <ReceiptQRCode
            value={paymentResult.razorpay_payment_id || `PALMPAY-TXN-${amount}`}
            size={58}
          />
        </div>

        {/* Two Distinct Separated Action Buttons */}
        <div className="relative z-10 flex flex-col sm:flex-row items-center gap-3 pt-2 border-t border-brass/30">
          {/* Action 1: Download Receipt */}
          <button
            onClick={handleDownloadReceipt}
            className="w-full sm:w-1/2 py-3.5 rounded-xl bg-ink text-paper hover:bg-ink/90 font-serif font-bold text-sm transition-all flex items-center justify-center gap-2 border border-brass/40 shadow-md"
          >
            <Download className="w-4 h-4 text-brass" />
            {t("receipt.downloadButton")}
          </button>

          {/* Action 2: Done / New Payment */}
          <button
            onClick={onReset}
            className="w-full sm:w-1/2 py-3.5 rounded-xl bg-gradient-to-r from-brass via-brass-bright to-brass text-ink font-serif font-bold text-sm transition-all shadow-brass-glow hover:shadow-[0_0_20px_rgba(176,141,70,0.5)] flex items-center justify-center gap-2 border border-brass-bright/50"
          >
            <RotateCcw className="w-4 h-4" />
            {t("receipt.doneButton")}
          </button>
        </div>
      </div>
    </div>
  );
};
