import { useRef, useState, useEffect, useCallback } from "react";
import Webcam from "react-webcam";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { usePalmPayStore } from "@/lib/store";
import { useHandLandmarkerContext } from "@/lib/HandLandmarkerContext";

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
  wasmReadyTimeMs: number | null;
}

export function useHandDetection({
  webcamRef,
  isScanning,
  isFailed,
  cameraError,
  onAutoTriggerCapture,
  holdDurationMs = 450,
  detectionIntervalMs = Number(process.env.NEXT_PUBLIC_DETECTION_INTERVAL_MS) || 120,
  preferredDelegate = (process.env.NEXT_PUBLIC_MEDIAPIPE_DELEGATE as "GPU" | "CPU") || "GPU",
}: UseHandDetectionOptions): UseHandDetectionReturn {
  const { landmarker: prewarmedLandmarker, isWasmWarmed, warmupTimeMs } = useHandLandmarkerContext();

  // Remote Terminal State from Zustand Store
  const pairedTerminalId = usePalmPayStore((s) => s.pairedTerminalId);
  const remoteHandState = usePalmPayStore((s) => s.remoteHandState);
  const remoteFeedback = usePalmPayStore((s) => s.remoteFeedback);
  const remoteHoldProgress = usePalmPayStore((s) => s.remoteHoldProgress);
  const remoteCaptureFrames = usePalmPayStore((s) => s.remoteCaptureFrames);

  const [isDetectorLoading, setIsDetectorLoading] = useState<boolean>(!Boolean(prewarmedLandmarker));
  const [handState, setHandState] = useState<"none" | "positioning" | "holding" | "captured">("none");
  const [detectionFeedback, setDetectionFeedback] = useState<string>("");
  const [holdProgress, setHoldProgress] = useState<number>(0);

  const handLandmarkerRef = useRef<HandLandmarker | null>(prewarmedLandmarker);
  const animationFrameRef = useRef<number | null>(null);
  const rvfcCallbackIdRef = useRef<number | null>(null);
  const lastDetectTimeRef = useRef<number>(0);
  const holdStartTimeRef = useRef<number | null>(null);
  const isTriggeredRef = useRef<boolean>(false);
  const rollingWindowRef = useRef<boolean[]>([]);

  const isRemoteTerminal = Boolean(pairedTerminalId);

  const onAutoTriggerRef = useRef(onAutoTriggerCapture);
  useEffect(() => {
    onAutoTriggerRef.current = onAutoTriggerCapture;
  }, [onAutoTriggerCapture]);

  // Sync pre-warmed landmarker when context resolves
  useEffect(() => {
    if (prewarmedLandmarker && !handLandmarkerRef.current) {
      handLandmarkerRef.current = prewarmedLandmarker;
      setIsDetectorLoading(false);
      console.log("⚡ [PERFORMANCE TIMING] Consumed Pre-Warmed MediaPipe Landmarker (0ms mount delay).");
    }
  }, [prewarmedLandmarker]);

  // Trigger auto capture when remote terminal signals `captured` or sends multi-frame payload
  useEffect(() => {
    if (isRemoteTerminal && (remoteHandState === "captured" || (remoteCaptureFrames && remoteCaptureFrames.length > 0))) {
      if (!isTriggeredRef.current) {
        isTriggeredRef.current = true;
        onAutoTriggerRef.current();
      }
    }
  }, [isRemoteTerminal, remoteHandState, remoteCaptureFrames]);

  // 1. WASM HandLandmarker Model Fallback (Only if Context Pre-warm hasn't loaded yet)
  useEffect(() => {
    if (isRemoteTerminal || handLandmarkerRef.current) {
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
              minHandDetectionConfidence: 0.4,
              minHandPresenceConfidence: 0.4,
              minTrackingConfidence: 0.4,
            });
          } catch (_) {
            landmarker = await HandLandmarker.createFromOptions(vision, {
              baseOptions: {
                modelAssetPath:
                  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
                delegate: "CPU",
              },
              runningMode: "VIDEO",
              numHands: 1,
              minHandDetectionConfidence: 0.4,
              minHandPresenceConfidence: 0.4,
              minTrackingConfidence: 0.4,
            });
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
            minHandDetectionConfidence: 0.4,
            minHandPresenceConfidence: 0.4,
            minTrackingConfidence: 0.4,
          });
        }

        if (isMounted) {
          handLandmarkerRef.current = landmarker;
          setIsDetectorLoading(false);
        }
      } catch (err) {
        if (isMounted) setIsDetectorLoading(false);
      }
    }

    initLandmarker();
  }, [isRemoteTerminal, preferredDelegate]);

  // Reset trigger state when scan completes
  useEffect(() => {
    if (!isScanning) {
      isTriggeredRef.current = false;
      rollingWindowRef.current = [];
    }
  }, [isScanning]);

  const resetDetection = useCallback(() => {
    holdStartTimeRef.current = null;
    isTriggeredRef.current = false;
    rollingWindowRef.current = [];
    setHoldProgress(0);
    setHandState("none");
    setDetectionFeedback("");
  }, []);

  // 2. Real-Time Local Detection Loop (using requestVideoFrameCallback where supported)
  useEffect(() => {
    if (isRemoteTerminal || isScanning || isFailed || cameraError || isDetectorLoading) {
      setHoldProgress(0);
      holdStartTimeRef.current = null;
      return;
    }

    let isRunning = true;

    function processFrame(now: number) {
      if (!isRunning) return;

      const video = webcamRef.current?.video;
      const landmarker = handLandmarkerRef.current;

      if (video && video.readyState >= 2 && landmarker && !isTriggeredRef.current) {
        if (now - lastDetectTimeRef.current >= detectionIntervalMs) {
          lastDetectTimeRef.current = now;

          try {
            const timestampMs = Math.round(now);
            const result = landmarker.detectForVideo(video, timestampMs);
            const hasLandmarks = Boolean(result && result.landmarks && result.landmarks.length > 0);

            if (hasLandmarks) {
              const landmarks = result.landmarks[0];

              let minX = 1, maxX = 0, minY = 1, maxY = 0;
              for (const pt of landmarks) {
                if (pt.x < minX) minX = pt.x;
                if (pt.x > maxX) maxX = pt.x;
                if (pt.y < minY) minY = pt.y;
                if (pt.y > maxY) maxY = pt.y;
              }

              const centerX = Number(((minX + maxX) / 2).toFixed(3));
              const centerY = Number(((minY + maxY) / 2).toFixed(3));
              const width = Number((maxX - minX).toFixed(3));
              const height = Number((maxY - minY).toFixed(3));

              // Raw posture check
              const isCentered = centerX >= 0.20 && centerX <= 0.80 && centerY >= 0.15 && centerY <= 0.85;
              const isGoodSize = width >= 0.14 && width <= 0.90 && height >= 0.16 && height <= 0.95;
              const frameValid = isCentered && isGoodSize;

              // 5-Frame Rolling Window Smoothing
              rollingWindowRef.current.push(frameValid);
              if (rollingWindowRef.current.length > 5) {
                rollingWindowRef.current.shift();
              }

              const validCount = rollingWindowRef.current.filter(Boolean).length;
              const isSmoothHolding = validCount >= 3;  // Pass if 3 of last 5 frames are good

              if (!isSmoothHolding) {
                setHandState("positioning");
                holdStartTimeRef.current = null;
                setHoldProgress(0);

                if (centerX < 0.20) setDetectionFeedback("Move palm right →");
                else if (centerX > 0.80) setDetectionFeedback("Move palm left ←");
                else if (width < 0.14) setDetectionFeedback("Move palm closer");
                else if (width > 0.90) setDetectionFeedback("Move palm back");
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

                if (elapsed >= holdDurationMs && !isTriggeredRef.current) {
                  isTriggeredRef.current = true;
                  setHandState("captured");
                  console.log(`⚡ [PERFORMANCE TIMING] AUTO-TRIGGERED CAPTURE after ${Math.round(elapsed)}ms steady hold.`);
                  onAutoTriggerRef.current();
                }
              }
            } else {
              rollingWindowRef.current.push(false);
              if (rollingWindowRef.current.length > 5) rollingWindowRef.current.shift();
              setHandState("none");
              setDetectionFeedback("Position your palm over scanner");
              holdStartTimeRef.current = null;
              setHoldProgress(0);
            }
          } catch (detErr) {
            console.error(`[DETECTOR] detectForVideo Exception:`, detErr);
          }
        }
      }

      scheduleNextFrame();
    }

    function scheduleNextFrame() {
      if (!isRunning) return;
      const video = webcamRef.current?.video;
      if (video && "requestVideoFrameCallback" in video) {
        rvfcCallbackIdRef.current = (video as any).requestVideoFrameCallback((now: number) => processFrame(now));
      } else {
        animationFrameRef.current = requestAnimationFrame((now) => processFrame(now));
      }
    }

    scheduleNextFrame();

    return () => {
      isRunning = false;
      const video = webcamRef.current?.video;
      if (video && "cancelVideoFrameCallback" in video && rvfcCallbackIdRef.current !== null) {
        (video as any).cancelVideoFrameCallback(rvfcCallbackIdRef.current);
      }
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
    wasmReadyTimeMs: warmupTimeMs,
  };
}
