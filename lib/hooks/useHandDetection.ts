import { useRef, useState, useEffect, useCallback } from "react";
import Webcam from "react-webcam";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { usePalmPayStore } from "@/lib/store";

export interface UseHandDetectionOptions {
  webcamRef: React.RefObject<Webcam>;
  isScanning: boolean;
  isFailed: boolean;
  cameraError: boolean;
  onAutoTriggerCapture: () => void;
  holdDurationMs?: number;
  detectionIntervalMs?: number;
  preferredDelegate?: "GPU" | "CPU";
}

export interface UseHandDetectionReturn {
  isDetectorLoading: boolean;
  handState: "none" | "positioning" | "holding" | "captured";
  detectionFeedback: string;
  holdProgress: number;
  resetDetection: () => void;
  isRemoteTerminal: boolean;
}

export function useHandDetection({
  webcamRef,
  isScanning,
  isFailed,
  cameraError,
  onAutoTriggerCapture,
  holdDurationMs = 700,
  detectionIntervalMs = Number(process.env.NEXT_PUBLIC_DETECTION_INTERVAL_MS) || 180,
  preferredDelegate = (process.env.NEXT_PUBLIC_MEDIAPIPE_DELEGATE as "GPU" | "CPU") || "GPU",
}: UseHandDetectionOptions): UseHandDetectionReturn {
  // Remote Terminal State from Zustand Store
  const pairedTerminalId = usePalmPayStore((s) => s.pairedTerminalId);
  const remoteHandState = usePalmPayStore((s) => s.remoteHandState);
  const remoteFeedback = usePalmPayStore((s) => s.remoteFeedback);
  const remoteHoldProgress = usePalmPayStore((s) => s.remoteHoldProgress);
  const remoteCaptureFrames = usePalmPayStore((s) => s.remoteCaptureFrames);

  const [isDetectorLoading, setIsDetectorLoading] = useState<boolean>(true);
  const [handState, setHandState] = useState<"none" | "positioning" | "holding" | "captured">("none");
  const [detectionFeedback, setDetectionFeedback] = useState<string>("");
  const [holdProgress, setHoldProgress] = useState<number>(0);

  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastDetectTimeRef = useRef<number>(0);
  const holdStartTimeRef = useRef<number | null>(null);
  const isTriggeredRef = useRef<boolean>(false);

  const isRemoteTerminal = Boolean(pairedTerminalId);

  // Trigger auto capture when remote terminal signals `captured` or sends multi-frame payload
  useEffect(() => {
    if (isRemoteTerminal && (remoteHandState === "captured" || (remoteCaptureFrames && remoteCaptureFrames.length > 0))) {
      if (!isTriggeredRef.current) {
        isTriggeredRef.current = true;
        onAutoTriggerCapture();
      }
    }
  }, [isRemoteTerminal, remoteHandState, remoteCaptureFrames, onAutoTriggerCapture]);

  // 1. WASM HandLandmarker Model Initialization (Configurable GPU/CPU with automatic Fallback for Pi/Low-End WebGL)
  useEffect(() => {
    if (isRemoteTerminal) {
      setIsDetectorLoading(false);
      return;
    }

    let isMounted = true;

    async function initLandmarker() {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );
        if (!isMounted) return;

        let landmarker: HandLandmarker | null = null;

        if (preferredDelegate === "GPU") {
          try {
            landmarker = await HandLandmarker.createFromOptions(vision, {
              baseOptions: {
                modelAssetPath:
                  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
                delegate: "GPU",
              },
              runningMode: "VIDEO",
              numHands: 1,
            });
            console.log("[MediaPipe WASM] HandLandmarker initialized using GPU delegate.");
          } catch (gpuErr) {
            console.warn("[MediaPipe WASM] GPU delegate unsupported on this hardware/browser. Retrying with CPU delegate...", gpuErr);
            landmarker = await HandLandmarker.createFromOptions(vision, {
              baseOptions: {
                modelAssetPath:
                  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
                delegate: "CPU",
              },
              runningMode: "VIDEO",
              numHands: 1,
            });
            console.log("[MediaPipe WASM] HandLandmarker initialized using CPU delegate fallback.");
          }
        } else {
          landmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath:
                "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
              delegate: "CPU",
            },
            runningMode: "VIDEO",
            numHands: 1,
          });
          console.log("[MediaPipe WASM] HandLandmarker initialized using configured CPU delegate.");
        }

        if (isMounted) {
          handLandmarkerRef.current = landmarker;
          setIsDetectorLoading(false);
        }
      } catch (err) {
        console.warn("[MediaPipe WASM] HandLandmarker load fallback to manual trigger mode:", err);
        if (isMounted) setIsDetectorLoading(false);
      }
    }

    initLandmarker();

    return () => {
      isMounted = false;
      if (handLandmarkerRef.current) {
        try {
          handLandmarkerRef.current.close();
        } catch (_) {}
        handLandmarkerRef.current = null;
      }
    };
  }, [isRemoteTerminal, preferredDelegate]);

  // Reset trigger state when scan completes
  useEffect(() => {
    if (!isScanning) {
      isTriggeredRef.current = false;
    }
  }, [isScanning]);

  const resetDetection = useCallback(() => {
    holdStartTimeRef.current = null;
    isTriggeredRef.current = false;
    setHoldProgress(0);
    setHandState("none");
    setDetectionFeedback("");
  }, []);

  // 2. Real-Time Local Detection Loop (Skipped if paired to Remote Terminal)
  useEffect(() => {
    if (isRemoteTerminal || isScanning || isFailed || cameraError || isDetectorLoading) {
      setHoldProgress(0);
      holdStartTimeRef.current = null;
      return;
    }

    let isRunning = true;

    function detectFrame(now: number) {
      if (!isRunning) return;

      const video = webcamRef.current?.video;
      const landmarker = handLandmarkerRef.current;

      if (video && video.readyState >= 2 && landmarker && !isTriggeredRef.current) {
        if (now - lastDetectTimeRef.current >= detectionIntervalMs) {
          lastDetectTimeRef.current = now;

          try {
            const result = landmarker.detectForVideo(video, now);
            if (result && result.landmarks && result.landmarks.length > 0) {
              const landmarks = result.landmarks[0];

              // Calculate Hand Bounding Box
              let minX = 1, maxX = 0, minY = 1, maxY = 0;
              for (const pt of landmarks) {
                if (pt.x < minX) minX = pt.x;
                if (pt.x > maxX) maxX = pt.x;
                if (pt.y < minY) minY = pt.y;
                if (pt.y > maxY) maxY = pt.y;
              }

              const centerX = (minX + maxX) / 2;
              const centerY = (minY + maxY) / 2;
              const width = maxX - minX;
              const height = maxY - minY;

              // Check centering & bounding box limits
              const isCentered = centerX >= 0.25 && centerX <= 0.75 && centerY >= 0.20 && centerY <= 0.80;
              const isGoodSize = width >= 0.22 && width <= 0.85 && height >= 0.25 && height <= 0.90;

              if (!isCentered || !isGoodSize) {
                setHandState("positioning");
                holdStartTimeRef.current = null;
                setHoldProgress(0);

                if (centerX < 0.25) setDetectionFeedback("Move palm right →");
                else if (centerX > 0.75) setDetectionFeedback("Move palm left ←");
                else if (width < 0.22) setDetectionFeedback("Move palm closer");
                else if (width > 0.85) setDetectionFeedback("Move palm back");
                else setDetectionFeedback("Center palm in frame");
              } else {
                setHandState("holding");
                setDetectionFeedback("Hold steady...");

                if (!holdStartTimeRef.current) {
                  holdStartTimeRef.current = now;
                }

                const elapsed = now - holdStartTimeRef.current;
                const progress = Math.min(100, Math.round((elapsed / holdDurationMs) * 100));
                setHoldProgress(progress);

                // Auto-Trigger on complete hold
                if (elapsed >= holdDurationMs && !isTriggeredRef.current) {
                  isTriggeredRef.current = true;
                  setHandState("captured");
                  onAutoTriggerCapture();
                }
              }
            } else {
              setHandState("none");
              setDetectionFeedback("Position your palm over scanner");
              holdStartTimeRef.current = null;
              setHoldProgress(0);
            }
          } catch (_) {}
        }
      }

      animationFrameRef.current = requestAnimationFrame(detectFrame);
    }

    animationFrameRef.current = requestAnimationFrame(detectFrame);

    return () => {
      isRunning = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [
    isRemoteTerminal,
    isScanning,
    isFailed,
    cameraError,
    isDetectorLoading,
    webcamRef,
    onAutoTriggerCapture,
    holdDurationMs,
    detectionIntervalMs,
  ]);

  return {
    isDetectorLoading,
    handState: isRemoteTerminal ? remoteHandState : handState,
    detectionFeedback: isRemoteTerminal ? remoteFeedback : detectionFeedback,
    holdProgress: isRemoteTerminal ? remoteHoldProgress : holdProgress,
    resetDetection,
    isRemoteTerminal,
  };
}
