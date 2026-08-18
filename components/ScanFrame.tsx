"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import Webcam from "react-webcam";
import { RefreshCw, AlertTriangle, Shield, Zap, UserPlus, ArrowLeft, CheckCircle2, Hand, Smartphone, Wifi } from "lucide-react";
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
  const pairedTerminalId = usePalmPayStore((s) => s.pairedTerminalId);
  const terminalWs = usePalmPayStore((s) => s.terminalWs);
  const remoteVideoFrame = usePalmPayStore((s) => s.remoteVideoFrame);
  const remoteCaptureFrames = usePalmPayStore((s) => s.remoteCaptureFrames);
  const clearTerminalPairing = usePalmPayStore((s) => s.clearTerminalPairing);
  const { t } = useLanguage();

  const isRemoteTerminal = Boolean(pairedTerminalId);

  // Primary Manual / Auto Trigger Handler
  const handleTriggerScan = useCallback(() => {
    if (isScanning) return;
    playClickSound(soundEnabled);

    if (isRemoteTerminal && terminalWs) {
      // 1. Send start_scan command over WebSocket to Pi terminal
      try {
        terminalWs.send(JSON.stringify({
          type: "start_scan",
          mode,
          amount,
        }));
      } catch (err) {
        console.error("[SCANFRAME] Failed to send start_scan over WS:", err);
      }

      // 2. If multi-frame payload already arrived via auto-hold trigger, forward it
      let screenshot: string | null = null;
      if (remoteCaptureFrames && remoteCaptureFrames.length > 0) {
        screenshot = remoteCaptureFrames[0];
      } else if (remoteVideoFrame) {
        screenshot = remoteVideoFrame;
      }
      onCaptureAndScan(screenshot, shouldSimulateFailure);
    } else {
      // Standard local webcam mode
      let screenshot: string | null = null;
      if (webcamRef.current && !cameraError) {
        screenshot = webcamRef.current.getScreenshot();
      }
      onCaptureAndScan(screenshot, shouldSimulateFailure);
    }
  }, [isScanning, soundEnabled, isRemoteTerminal, terminalWs, mode, amount, remoteCaptureFrames, remoteVideoFrame, cameraError, onCaptureAndScan, shouldSimulateFailure]);

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
    if (isRemoteTerminal && terminalWs) {
      try {
        terminalWs.send(JSON.stringify({ type: "start_scan", mode, amount }));
      } catch (_) {}
    }
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
      
      {/* Remote Terminal Connection Badge (When Paired) */}
      {isRemoteTerminal && (
        <div className="w-full mb-3 px-4 py-2 rounded-xl bg-brass/10 border border-brass/50 text-brass text-xs font-mono flex items-center justify-between shadow-brass-glow">
          <span className="flex items-center gap-2 font-bold">
            <Wifi className="w-4 h-4 text-brass animate-pulse" />
            <span>REMOTE PI TERMINAL #{pairedTerminalId}</span>
          </span>
          <button
            onClick={clearTerminalPairing}
            className="text-[10px] uppercase text-slate-400 hover:text-vein-bright underline"
          >
            Disconnect
          </button>
        </div>
      )}

      {/* Mismatch Simulation Toggle Box */}
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

      {/* Viewfinder Container */}
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
        {/* Live Video Feed: Remote WebSocket Image Stream OR Local Webcam */}
        {isRemoteTerminal && remoteVideoFrame ? (
          <img
            src={remoteVideoFrame}
            alt="Remote Pi Feed"
            className="absolute inset-0 w-full h-full object-cover filter contrast-[1.1] grayscale-[0.1]"
          />
        ) : !cameraError ? (
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

        {/* Corner Flourishes & Live Overlay */}
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
              className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-brass-bright to-transparent shadow-[0_0_15px_#D4AF6A] z-20 pointer-events-none"
            />
          )}

          {/* Top Status Header */}
          <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-slate-300 z-10">
            <span className="flex items-center gap-1.5 bg-black/60 px-2.5 py-1 rounded border border-line">
              <Shield className="w-3 h-3 text-brass" />
              <span>{mode === "authorize" ? t("scan.step2Tag") : t("scan.step1Tag")}</span>
            </span>

            <span className={`px-2 py-0.5 rounded border transition-colors ${
              isScanning
                ? "bg-brass/20 text-brass border-brass"
                : isFailed
                ? "bg-vein/30 text-vein-bright border-vein"
                : "bg-black/60 text-slate-400 border-line"
            }`}>
              {isScanning
                ? t("scan.etching")
                : isFailed
                ? t("scan.retryNeeded")
                : t("scan.cameraReady")}
            </span>
          </div>

          {/* Bottom Dynamic Feedback Banner */}
          <div className="z-10 text-center font-mono space-y-1">
            <div className={`py-2 px-3 rounded-xl border backdrop-blur-md transition-all duration-300 ${
              isFailed
                ? "bg-vein/30 border-vein text-vein-bright"
                : handState === "holding"
                ? "bg-brass/20 border-brass text-brass-bright shadow-brass-glow"
                : handState === "positioning"
                ? "bg-black/70 border-brass/60 text-brass"
                : "bg-black/60 border-line text-slate-300"
            }`}>
              <p className="text-xs font-semibold">
                {detectionFeedback || statusText}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Controls & Action Buttons */}
      <div className="w-full mt-5 space-y-3 font-mono">
        {isFailed ? (
          /* Failure Recovery Action State */
          <div className="space-y-2">
            <button
              onClick={handleRetryWithReset}
              className="w-full py-3.5 rounded-xl bg-brass/20 border border-brass text-brass font-bold text-xs hover:bg-brass/30 transition-all flex items-center justify-center gap-2 shadow-brass-glow"
            >
              <RefreshCw className="w-4 h-4" />
              <span>{t("scan.retakeScanButton")}</span>
            </button>

            {onRegister && mode === "identify" && (
              <button
                onClick={onRegister}
                className="w-full py-3.5 rounded-xl bg-ink border border-line text-slate-300 font-semibold text-xs hover:border-brass/60 hover:text-paper transition-all flex items-center justify-center gap-2"
              >
                <UserPlus className="w-4 h-4 text-brass" />
                <span>{t("scan.registerNewPalmButton")}</span>
              </button>
            )}

            {onBackToIdentify && mode === "authorize" && (
              <button
                onClick={onBackToIdentify}
                className="w-full py-3 rounded-xl bg-ink/50 border border-line text-slate-400 text-xs hover:text-paper transition-colors flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>{t("scan.returnToScan1")}</span>
              </button>
            )}
          </div>
        ) : (
          /* Standard Scan Button Trigger */
          <button
            onClick={handleTriggerScan}
            disabled={isScanning || isDetectorLoading}
            className={`w-full py-4 rounded-xl font-serif font-bold text-sm transition-all flex items-center justify-center gap-2 border ${
              isScanning
                ? "bg-line/40 text-slate-500 border-line cursor-not-allowed"
                : "bg-gradient-to-r from-brass via-brass-bright to-brass text-ink border-brass-bright shadow-brass-glow hover:shadow-[0_0_25px_rgba(176,141,70,0.6)]"
            }`}
          >
            {isScanning ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-brass" />
                <span>{getActionButtonLabel()}</span>
              </>
            ) : (
              <>
                <Hand className="w-4 h-4 text-ink" />
                <span>{getActionButtonLabel()}</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};
