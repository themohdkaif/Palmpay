"use client";

import React, { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { ScanFrame } from "@/components/ScanFrame";
import { AmountEntry } from "@/components/AmountEntry";
import { RegisterModal } from "@/components/RegisterModal";
import { PageTransition } from "@/components/PageTransition";
import { usePalmPayStore } from "@/lib/store";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { identifyPalm, setSessionAmount, authorizePalm } from "@/lib/api-client";
import { animateDetailsReveal } from "@/lib/gsap-animations";
import { ShieldCheck, User, Building2, CreditCard, ArrowRight, RefreshCw, AlertCircle, CheckCircle2, Landmark, UserPlus } from "lucide-react";
import gsap from "gsap";

export default function ScanPage() {
  const router = useRouter();
  const {
    amount,
    setAmount,
    sessionId,
    setSessionId,
    identifiedCustomer,
    setIdentifiedCustomer,
    setAuthorizeResult,
    shouldSimulateFailure,
    setShouldSimulateFailure,
  } = usePalmPayStore();

  const { t } = useLanguage();

  const [step, setStep] = useState<"identify" | "amount_confirm" | "authorize">("identify");
  const [statusText, setStatusText] = useState<string>(t("scan.statusPosition"));
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isFailed, setIsFailed] = useState<boolean>(false);
  const [failureReason, setFailureReason] = useState<"no_hand" | "not_recognized" | "mismatch">("not_recognized");
  const [isRegisterOpen, setIsRegisterOpen] = useState<boolean>(false);
  const [isValidAmount, setIsValidAmount] = useState<boolean>(amount >= 1 && amount <= 100);
  const detailsContainerRef = useRef<HTMLDivElement | null>(null);

  // Status text cycle helper
  const startStatusCycle = (modeLabel: string) => {
    setStatusText(t("scan.statusPosition"));
    setTimeout(() => {
      setStatusText(t("scan.statusEtching"));
    }, 900);
    setTimeout(() => {
      setStatusText(t("scan.statusVerifying"));
    }, 1800);
  };

  // Step 1: Scan 1 (Identify) Handler
  const handleIdentifyScan = async (imageBase64: string | null, isFailureSimulated?: boolean) => {
    setIsScanning(true);
    setIsFailed(false);
    startStatusCycle("Scan 1: Identify");

    try {
      if (isFailureSimulated || shouldSimulateFailure) {
        throw new Error("Simulated palm pattern mismatch");
      }

      const res = await identifyPalm(imageBase64);

      if (res.matched && res.session_id) {
        setIdentifiedCustomer(res);
        setSessionId(res.session_id);
        setIsScanning(false);
        setStep("amount_confirm");
        setStatusText(t("scan.statusIdentified"));

        setTimeout(() => {
          if (detailsContainerRef.current) {
            animateDetailsReveal(detailsContainerRef.current);
          }
        }, 100);
      } else {
        setIsScanning(false);
        setIsFailed(true);
        setFailureReason("not_recognized");
        setStatusText(t("scan.statusNotRecognized"));
      }
    } catch (err: any) {
      setIsScanning(false);
      setIsFailed(true);
      const errMsg = err.message || "";
      if (errMsg.toLowerCase().includes("no hand")) {
        setFailureReason("no_hand");
        setStatusText(t("scan.statusNoHand"));
      } else {
        setFailureReason("not_recognized");
        setStatusText(t("scan.statusNotRecognized"));
      }
    }
  };

  // Step 2: Set Amount & Proceed to Authorize Handler
  const handleProceedToAuthorize = async () => {
    if (!sessionId || !isValidAmount || amount < 1 || amount > 100) return;
    setIsScanning(true);
    setStatusText(t("scan.statusEtching"));

    try {
      await setSessionAmount(sessionId, amount);
      setIsScanning(false);
      setStep("authorize");
      setStatusText(t("scan.statusPosition"));
    } catch (err: any) {
      setIsScanning(false);
      alert(err.message || "Failed to set amount for session.");
    }
  };

  // Step 3: Scan 2 (Authorize) Handler
  const handleAuthorizeScan = async (imageBase64: string | null) => {
    if (!sessionId) return;
    setIsScanning(true);
    setIsFailed(false);
    startStatusCycle("Scan 2: Authorize");

    try {
      const authRes = await authorizePalm(sessionId, imageBase64);

      if (authRes.status === "paid") {
        setAuthorizeResult(authRes);

        // GSAP page exit transition to receipt
        const mainContainer = document.getElementById("scan-page-container");
        if (mainContainer) {
          gsap.to(mainContainer, {
            opacity: 0,
            y: -20,
            duration: 0.4,
            ease: "power2.in",
            onComplete: () => {
              router.push("/receipt");
            },
          });
        } else {
          router.push("/receipt");
        }
      } else {
        setIsScanning(false);
        setIsFailed(true);
        setFailureReason("mismatch");
        setStatusText(t("scan.statusMismatch"));
      }
    } catch (err: any) {
      setIsScanning(false);
      setIsFailed(true);
      const errMsg = err.message || "";
      if (errMsg.toLowerCase().includes("no hand")) {
        setFailureReason("no_hand");
        setStatusText(t("scan.statusNoHand"));
      } else {
        setFailureReason("mismatch");
        setStatusText(t("scan.statusMismatch"));
      }
    }
  };

  const handleRetryScan = () => {
    setIsFailed(false);
    setIsScanning(false);
    setStatusText(t("scan.statusPosition"));
  };

  const handleBackToIdentify = () => {
    setIsFailed(false);
    setIsScanning(false);
    setStep("identify");
    setStatusText(t("scan.statusPosition"));
  };

  return (
    <PageTransition>
      <div id="scan-page-container" className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          
          {/* Column 1: Live Camera Viewfinder (Unified Shared ScanFrame Component) */}
          <div className="lg:col-span-6 flex flex-col items-center w-full">
            <div className="text-center mb-6">
              <span className="font-mono text-xs text-brass uppercase tracking-widest block mb-1">
                {step === "authorize" ? t("scan.step2Tag") : t("scan.step1Tag")}
              </span>
              <h2 className="font-serif text-2xl sm:text-3xl font-bold text-paper tracking-tight">
                {step === "authorize" ? t("scan.step2Title") : t("scan.step1Title")}
              </h2>
            </div>

            <ScanFrame
              mode={step === "authorize" ? "authorize" : "identify"}
              onCaptureAndScan={step === "authorize" ? handleAuthorizeScan : handleIdentifyScan}
              statusText={statusText}
              isScanning={isScanning}
              isFailed={isFailed}
              failureReason={failureReason}
              onRetry={handleRetryScan}
              onRegister={() => setIsRegisterOpen(true)}
              onBackToIdentify={handleBackToIdentify}
              amount={amount}
              shouldSimulateFailure={shouldSimulateFailure}
              setShouldSimulateFailure={setShouldSimulateFailure}
            />
          </div>

          {/* Column 2: Customer Readout & Two-Step Progression */}
          <div className="lg:col-span-6 flex flex-col items-center justify-center w-full min-h-[450px]">
            
            {/* Step 1 Result: Customer Identified -> Confirm Amount */}
            {identifiedCustomer && step === "amount_confirm" ? (
              <div
                ref={detailsContainerRef}
                className="w-full max-w-sm sm:max-w-md rounded-2xl bg-ink border-2 border-brass/50 p-6 sm:p-8 shadow-2xl space-y-6"
              >
                {/* Header */}
                <div className="detail-row flex items-center justify-between pb-4 border-b border-line">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-brass shrink-0" />
                    <span className="font-serif font-bold text-lg text-paper">{t("scan.customerIdentified")}</span>
                  </div>
                  <span className="font-mono text-xs font-semibold text-ink bg-brass px-3 py-1 rounded shadow-sm">
                    {((identifiedCustomer.confidence || 0.97) * 100).toFixed(0)}% {t("scan.matchConfidence")}
                  </span>
                </div>

                {/* Identified Customer Readout */}
                <div className="space-y-3 font-mono text-xs">
                  <div className="detail-row grid grid-cols-2 gap-4 items-center p-3.5 rounded-xl bg-black/50 border border-line">
                    <span className="text-slate-400 flex items-center gap-2">
                      <User className="w-4 h-4 text-brass shrink-0" />
                      <span>{t("scan.holder")}</span>
                    </span>
                    <span className="font-semibold text-paper text-right truncate">
                      {identifiedCustomer.name}
                    </span>
                  </div>

                  <div className="detail-row grid grid-cols-2 gap-4 items-center p-3.5 rounded-xl bg-black/50 border border-line">
                    <span className="text-slate-400 flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-brass shrink-0" />
                      <span>{t("scan.linkedVpa")}</span>
                    </span>
                    <span className="font-semibold text-paper text-right truncate">
                      {identifiedCustomer.masked_upi}
                    </span>
                  </div>
                </div>

                {/* Amount Entry Component with ₹100 Mandate Cap */}
                <div className="detail-row pt-2">
                  <AmountEntry
                    amount={amount}
                    onChangeAmount={setAmount}
                    isValid={isValidAmount}
                    setIsValid={setIsValidAmount}
                  />
                </div>

                {/* Proceed to Scan 2 Button */}
                <div className="detail-row pt-2">
                  <button
                    onClick={handleProceedToAuthorize}
                    disabled={!isValidAmount || amount < 1 || amount > 100}
                    className="w-full py-4 rounded-xl bg-gradient-to-r from-brass via-brass-bright to-brass text-ink font-serif font-bold text-base sm:text-lg shadow-brass-glow hover:shadow-[0_0_25px_rgba(176,141,70,0.5)] transition-all flex items-center justify-center gap-3 disabled:opacity-50 border border-brass-bright/50"
                  >
                    <span>{t("scan.proceedToScan2")}</span>
                    <ArrowRight className="w-5 h-5 shrink-0" />
                  </button>
                </div>
              </div>
            ) : step === "authorize" && identifiedCustomer ? (
              /* Step 2: Awaiting Scan 2 (Authorize) */
              <div className="w-full max-w-sm sm:max-w-md rounded-2xl bg-ink border-2 border-brass/50 p-6 sm:p-8 shadow-2xl space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-line">
                  <span className="font-serif font-bold text-lg text-paper">{t("scan.step2Title")}</span>
                  <span className="font-mono text-xs text-brass">₹{amount.toFixed(2)} INR</span>
                </div>

                <div className="p-4 rounded-xl bg-black/50 border border-line text-center space-y-2">
                  <span className="font-mono text-xs text-slate-400 block">{t("scan.remitterIdentity")}</span>
                  <span className="font-serif text-xl font-bold text-paper block">{identifiedCustomer.name}</span>
                  <span className="font-mono text-xs text-brass block">{identifiedCustomer.masked_upi}</span>
                </div>

                <div className="p-4 rounded-xl bg-brass/10 border border-brass/30 text-center font-mono text-xs text-paper space-y-1">
                  <span className="text-brass font-bold block">{t("scan.actionRequired")}</span>
                  <p className="text-slate-300 text-[11px]">
                    {t("scan.pressAuthInstruction")}
                  </p>
                </div>
              </div>
            ) : isFailed ? (
              /* Failure Details Card */
              <div className="w-full max-w-sm sm:max-w-md rounded-2xl bg-ink border-2 border-vein p-6 sm:p-8 text-center space-y-5 shadow-2xl">
                <div className="w-16 h-16 rounded-full bg-vein/20 border border-vein flex items-center justify-center mx-auto text-vein-bright">
                  <AlertCircle className="w-8 h-8 animate-bounce" />
                </div>

                <div className="space-y-1">
                  <h3 className="font-serif text-2xl font-bold text-paper">
                    {failureReason === "no_hand"
                      ? t("scan.noHandTitle")
                      : failureReason === "mismatch"
                      ? t("scan.mismatchTitle")
                      : t("scan.notRecognizedTitle")}
                  </h3>
                  <p className="text-xs font-mono text-slate-300 max-w-xs mx-auto leading-relaxed">
                    {statusText}
                  </p>
                </div>

                {/* Quick Recovery Actions */}
                <div className="flex flex-col gap-3 pt-2">
                  <button
                    onClick={handleRetryScan}
                    className="w-full py-3.5 rounded-xl bg-ink border border-line hover:border-brass/40 text-paper font-mono text-xs flex items-center justify-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4 text-brass" />
                    {t("scan.retakeScanButton")}
                  </button>

                  {step === "identify" && (
                    <button
                      onClick={() => setIsRegisterOpen(true)}
                      className="w-full py-3.5 rounded-xl bg-gradient-to-r from-brass via-brass-bright to-brass text-ink font-serif font-bold text-sm shadow-brass-glow flex items-center justify-center gap-2 border border-brass-bright/50"
                    >
                      <UserPlus className="w-4 h-4" />
                      {t("scan.registerNewPalmButton")}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              /* Default Awaiting Scan 1 Card */
              <div className="w-full max-w-sm sm:max-w-md rounded-2xl bg-ink/80 border border-line p-6 sm:p-8 text-center flex flex-col items-center justify-center space-y-4 min-h-[400px]">
                <div className="w-16 h-16 rounded-xl bg-brass/10 border border-brass/30 flex items-center justify-center text-brass shadow-brass-glow">
                  <Landmark className="w-8 h-8 animate-pulse" />
                </div>
                <h3 className="font-serif text-xl font-semibold text-paper">
                  {t("scan.opticalViewfinder")}
                </h3>
                <p className="text-xs font-mono text-slate-400 max-w-xs leading-relaxed">
                  {t("scan.pressToScan")}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Vault & Vein Registration Modal */}
      <RegisterModal
        isOpen={isRegisterOpen}
        onClose={() => setIsRegisterOpen(false)}
        onSuccess={() => {
          setIsFailed(false);
          setStep("identify");
          setStatusText(t("scan.statusPosition"));
        }}
      />
    </PageTransition>
  );
}
