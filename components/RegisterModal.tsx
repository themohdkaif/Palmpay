"use client";

import React, { useState, useRef } from "react";
import Webcam from "react-webcam";
import { User, Phone, Mail, CreditCard, RefreshCw, CheckCircle2, AlertCircle, X, Shield, Landmark, ArrowRight, ArrowLeft, FileText } from "lucide-react";
import { registerCustomer } from "@/lib/api-client";
import { RegisterFormData, RegisterResponse } from "@/lib/types";
import { validateEmail, validatePhone, validateUpiVpa } from "@/lib/validation";
import { VeinGuilloché } from "@/components/VeinGuilloché";
import { useLanguage } from "@/lib/i18n/LanguageContext";

interface RegisterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const RegisterModal: React.FC<RegisterModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const webcamRef = useRef<Webcam | null>(null);
  const { t } = useLanguage();

  const [step, setStep] = useState<"form" | "consent" | "capture">("form");

  const [formData, setFormData] = useState<RegisterFormData>({
    name: "",
    contact: "",
    email: "",
    upi_vpa: "",
  });

  const [consentChecked, setConsentChecked] = useState<boolean>(false);
  const [consentTimestamp, setConsentTimestamp] = useState<string | null>(null);

  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [registrationResult, setRegistrationResult] = useState<RegisterResponse | null>(null);

  if (!isOpen) return null;

  const phoneValidation = validatePhone(formData.contact);
  const emailValidation = validateEmail(formData.email);
  const isNameValid = formData.name.trim().length >= 2;
  const isUpiValid = /^[\w.-]+@[\w.-]+$/.test(formData.upi_vpa.trim());

  const isFormValid = isNameValid && phoneValidation.valid && emailValidation.valid && isUpiValid;

  const handleGoToConsent = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!isNameValid) return setErrorMessage("Full Name is required (minimum 2 characters)");
    if (!phoneValidation.valid) return setErrorMessage(phoneValidation.reason || "Invalid phone number");
    if (!emailValidation.valid) return setErrorMessage(emailValidation.reason || "Invalid email address");
    if (!isUpiValid) return setErrorMessage("Enter a valid UPI ID (e.g. name@bank)");

    setStep("consent");
  };

  const handleConfirmConsent = () => {
    if (!consentChecked) return;
    // Temporary workaround for backend Python 3.10 datetime.fromisoformat parsing: replace trailing 'Z' with '+00:00'
    // Note: Can be removed once backend is updated or running on Python 3.11+
    const nowIso = new Date().toISOString().replace("Z", "+00:00");
    setConsentTimestamp(nowIso);
    setStep("capture");
  };

  const handleCapturePhoto = () => {
    if (webcamRef.current) {
      const screenshot = webcamRef.current.getScreenshot();
      setCapturedImage(screenshot);
    }
  };

  const handleFinalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      // Clean phone number format before submitting (+91 prefixing if needed)
      const cleanPhone = formData.contact.trim().replace(/[\s\-\+\(\)]/g, "");
      const formattedData: RegisterFormData = {
        ...formData,
        contact: cleanPhone.startsWith("91") ? `+${cleanPhone}` : `+91${cleanPhone}`,
        consent_given_at: (consentTimestamp || new Date().toISOString()).replace("Z", "+00:00"),
        consent_version: "v1.0_DPDP_2023",
      };

      const result = await registerCustomer(formattedData, capturedImage);
      setRegistrationResult(result);
      setIsSubmitting(false);
    } catch (err: any) {
      setIsSubmitting(false);
      setErrorMessage(err.message || "Registration failed. Please check inputs and retry.");
    }
  };

  const resetModalState = () => {
    setStep("form");
    setConsentChecked(false);
    setConsentTimestamp(null);
    setCapturedImage(null);
    setErrorMessage(null);
    setRegistrationResult(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="relative w-full max-w-lg rounded-2xl bg-ink border-2 border-brass/60 p-6 sm:p-8 text-paper shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
        
        {/* Header Bar */}
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div className="flex items-center gap-2">
            <Landmark className="w-5 h-5 text-brass" />
            <h3 className="font-serif text-xl font-bold tracking-tight">
              {t("register.modalTitle")}
            </h3>
          </div>
          <button
            onClick={resetModalState}
            className="p-1 rounded-lg text-slate-400 hover:text-paper hover:bg-line/40 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Progress Stepper Bar */}
        {!registrationResult && (
          <div className="grid grid-cols-3 gap-2 font-mono text-[10px] uppercase tracking-wider text-center border-b border-line pb-3">
            <div className={`py-1 rounded border transition-colors ${step === "form" ? "bg-brass/20 text-brass border-brass" : "bg-black/40 text-slate-500 border-line"}`}>
              1. {t("register.fullName").split(" ")[0]}
            </div>
            <div className={`py-1 rounded border transition-colors ${step === "consent" ? "bg-brass/20 text-brass border-brass" : "bg-black/40 text-slate-500 border-line"}`}>
              2. DPDP CONSENT
            </div>
            <div className={`py-1 rounded border transition-colors ${step === "capture" ? "bg-brass/20 text-brass border-brass" : "bg-black/40 text-slate-500 border-line"}`}>
              3. PALM SCAN
            </div>
          </div>
        )}

        {registrationResult ? (
          /* Mandate Approval Required State */
          <div className="space-y-6 text-center py-4">
            <div className="w-16 h-16 rounded-full bg-brass/20 border border-brass flex items-center justify-center mx-auto text-brass">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h4 className="font-serif text-2xl font-bold text-paper">
                {t("register.enrolledSuccess")}
              </h4>
              <p className="text-xs font-mono text-slate-300 max-w-sm mx-auto leading-relaxed">
                Customer ID: <span className="text-brass">#{registrationResult.customer_id}</span>
              </p>
            </div>

            {/* Mandate Notice Box */}
            <div className="p-4 rounded-xl bg-black/50 border border-brass/40 text-left space-y-2 font-mono text-xs">
              <span className="text-brass font-bold flex items-center gap-1.5">
                <Shield className="w-4 h-4" />
                {t("register.mandateRequired")}
              </span>
              <p className="text-slate-300 text-[11px] leading-relaxed">
                {registrationResult.message}
              </p>
              <p className="text-slate-400 text-[10px] pt-1 border-t border-line/60">
                Order ID: {registrationResult.mandate_order_id}
              </p>
            </div>

            <button
              onClick={() => {
                onSuccess();
                resetModalState();
              }}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-brass via-brass-bright to-brass text-ink font-serif font-bold text-base shadow-brass-glow hover:shadow-[0_0_20px_rgba(176,141,70,0.5)] transition-all"
            >
              {t("register.proceedToPaymentScan")}
            </button>
          </div>
        ) : step === "form" ? (
          /* STEP 1: Registration Form Inputs */
          <form onSubmit={handleGoToConsent} className="space-y-4">
            {errorMessage && (
              <div className="p-3 rounded-xl bg-vein/30 border border-vein text-vein-bright font-mono text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Input Fields */}
            <div className="space-y-3 font-mono text-xs">
              {/* Full Name */}
              <div className="space-y-1">
                <label className="text-slate-400 flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-brass" />
                    {t("register.fullName")}
                  </span>
                  {!isNameValid && formData.name.length > 0 && (
                    <span className="text-vein-bright text-[10px]">Min 2 characters</span>
                  )}
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Aditya Sharma"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-line text-paper placeholder-slate-600 focus:outline-none focus:border-brass transition-colors"
                />
              </div>

              {/* Phone / Contact */}
              <div className="space-y-1">
                <label className="text-slate-400 flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-brass" />
                    {t("register.contactPhone")}
                  </span>
                </label>
                <input
                  type="tel"
                  required
                  value={formData.contact}
                  onChange={(e) => setFormData({ ...formData, contact: e.target.value })}
                  placeholder="e.g. 9876543210"
                  maxLength={13}
                  className={`w-full px-3.5 py-2.5 rounded-xl bg-black/50 border text-paper placeholder-slate-600 focus:outline-none transition-colors ${
                    formData.contact.length > 0 && !phoneValidation.valid
                      ? "border-vein/70 focus:border-vein"
                      : "border-line focus:border-brass"
                  }`}
                />
                {formData.contact.length > 0 && !phoneValidation.valid && (
                  <p className="text-vein-bright text-[10px] pt-0.5">{phoneValidation.reason || t("register.phoneHelp")}</p>
                )}
              </div>

              {/* Email */}
              <div className="space-y-1">
                <label className="text-slate-400 flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-brass" />
                    {t("register.emailAddress")}
                  </span>
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="e.g. aditya@gmail.com"
                  className={`w-full px-3.5 py-2.5 rounded-xl bg-black/50 border text-paper placeholder-slate-600 focus:outline-none transition-colors ${
                    formData.email.length > 0 && !emailValidation.valid
                      ? "border-vein/70 focus:border-vein"
                      : "border-line focus:border-brass"
                  }`}
                />
                {formData.email.length > 0 && !emailValidation.valid && (
                  <p className="text-vein-bright text-[10px] pt-0.5">{emailValidation.reason || t("register.emailHelp")}</p>
                )}
              </div>

              {/* UPI VPA */}
              <div className="space-y-1">
                <label className="text-slate-400 flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-brass" />
                    {t("register.linkedUpiVpa")}
                  </span>
                  {formData.upi_vpa.length > 0 && !isUpiValid && (
                    <span className="text-vein-bright text-[10px]">{t("register.upiHelp")}</span>
                  )}
                </label>
                <input
                  type="text"
                  required
                  value={formData.upi_vpa}
                  onChange={(e) => setFormData({ ...formData, upi_vpa: e.target.value })}
                  placeholder="e.g. aditya@hdfcbank"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-black/50 border border-line text-paper placeholder-slate-600 focus:outline-none focus:border-brass transition-colors"
                />
              </div>
            </div>

            {/* Step 1 Submit: Proceed to Consent */}
            <div className="pt-3">
              <button
                type="submit"
                disabled={!isFormValid}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-brass via-brass-bright to-brass text-ink font-serif font-bold text-base shadow-brass-glow hover:shadow-[0_0_20px_rgba(176,141,70,0.5)] transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span>{t("register.continueToConsent")}</span>
              </button>
            </div>
          </form>
        ) : step === "consent" ? (
          /* STEP 2: Biometric Data Processing Consent Disclosure (DPDP Act 2023) */
          <div className="space-y-5">
            {/* Vault & Vein Document-Styled Disclosure Panel */}
            <div className="rounded-xl bg-black/60 border border-brass/40 p-4 sm:p-5 space-y-4 relative overflow-hidden">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <span className="font-serif font-bold text-paper text-base flex items-center gap-2">
                  <Shield className="w-4 h-4 text-brass" />
                  {t("register.consentTitle")}
                </span>
                <span className="font-mono text-[9px] text-brass border border-brass/40 px-2 py-0.5 rounded uppercase">
                  DPDP 2023
                </span>
              </div>

              {/* Plain-Language Document Disclosure Clauses */}
              <div className="space-y-3 font-mono text-xs text-slate-300 leading-relaxed">
                <div className="p-2.5 rounded-lg bg-ink/60 border border-line/60">
                  <p className="text-paper text-[11px]">
                    <strong className="text-brass">1. {t("register.consentPoint1").split(":")[0]}:</strong>{" "}
                    {t("register.consentPoint1").split(":")[1]}
                  </p>
                </div>

                <div className="p-2.5 rounded-lg bg-ink/60 border border-line/60">
                  <p className="text-paper text-[11px]">
                    <strong className="text-brass">2. {t("register.consentPoint2").split(":")[0]}:</strong>{" "}
                    {t("register.consentPoint2").split(":")[1]}
                  </p>
                </div>

                <div className="p-2.5 rounded-lg bg-ink/60 border border-line/60">
                  <p className="text-paper text-[11px]">
                    <strong className="text-brass">3. {t("register.consentPoint3").split(":")[0]}:</strong>{" "}
                    {t("register.consentPoint3").split(":")[1]}
                  </p>
                </div>

                <div className="p-2.5 rounded-lg bg-ink/60 border border-line/60">
                  <p className="text-paper text-[11px]">
                    <strong className="text-brass">4. {t("register.consentPoint4").split(":")[0]}:</strong>{" "}
                    {t("register.consentPoint4").split(":")[1]}
                  </p>
                </div>
              </div>
            </div>

            {/* Interactive Required Consent Checkbox */}
            <div className="p-4 rounded-xl bg-ink/90 border border-line hover:border-brass/50 transition-colors space-y-2">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consentChecked}
                  onChange={(e) => setConsentChecked(e.target.checked)}
                  className="mt-1 w-4 h-4 accent-brass bg-black border-brass rounded focus:ring-0 cursor-pointer shrink-0"
                />
                <span className="font-mono text-xs text-paper leading-snug">
                  {t("register.consentCheckbox")}
                </span>
              </label>
            </div>

            {/* Action Row: Confirm & Go Back */}
            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={handleConfirmConsent}
                disabled={!consentChecked}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-brass via-brass-bright to-brass text-ink font-serif font-bold text-base shadow-brass-glow hover:shadow-[0_0_20px_rgba(176,141,70,0.5)] transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed border border-brass-bright/50"
              >
                <span>{t("register.confirmConsentButton")}</span>
              </button>

              <button
                type="button"
                onClick={() => setStep("form")}
                className="w-full py-3 rounded-xl bg-ink/60 border border-line text-slate-400 hover:text-paper font-mono text-xs flex items-center justify-center gap-2 transition-colors"
              >
                <ArrowLeft className="w-4 h-4 text-brass" />
                <span>{t("register.goBackButton")}</span>
              </button>
            </div>
          </div>
        ) : (
          /* STEP 3: Camera Capture & Enrolment Submit */
          <form onSubmit={handleFinalSubmit} className="space-y-4">
            {errorMessage && (
              <div className="p-3 rounded-xl bg-vein/30 border border-vein text-vein-bright font-mono text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Embedded Webcam Photo Capture Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between font-mono text-[11px] text-slate-400">
                <span>{t("register.palmCapture")}</span>
                <span className="text-brass font-semibold">CONSENT RECORDED ✓</span>
              </div>

              <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden bg-black border border-line flex items-center justify-center">
                {capturedImage ? (
                  <img src={capturedImage} alt="Captured Palm" className="w-full h-full object-cover" />
                ) : (
                  <Webcam
                    ref={webcamRef}
                    audio={false}
                    screenshotFormat="image/jpeg"
                    screenshotQuality={0.95}
                    videoConstraints={{
                      width: { ideal: 1280 },
                      height: { ideal: 720 },
                      facingMode: "user",
                    }}
                    className="w-full h-full object-cover filter contrast-[1.1]"
                  />
                )}
                
                <div className="absolute inset-0 pointer-events-none p-4 flex items-center justify-center opacity-30">
                  <VeinGuilloché className="w-32 h-32 text-brass" strokeColor="#B08D46" />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCapturePhoto}
                  className="w-full py-2 rounded-lg bg-line/60 hover:bg-line text-paper font-mono text-xs flex items-center justify-center gap-1.5 border border-line"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-brass" />
                  {capturedImage ? t("register.retakePhotoButton") : t("register.captureButton")}
                </button>
              </div>
            </div>

            {/* Final Enrolment Submit Button */}
            <div className="pt-2 space-y-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-brass via-brass-bright to-brass text-ink font-serif font-bold text-base shadow-brass-glow hover:shadow-[0_0_20px_rgba(176,141,70,0.5)] transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    {t("register.submitting")}
                  </>
                ) : (
                  <>
                    <Landmark className="w-4 h-4" />
                    {t("register.submitButton")}
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setStep("consent")}
                disabled={isSubmitting}
                className="w-full py-2.5 rounded-xl bg-ink/60 border border-line text-slate-400 hover:text-paper font-mono text-xs flex items-center justify-center gap-2 transition-colors"
              >
                <ArrowLeft className="w-4 h-4 text-brass" />
                <span>{t("register.goBackButton")}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
