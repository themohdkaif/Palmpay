"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { usePalmPayStore } from "@/lib/store";
import { ShieldCheck, CheckCircle2, AlertCircle, RefreshCw, Smartphone, Landmark, ArrowRight } from "lucide-react";
import { PageTransition } from "@/components/PageTransition";

function PairContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const terminalId = searchParams.get("terminal");
  const token = searchParams.get("token");

  const { setTerminalPairing, setRemoteFrame, setRemoteDetectionState, setRemoteCaptureFrames } = usePalmPayStore();

  const [status, setStatus] = useState<"connecting" | "success" | "error">("connecting");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    if (!terminalId || !token) {
      setStatus("error");
      setErrorMessage("Invalid QR pairing parameters. Please rescan the terminal QR code.");
      return;
    }

    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const wsBase = apiBase.replace(/^http/, "ws");
    const wsUrl = `${wsBase}/ws/session/${token}`;

    console.log(`[PAIR PAGE] Connecting to browser session WebSocket: ${wsUrl}`);
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log("[PAIR PAGE] WebSocket connection established.");
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        console.log("[PAIR PAGE] Received WS message:", msg.type);

        if (msg.type === "pairing_success") {
          setStatus("success");
          setTerminalPairing(terminalId, token, ws);

          // Transition to scan page after short delay
          setTimeout(() => {
            router.push("/scan");
          }, 1200);
        } else if (msg.type === "video_frame") {
          setRemoteFrame(msg.data);
        } else if (msg.type === "detection_state") {
          setRemoteDetectionState(msg.state, msg.feedback, msg.hold_progress);
        } else if (msg.type === "capture_complete") {
          setRemoteCaptureFrames(msg.frames);
        } else if (msg.type === "error") {
          setStatus("error");
          setErrorMessage(msg.message || "Pairing failed. QR code may be expired or used.");
        }
      } catch (e) {
        console.error("[PAIR PAGE] WS parse error:", e);
      }
    };

    ws.onerror = (err) => {
      console.error("[PAIR PAGE] WS Error:", err);
      setStatus("error");
      setErrorMessage("Connection error. Terminal may be offline or unreachable.");
    };

    ws.onclose = (evt) => {
      console.log("[PAIR PAGE] WS Closed:", evt.reason);
      if (status !== "success") {
        setStatus("error");
        if (!errorMessage) {
          setErrorMessage(evt.reason || "Terminal session closed. Please rescan the QR code.");
        }
      }
    };

    return () => {
      // Don't close socket if pairing succeeded (transfers ownership to Zustand store)
    };
  }, [terminalId, token, router, setTerminalPairing, setRemoteFrame, setRemoteDetectionState, setRemoteCaptureFrames]);

  return (
    <div className="max-w-xl mx-auto px-4 py-12 sm:py-20 text-center font-mono space-y-6">
      {status === "connecting" && (
        <div className="p-8 rounded-2xl bg-ink border border-brass/50 text-paper space-y-4 shadow-xl">
          <div className="w-14 h-14 rounded-full bg-brass/10 border border-brass flex items-center justify-center mx-auto text-brass">
            <RefreshCw className="w-6 h-6 animate-spin" />
          </div>
          <h2 className="font-serif text-2xl font-bold">Connecting to Terminal...</h2>
          <p className="text-xs text-slate-400">
            Pairing with Terminal <span className="text-brass">#{terminalId}</span>
          </p>
        </div>
      )}

      {status === "success" && (
        <div className="p-8 rounded-2xl bg-ink border-2 border-brass text-paper space-y-4 shadow-brass-glow">
          <div className="w-14 h-14 rounded-full bg-brass/20 border border-brass flex items-center justify-center mx-auto text-brass">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h2 className="font-serif text-2xl font-bold text-brass">Connected to Terminal!</h2>
          <p className="text-xs text-slate-300">
            Paired with Merchant Terminal <span className="text-brass">#{terminalId}</span>
          </p>
          <div className="pt-2 text-xs text-slate-400 flex items-center justify-center gap-2">
            <span>Redirecting to Palm Checkout</span>
            <ArrowRight className="w-4 h-4 text-brass animate-pulse" />
          </div>
        </div>
      )}

      {status === "error" && (
        <div className="p-8 rounded-2xl bg-ink border border-vein text-paper space-y-5 shadow-xl">
          <div className="w-14 h-14 rounded-full bg-vein/20 border border-vein flex items-center justify-center mx-auto text-vein-bright">
            <AlertCircle className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h2 className="font-serif text-xl font-bold text-vein-bright">Pairing Failed</h2>
            <p className="text-xs text-slate-300 leading-relaxed">{errorMessage}</p>
          </div>
          <button
            onClick={() => router.push("/scan")}
            className="w-full py-3 rounded-xl bg-ink/80 border border-line text-paper hover:bg-line transition-colors text-xs font-mono"
          >
            Return to Scan Main
          </button>
        </div>
      )}
    </div>
  );
}

export default function PairPage() {
  return (
    <PageTransition>
      <Suspense fallback={<div className="text-center py-20 text-brass font-mono">Loading Pairing...</div>}>
        <PairContent />
      </Suspense>
    </PageTransition>
  );
}
