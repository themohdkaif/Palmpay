"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { PageTransition } from "@/components/PageTransition";
import { fetchTransactions } from "@/lib/api-client";
import { VeinGuilloché } from "@/components/VeinGuilloché";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { ArrowLeft, BookOpen, RefreshCw, Landmark, ShieldCheck, CheckCircle2, AlertCircle } from "lucide-react";

interface TransactionRecord {
  id: number;
  created_at: string | null;
  customer_name: string;
  masked_upi: string;
  amount_rupees: number;
  status: string;
  razorpay_payment_id: string;
  mandate_token_id: string;
  authorize_confidence?: number;
}

export default function LedgerPage() {
  const { t } = useLanguage();
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const res = await fetchTransactions();
      setTransactions(res.transactions || []);
    } catch (err) {
      console.error("Failed to load transactions", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Calculate Running Summary Totals
  const totalSettled = transactions
    .filter((t) => t.status === "paid")
    .reduce((sum, t) => sum + (t.amount_rupees || 0), 0);

  const paidCount = transactions.filter((t) => t.status === "paid").length;

  return (
    <PageTransition>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-8">
        
        {/* Top Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-line pb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Link
                href="/scan"
                className="p-1.5 rounded-lg bg-ink border border-line hover:border-brass text-brass transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
              </Link>

              <span className="font-mono text-xs text-brass uppercase tracking-widest block">
                {t("ledger.subtitle")}
              </span>
            </div>

            <h1 className="font-serif text-3xl sm:text-4xl font-bold text-paper tracking-tight">
              {t("ledger.title")}
            </h1>
          </div>

          <button
            onClick={loadData}
            disabled={isLoading}
            className="self-start sm:self-auto px-4 py-2.5 rounded-xl bg-ink border border-line hover:border-brass text-paper font-mono text-xs flex items-center gap-2 transition-all shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-brass ${isLoading ? "animate-spin" : ""}`} />
            <span>{t("ledger.refreshButton")}</span>
          </button>
        </div>

        {/* Engraved Running Summary Banner */}
        <div className="w-full rounded-2xl bg-ink border-2 border-brass/50 p-6 shadow-2xl relative overflow-hidden">
          
          {/* Background Watermark Guilloché */}
          <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-10 pointer-events-none">
            <VeinGuilloché className="w-48 h-48 text-brass" strokeColor="#B08D46" />
          </div>

          <div className="relative z-10 grid grid-cols-1 sm:grid-cols-3 gap-6 font-mono text-xs">
            <div className="p-4 rounded-xl bg-black/40 border border-line space-y-1">
              <span className="text-slate-400 text-[10px] block uppercase tracking-widest">
                {t("ledger.totalSettledVolume")}
              </span>
              <span className="font-serif text-2xl sm:text-3xl font-bold text-paper block">
                ₹{totalSettled.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
              <span className="text-brass text-[10px]">RAZORPAY TEST MANDATES</span>
            </div>

            <div className="p-4 rounded-xl bg-black/40 border border-line space-y-1">
              <span className="text-slate-400 text-[10px] block uppercase tracking-widest">
                {t("ledger.certifiedTransactions")}
              </span>
              <span className="font-serif text-2xl sm:text-3xl font-bold text-brass block">
                {paidCount} <span className="text-sm font-mono text-slate-400 font-normal">/ {transactions.length} total</span>
              </span>
              <span className="text-slate-400 text-[10px]">PALM MATCH CONFIRMED</span>
            </div>

            <div className="p-4 rounded-xl bg-black/40 border border-line space-y-1">
              <span className="text-slate-400 text-[10px] block uppercase tracking-widest">
                {t("ledger.securityRegime")}
              </span>
              <span className="font-mono text-lg font-semibold text-paper block pt-1">
                PALM BIOMETRIC 128-D
              </span>
              <span className="text-slate-400 text-[10px]">SECURE RECORD</span>
            </div>
          </div>
        </div>

        {/* Passbook Ledger Table */}
        <div className="w-full rounded-2xl bg-ink border border-line overflow-hidden shadow-2xl">
          
          <div className="px-6 py-4 bg-black/60 border-b border-line flex items-center justify-between font-mono text-xs text-brass">
            <span className="flex items-center gap-2 font-bold tracking-wider">
              <BookOpen className="w-4 h-4 text-brass" />
              {t("ledger.auditEntries")}
            </span>
            <span className="text-slate-400 text-[11px]">SORTED BY DATE (DESC)</span>
          </div>

          {isLoading ? (
            <div className="p-12 text-center font-mono text-xs text-slate-400 space-y-3">
              <RefreshCw className="w-6 h-6 animate-spin text-brass mx-auto" />
              <p>Fetching ledger records from SQLite database...</p>
            </div>
          ) : transactions.length === 0 ? (
            <div className="p-12 text-center font-mono text-xs text-slate-400 space-y-2">
              <Landmark className="w-8 h-8 text-brass/40 mx-auto" />
              <p className="text-paper font-semibold">No Passbook Entries Found</p>
              <p className="text-slate-500 text-[11px]">Perform a payment scan to record entries in the merchant ledger.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse font-mono text-xs">
                <thead>
                  <tr className="border-b border-line bg-ink/90 text-slate-400 text-[10px] uppercase tracking-wider">
                    <th className="py-3.5 px-6 font-semibold">{t("ledger.txnId")}</th>
                    <th className="py-3.5 px-6 font-semibold">{t("ledger.timestamp")}</th>
                    <th className="py-3.5 px-6 font-semibold">{t("ledger.customer")}</th>
                    <th className="py-3.5 px-6 font-semibold">{t("ledger.vpa")}</th>
                    <th className="py-3.5 px-6 font-semibold text-right">{t("ledger.amount")}</th>
                    <th className="py-3.5 px-6 font-semibold text-center">{t("ledger.status")}</th>
                    <th className="py-3.5 px-6 font-semibold">{t("ledger.razorpayRef")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-line/20 transition-colors">
                      <td className="py-4 px-6 font-semibold text-brass">
                        #{tx.id}
                      </td>
                      <td className="py-4 px-6 text-slate-400 text-[11px]">
                        {tx.created_at ? new Date(tx.created_at).toLocaleString("en-IN") : "N/A"}
                      </td>
                      <td className="py-4 px-6 text-paper font-serif font-bold text-sm">
                        {tx.customer_name}
                      </td>
                      <td className="py-4 px-6 text-slate-300">
                        {tx.masked_upi}
                      </td>
                      <td className="py-4 px-6 text-right font-semibold text-paper text-sm">
                        ₹{(tx.amount_rupees || 0).toFixed(2)}
                      </td>
                      <td className="py-4 px-6 text-center">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                            tx.status === "paid"
                              ? "bg-brass/20 text-brass border border-brass/40"
                              : tx.status === "amount_set"
                              ? "bg-blue-900/30 text-blue-300 border border-blue-800"
                              : "bg-vein/30 text-vein-bright border border-vein"
                          }`}
                        >
                          {tx.status === "paid" ? (
                            <>
                              <CheckCircle2 className="w-3 h-3 text-brass" />
                              PAID
                            </>
                          ) : (
                            <>
                              <AlertCircle className="w-3 h-3 text-vein-bright" />
                              {tx.status}
                            </>
                          )}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-slate-400 text-[11px]">
                        {tx.razorpay_payment_id}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
