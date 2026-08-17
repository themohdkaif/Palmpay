"use client";

import React, { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { ScanFrame } from "@/components/ScanFrame";
import { AmountEntry } from "@/components/AmountEntry";
import { RegisterModal } from "@/components/RegisterModal";
import { PageTransition } from "@/components/PageTransition";
import { usePalmPayStore } from "@/lib/store";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { identifyPalm, setSessionAmount, authorizePalm, stepUpVerify } from "@/lib/api-client";
import { animateDetailsReveal } from "@/lib/gsap-animations";
import { ShieldCheck, User, Building2, CreditCard, ArrowRight, RefreshCw, AlertCircle, CheckCircle2, Landmark, UserPlus, Lock, KeyRound } from "lucide-react";
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

  // Step-Up Secondary Factor Modal State
  const [isStepUpOpen, setIsStepUpOpen] = useState<boolean>(false);
  const [stepUpPin, setStepUpPin] = useState<string>("");
  const [stepUpError, setStepUpError] = useState<string | null>(null);
  const [stepUpPrompt, setStepUpPrompt] = useState<string>("");
  const [isSubmittingStepUp, setIsSubmittingStepUp] = useState<boolean>(false);

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

        if (res.requires_step_up || res.status === "borderline") {
          setStepUpPrompt(res.step_up_prompt || "Borderline biometric confidence. Please confirm your 4-digit Security PIN or last 4 digits of phone number.");
          setIsStepUpOpen(true);
          return;
        }

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

      if (authRes.status === "borderline" || authRes.requires_step_up) {
        setIsScanning(false);
        setStepUpPrompt(authRes.step_up_prompt || "Borderline authorization scan detected. Please enter your 4-digit Security PIN or last 4 digits of phone number.");
        setIsStepUpOpen(true);
        return;
      }

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

  // Step-Up PIN Verification Submit Handler
  const handleStepUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionId || !stepUpPin.trim()) return;

    setStepUpError(null);
    setIsSubmittingStepUp(true);

    try {
      const res = await stepUpVerify(sessionId, stepUpPin.trim());

      setIsSubmittingStepUp(false);
      setIsStepUpOpen(false);
      setStepUpPin("");

      if (res.status === "paid" || res.receipt_url) {
        setAuthorizeResult(res);
        router.push("/receipt");
      } else {
        setStep("amount_confirm");
        setStatusText(t("scan.statusIdentified"));
      }
    } catch (err: any) {
      setIsSubmittingStepUp(false);
      setStepUpError(err.message || "Invalid security PIN or phone digits");
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

          {/* Column 2: Contextual Transaction & Verification Card */}
          <div className="lg:col-span-6 w-full">
            {step === "identify" && (
              <div className="rounded-2xl bg-ink border border-line p-6 sm:p-8 text-paper shadow-xl space-y-6">
                <div className="flex items-center gap-3 border-b border-line pb-4">
                  <div className="w-10 h-10 rounded-xl bg-brass/10 border border-brass/40 flex items-center justify-center text-brass">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-serif text-lg font-bold">{t("scan.biometricTerminal")}</h3>
                    <p className="text-xs font-mono text-slate-400">{t("scan.terminalDesc")}</p>
                  </div>
                </div>

                <div className="space-y-4 font-mono text-xs text-slate-300">
                  <div className="p-4 rounded-xl bg-black/40 border border-line/60 space-y-2">
                    <span className="text-brass font-semibold block">{t("scan.howItWorksTitle")}</span>
                    <ol className="list-decimal list-inside space-y-1.5 text-slate-400">
                      <li>{t("scan.howItWorks1")}</li>
                      <li>{t("scan.howItWorks2")}</li>
                      <li>{t("scan.howItWorks3")}</li>
                    </ol>
                  </div>

                  <div className="p-4 rounded-xl bg-vein/10 border border-vein/30 text-vein-bright space-y-1">
                    <span className="font-bold flex items-center gap-1.5">
                      <Landmark className="w-4 h-4" />
                      {t("scan.mandateCapNotice")}
                    </span>
                    <p className="text-[11px] leading-relaxed text-slate-300">
                      {t("scan.mandateCapDesc")}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setIsRegisterOpen(true)}
                  className="w-full py-3.5 rounded-xl bg-ink border border-brass/50 text-brass font-mono text-xs hover:bg-brass/10 transition-colors flex items-center justify-center gap-2"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>{t("scan.needToRegister")}</span>
                </button>
              </div>
            )}

            {step === "amount_confirm" && identifiedCustomer && (
              <div
                ref={detailsContainerRef}
                className="rounded-2xl bg-ink border-2 border-brass/60 p-6 sm:p-8 text-paper shadow-brass-glow space-y-6"
              >
                <div className="flex items-center justify-between border-b border-line pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-brass/20 border border-brass flex items-center justify-center text-brass font-serif font-bold text-xl">
                      {identifiedCustomer.name?.charAt(0) || "U"}
                    </div>
                    <div>
                      <h3 className="font-serif text-xl font-bold">{identifiedCustomer.name}</h3>
                      <span className="text-xs font-mono text-brass">
                        {t("scan.identityVerified")} ({(identifiedCustomer.confidence * 100).toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded bg-vein/20 border border-vein text-vein-bright font-mono text-[10px] uppercase">
                    MANDATE ACTIVE
                  </span>
                </div>

                <div className="space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-black/40 border border-line">
                    <span className="text-slate-400 flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-brass" />
                      {t("scan.linkedPaymentMethod")}
                    </span>
                    <span className="text-paper font-semibold">{identifiedCustomer.masked_upi}</span>
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-xl bg-black/40 border border-line">
                    <span className="text-slate-400 flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-brass" />
                      {t("scan.merchantRecipient")}
                    </span>
                    <span className="text-paper font-semibold">PalmPay Remittance Store</span>
                  </div>
                </div>

                {/* Amount Selection Component */}
                <AmountEntry
                  amount={amount}
                  onChangeAmount={setAmount}
                  isValid={isValidAmount}
                  setIsValid={setIsValidAmount}
                />

                <button
                  onClick={handleProceedToAuthorize}
                  disabled={!isValidAmount || isScanning}
                  className="w-full py-4 rounded-xl bg-gradient-to-r from-brass via-brass-bright to-brass text-ink font-serif font-bold text-base shadow-brass-glow hover:shadow-[0_0_25px_rgba(176,141,70,0.6)] transition-all flex items-center justify-center gap-2 disabled:opacity-40"
                >
                  <span>{t("scan.proceedToAuthorize")} (₹{amount.toFixed(2)})</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}

            {step === "authorize" && identifiedCustomer && (
              <div className="rounded-2xl bg-ink border border-brass/50 p-6 sm:p-8 text-paper shadow-xl space-y-6">
                <div className="flex items-center justify-between border-b border-line pb-4">
                  <div>
                    <h3 className="font-serif text-lg font-bold">{t("scan.step2Title")}</h3>
                    <p className="text-xs font-mono text-slate-400">{t("scan.step2Tag")}</p>
                  </div>
                  <div className="text-right">
                    <span className="font-mono text-xs text-slate-400 block">{t("scan.remittanceAmount")}</span>
                    <span className="font-mono text-xl font-bold text-brass">₹{amount.toFixed(2)}</span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-black/40 border border-line space-y-3 font-mono text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-400">{t("scan.customerName")}:</span>
                    <span className="text-paper font-semibold">{identifiedCustomer.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">{t("scan.mandateCapLabel")}:</span>
                    <span className="text-brass font-semibold">₹100.00 / txn</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Step-Up Verification Modal Overlay */}
        {isStepUpOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
            <div className="w-full max-w-md rounded-2xl bg-ink border-2 border-brass p-6 text-paper shadow-2xl space-y-5">
              <div className="flex items-center gap-3 border-b border-line pb-3">
                <div className="w-10 h-10 rounded-xl bg-brass/20 border border-brass flex items-center justify-center text-brass">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-serif text-lg font-bold">Secondary Verification Required</h3>
                  <span className="text-[10px] font-mono text-brass uppercase">Borderline Biometric Match</span>
                </div>
              </div>

              <p className="text-xs font-mono text-slate-300 leading-relaxed">
                {stepUpPrompt}
              </p>

              <form onSubmit={handleStepUpSubmit} className="space-y-4 font-mono text-xs">
                {stepUpError && (
                  <div className="p-3 rounded-xl bg-vein/30 border border-vein text-vein-bright flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{stepUpError}</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-slate-400 text-[11px] flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-brass" />
                    Security PIN or Phone Digits
                  </label>
                  <input
                    type="password"
                    autoFocus
                    required
                    value={stepUpPin}
                    onChange={(e) => setStepUpPin(e.target.value)}
                    placeholder="Enter 4-digit PIN or last 4 phone digits"
                    className="w-full px-4 py-3 rounded-xl bg-black/60 border border-brass/60 text-paper text-center font-mono text-base tracking-widest focus:outline-none focus:border-brass-bright"
                  />
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsStepUpOpen(false);
                      setIsScanning(false);
                      setIsFailed(true);
                      setStatusText("Step-up cancelled");
                    }}
                    className="w-1/3 py-3 rounded-xl bg-ink border border-line text-slate-400 hover:text-paper"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={isSubmittingStepUp || !stepUpPin.trim()}
                    className="w-2/3 py-3 rounded-xl bg-gradient-to-r from-brass via-brass-bright to-brass text-ink font-serif font-bold text-sm shadow-brass-glow disabled:opacity-40"
                  >
                    {isSubmittingStepUp ? "Verifying..." : "Confirm & Proceed"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Global Registration Modal */}
        <RegisterModal
          isOpen={isRegisterOpen}
          onClose={() => setIsRegisterOpen(false)}
          onSuccess={() => {
            setIsRegisterOpen(false);
            setStep("identify");
            setStatusText(t("scan.statusPosition"));
          }}
        />
      </div>
    </PageTransition>
  );
}
