"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import Webcam from "react-webcam";
import { RefreshCw, AlertTriangle, Shield, Zap, UserPlus, ArrowLeft, CheckCircle2, Hand } from "lucide-react";
import { useHandDetection } from "@/lib/hooks/useHandDetection";
import { animateLaserScan, animateScanFailure } from "@/lib/gsap-animations";
import { VeinGuilloché } from "@/components/VeinGuilloché";
import { usePalmPayStore } from "@/lib/store";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { playClickSound, playErrorSound } from "@/lib/audio";

export interface ScanFrameProps {
  mode: "identify" | "authorize";
  onCaptureAndScan: (imageBase64: string | null, isFailureSimulated?: boolean) => void;
  statusText: string;
  isScanning: boolean;
  isFailed: boolean;
  failureReason?: "no_hand" | "not_recognized" | "mismatch" | string;
  onRetry: () => void;
  onRegister?: () => void;
  onBackToIdentify?: () => void;
  amount?: number;
  shouldSimulateFailure: boolean;
  setShouldSimulateFailure: (val: boolean) => void;
}

export const ScanFrame: React.FC<ScanFrameProps> = ({
  mode,
  onCaptureAndScan,
  statusText,
  isScanning,
  isFailed,
  failureReason = "not_recognized",
  onRetry,
  onRegister,
  onBackToIdentify,
  amount = 50,
  shouldSimulateFailure,
  setShouldSimulateFailure,
}) => {
  const webcamRef = useRef<Webcam | null>(null);
  const laserRef = useRef<HTMLDivElement | null>(null);
  const frameContainerRef = useRef<HTMLDivElement | null>(null);
  const [cameraError, setCameraError] = useState<boolean>(false);

  const soundEnabled = usePalmPayStore((s) => s.soundEnabled);
  const { t } = useLanguage();

  // Primary Manual / Auto Trigger Handler
  const handleTriggerScan = useCallback(() => {
    if (isScanning) return;
    playClickSound(soundEnabled);

    let screenshot: string | null = null;
    if (webcamRef.current && !cameraError) {
      screenshot = webcamRef.current.getScreenshot();
    }
    onCaptureAndScan(screenshot, shouldSimulateFailure);
  }, [isScanning, cameraError, soundEnabled, onCaptureAndScan, shouldSimulateFailure]);

  // Decoupled Detection Logic Hook (Pure logic, zero JSX)
  const {
    isDetectorLoading,
    handState,
    detectionFeedback,
    holdProgress,
    resetDetection,
  } = useHandDetection({
    webcamRef,
    isScanning,
    isFailed,
    cameraError,
    onAutoTriggerCapture: handleTriggerScan,
  });

  // Handle Retry Action with Reset
  const handleRetryWithReset = () => {
    resetDetection();
    onRetry();
  };

  // GSAP Laser & Failure Animations
  useEffect(() => {
    let laserAnimation: gsap.core.Timeline | null = null;
    if (isScanning && laserRef.current) {
      laserAnimation = animateLaserScan(laserRef.current);
    }
    return () => {
      if (laserAnimation) laserAnimation.kill();
    };
  }, [isScanning]);

  useEffect(() => {
    if (isFailed && frameContainerRef.current) {
      animateScanFailure(frameContainerRef.current);
      playErrorSound(soundEnabled);
    }
  }, [isFailed, soundEnabled]);

  const getActionButtonLabel = () => {
    if (isScanning) {
      return mode === "authorize" ? t("scan.statusVerifying") : t("scan.statusEtching");
    }
    return mode === "authorize"
      ? `${t("scan.authRemittanceButton")} (₹${amount.toFixed(2)})`
      : t("scan.scanPalmButton");
  };

  return (
    <div className="flex flex-col items-center w-full max-w-sm sm:max-w-md mx-auto">
      
      {/* Mismatch Simulation Toggle Box (Vault & Vein Hairline Style) */}
      <div className="w-full mb-4 flex items-center justify-between px-4 py-2.5 rounded-xl bg-ink border border-line text-xs text-slate-300 font-mono">
        <span className="flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-brass shrink-0" />
          <span>Simulate Mismatch Pattern</span>
        </span>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={shouldSimulateFailure}
            onChange={(e) => setShouldSimulateFailure(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-vein" />
        </label>
      </div>

      {/* Engraved Metal Plate Viewfinder Container */}
      <div
        ref={frameContainerRef}
        className={`relative w-full aspect-[4/5] rounded-2xl overflow-hidden bg-ink border transition-all duration-500 shadow-2xl flex flex-col justify-between ${
          isFailed
            ? "border-vein shadow-[0_0_25px_rgba(122,46,46,0.4)]"
            : isScanning
            ? "border-brass shadow-brass-glow"
            : handState === "holding"
            ? "border-brass-bright shadow-[0_0_25px_rgba(212,175,106,0.5)]"
            : handState === "positioning"
            ? "border-brass/70"
            : "border-line shadow-2xl"
        }`}
      >
        {/* Live Camera Feed */}
        {!cameraError ? (
          <Webcam
            ref={webcamRef}
            audio={false}
            screenshotFormat="image/jpeg"
            screenshotQuality={0.95}
            videoConstraints={{
              facingMode: "user",
              width: { ideal: 1280 },
              height: { ideal: 720 },
            }}
            onUserMediaError={() => setCameraError(true)}
            className="absolute inset-0 w-full h-full object-cover filter contrast-[1.1] grayscale-[0.2]"
          />
        ) : (
          /* Fallback Sensor Display */
          <div className="absolute inset-0 w-full h-full flex flex-col items-center justify-center bg-ink p-6 text-center">
            <div className="w-24 h-24 rounded-full bg-brass/10 border border-brass/30 flex items-center justify-center mb-4 p-2 shadow-brass-glow">
              <VeinGuilloché className="w-full h-full text-brass" strokeColor="#B08D46" />
            </div>
            <p className="font-mono text-xs text-brass mb-1">OPTICAL VEIN SENSOR</p>
            <p className="text-xs text-slate-400 max-w-[220px]">Sensors active for live palm authentication.</p>
          </div>
        )}

        {/* Banknote Engraved Corner Flourishes & Live Overlay */}
        <div className="absolute inset-0 pointer-events-none p-5 flex flex-col justify-between z-10">
          
          {/* Engraved Brass Corner Brackets */}
          <svg className={`absolute inset-0 w-full h-full transition-colors duration-300 ${
            handState === "holding" ? "text-brass-bright" : "text-brass"
          }`} viewBox="0 0 100 100" preserveAspectRatio="none" fill="none">
            <path d="M 4 14 L 4 4 L 14 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
            <path d="M 8 4 L 8 10 L 4 10" stroke="currentColor" strokeWidth="0.75" />
            <path d="M 86 4 L 96 4 L 96 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
            <path d="M 92 4 L 92 10 L 96 10" stroke="currentColor" strokeWidth="0.75" />
            <path d="M 4 86 L 4 96 L 14 96" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
            <path d="M 8 96 L 8 90 L 4 90" stroke="currentColor" strokeWidth="0.75" />
            <path d="M 86 96 L 96 96 L 96 86" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" />
            <path d="M 92 96 L 92 90 L 96 90" stroke="currentColor" strokeWidth="0.75" />
          </svg>

          {/* Target Overlay & Auto-Capture Circular Progress Ring */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-10">
            <div className="relative w-40 h-40 sm:w-48 sm:h-48 flex items-center justify-center">
              {/* Circular Hold Progress Ring */}
              {handState === "holding" && (
                <svg className="absolute inset-0 w-full h-full -rotate-90 text-brass-bright" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="46"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeDasharray="289"
                    strokeDashoffset={289 - (289 * holdProgress) / 100}
                    className="transition-all duration-150 ease-linear"
                  />
                </svg>
              )}

              <VeinGuilloché
                className={`w-full h-full transition-opacity duration-300 ${
                  handState === "holding" ? "opacity-90 text-brass-bright" : "opacity-35 text-brass"
                }`}
                strokeColor={handState === "holding" ? "#D4AF6A" : "#B08D46"}
                animated={isScanning || handState === "holding"}
              />
            </div>
          </div>

          {/* Laser Etching Beam */}
          {isScanning && (
            <div
              ref={laserRef}
              className="absolute left-4 right-4 h-0.5 bg-gradient-to-r from-transparent via-brass-bright to-transparent shadow-[0_0_12px_#B08D46] z-20"
            />
          )}

          {/* Top Header Tag Banner */}
          <div className="relative z-20 flex items-center justify-between w-full">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded bg-ink border border-brass/40 text-[11px] font-mono text-paper">
              <Shield className="w-3.5 h-3.5 text-brass" />
              <span>{mode === "authorize" ? t("scan.step2Tag") : t("scan.step1Tag")}</span>
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1 rounded bg-ink border border-line text-[11px] font-mono">
              <span className={`w-2 h-2 rounded-full ${
                isScanning
                  ? "bg-brass animate-ping"
                  : isFailed
                  ? "bg-vein"
                  : handState === "holding"
                  ? "bg-brass-bright animate-pulse"
                  : "bg-brass"
              }`} />
              <span className="text-paper">
                {isDetectorLoading
                  ? "Initializing Sensor..."
                  : isScanning
                  ? t("scan.etching")
                  : isFailed
                  ? t("scan.retryNeeded")
                  : handState === "holding"
                  ? `Holding (${holdProgress}%)`
                  : t("scan.cameraReady")}
              </span>
            </div>
          </div>

          {/* Bottom Status Engraved Plate */}
          <div className="relative z-20 w-full text-center">
            <div className={`px-4 py-2.5 rounded-xl border transition-all duration-300 ${
              isFailed
                ? "bg-ink border-vein text-paper shadow-[0_0_15px_rgba(122,46,46,0.5)]"
                : isScanning
                ? "bg-ink border-brass text-brass shadow-brass-glow"
                : handState === "holding"
                ? "bg-ink border-brass-bright text-brass-bright shadow-[0_0_15px_rgba(212,175,106,0.4)]"
                : "bg-ink border-line text-slate-300"
            }`}>
              <div className="flex items-center justify-center gap-2 font-mono text-xs">
                {isScanning ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-brass shrink-0" />
                ) : isFailed ? (
                  <AlertTriangle className="w-4 h-4 text-vein-bright shrink-0" />
                ) : handState === "holding" ? (
                  <CheckCircle2 className="w-4 h-4 text-brass-bright animate-pulse shrink-0" />
                ) : handState === "positioning" ? (
                  <Hand className="w-4 h-4 text-brass shrink-0" />
                ) : (
                  <VeinGuilloché className="w-4 h-4 text-brass shrink-0" strokeColor="#B08D46" />
                )}
                <span className="truncate">
                  {isScanning
                    ? statusText
                    : isFailed
                    ? statusText
                    : detectionFeedback || statusText}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons Section */}
      <div className="w-full mt-6 space-y-3">
        {isFailed ? (
          /* Failed Recovery Inset Options */
          <div className="space-y-3">
            <button
              onClick={handleRetryWithReset}
              className="w-full py-3.5 rounded-xl bg-ink border border-line hover:border-brass/50 hover:bg-line/30 text-paper font-mono text-xs transition-all duration-200 flex items-center justify-center gap-2 shadow-sm active:scale-[0.99]"
            >
              <RefreshCw className="w-4 h-4 text-brass" />
              <span>{t("scan.retakeScanButton")}</span>
            </button>

            {mode === "identify" && onRegister && (
              <button
                onClick={onRegister}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-brass via-brass-bright to-brass text-ink font-serif font-bold text-sm shadow-brass-glow flex items-center justify-center gap-2 border border-brass-bright/50 active:scale-[0.98] transition-transform"
              >
                <UserPlus className="w-4.5 h-4.5" />
                <span>{t("scan.registerNewPalmButton")}</span>
              </button>
            )}

            {mode === "authorize" && onBackToIdentify && (
              <button
                onClick={onBackToIdentify}
                className="w-full py-3 rounded-xl bg-ink border border-line text-slate-400 hover:text-paper font-mono text-xs flex items-center justify-center gap-2 transition-colors"
              >
                <ArrowLeft className="w-4 h-4 text-brass" />
                <span>{t("scan.returnToScan1")}</span>
              </button>
            )}
          </div>
        ) : (
          /* Primary Engraved Brass Authenticate Fallback Button */
          <button
            onClick={handleTriggerScan}
            disabled={isScanning}
            className="w-full py-4.5 rounded-xl bg-gradient-to-r from-brass via-brass-bright to-brass text-ink font-serif font-bold text-base sm:text-lg border-2 border-brass-bright/60 shadow-brass-glow hover:shadow-[0_0_30px_rgba(176,141,70,0.6)] hover:-translate-y-[1px] active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-60"
          >
            {isScanning ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin text-ink shrink-0" />
                <span>{getActionButtonLabel()}</span>
              </>
            ) : (
              <>
                <VeinGuilloché className="w-5 h-5 stroke-[2] shrink-0" strokeColor="#0F1A14" />
                <span>{getActionButtonLabel()}</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};
