import { useRef, useState, useEffect, useCallback } from "react";
import Webcam from "react-webcam";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

export interface UseHandDetectionOptions {
  webcamRef: React.RefObject<Webcam>;
  isScanning: boolean;
  isFailed: boolean;
  cameraError: boolean;
  onAutoTriggerCapture: () => void;
  holdDurationMs?: number;
  detectionIntervalMs?: number;
}

export interface UseHandDetectionReturn {
  isDetectorLoading: boolean;
  handState: "none" | "positioning" | "holding" | "captured";
  detectionFeedback: string;
  holdProgress: number;
  resetDetection: () => void;
}

export function useHandDetection({
  webcamRef,
  isScanning,
  isFailed,
  cameraError,
  onAutoTriggerCapture,
  holdDurationMs = 700,
  detectionIntervalMs = 180,
}: UseHandDetectionOptions): UseHandDetectionReturn {
  const [isDetectorLoading, setIsDetectorLoading] = useState<boolean>(true);
  const [handState, setHandState] = useState<"none" | "positioning" | "holding" | "captured">("none");
  const [detectionFeedback, setDetectionFeedback] = useState<string>("");
  const [holdProgress, setHoldProgress] = useState<number>(0);

  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastDetectTimeRef = useRef<number>(0);
  const holdStartTimeRef = useRef<number | null>(null);
  const isTriggeredRef = useRef<boolean>(false);

  // 1. WASM HandLandmarker Model Initialization
  useEffect(() => {
    let isMounted = true;

    async function initLandmarker() {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );
        if (!isMounted) return;

        const landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numHands: 1,
        });

        if (isMounted) {
          handLandmarkerRef.current = landmarker;
          setIsDetectorLoading(false);
        }
      } catch (err) {
        console.warn("HandLandmarker WASM load fallback to manual mode:", err);
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
  }, []);

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

  // 2. Real-Time Detection Loop
  useEffect(() => {
    if (isScanning || isFailed || cameraError || isDetectorLoading) {
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
    handState,
    detectionFeedback,
    holdProgress,
    resetDetection,
  };
}
