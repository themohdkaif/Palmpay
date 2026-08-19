"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";

interface HandLandmarkerContextType {
  landmarker: HandLandmarker | null;
  isWasmWarmed: boolean;
  warmupTimeMs: number | null;
}

const HandLandmarkerContext = createContext<HandLandmarkerContextType>({
  landmarker: null,
  isWasmWarmed: false,
  warmupTimeMs: null,
});

let globalLandmarkerInstance: HandLandmarker | null = null;
let globalWarmupTimeMs: number | null = null;

export const HandLandmarkerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [landmarker, setLandmarker] = useState<HandLandmarker | null>(globalLandmarkerInstance);
  const [isWasmWarmed, setIsWasmWarmed] = useState<boolean>(Boolean(globalLandmarkerInstance));
  const [warmupTimeMs, setWarmupTimeMs] = useState<number | null>(globalWarmupTimeMs);

  useEffect(() => {
    if (globalLandmarkerInstance) {
      setLandmarker(globalLandmarkerInstance);
      setIsWasmWarmed(true);
      return;
    }

    let isMounted = true;
    const startNow = performance.now();

    async function prewarmMediaPipe() {
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );
        if (!isMounted) return;

        let instance: HandLandmarker | null = null;
        const preferredDelegate = (process.env.NEXT_PUBLIC_MEDIAPIPE_DELEGATE as "GPU" | "CPU") || "GPU";

        if (preferredDelegate === "GPU") {
          try {
            instance = await HandLandmarker.createFromOptions(vision, {
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
            console.log("[MediaPipe Pre-Warm] GPU Landmarker ready.");
          } catch (gpuErr) {
            console.warn("[MediaPipe Pre-Warm] GPU delegate unavailable; falling back to CPU...", gpuErr);
            instance = await HandLandmarker.createFromOptions(vision, {
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
            console.log("[MediaPipe Pre-Warm] CPU Landmarker ready.");
          }
        } else {
          instance = await HandLandmarker.createFromOptions(vision, {
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
          console.log("[MediaPipe Pre-Warm] CPU Landmarker ready.");
        }

        const elapsed = Math.round(performance.now() - startNow);
        if (isMounted && instance) {
          globalLandmarkerInstance = instance;
          globalWarmupTimeMs = elapsed;
          setLandmarker(instance);
          setIsWasmWarmed(true);
          setWarmupTimeMs(elapsed);
          console.log(`⚡ [PERFORMANCE TIMING] MediaPipe WASM Model Warmed Up on App Load in ${elapsed}ms.`);
        }
      } catch (err) {
        console.warn("[MediaPipe Pre-Warm] Pre-warm failed, fallback on demand:", err);
      }
    }

    prewarmMediaPipe();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <HandLandmarkerContext.Provider value={{ landmarker, isWasmWarmed, warmupTimeMs }}>
      {children}
    </HandLandmarkerContext.Provider>
  );
};

export const useHandLandmarkerContext = () => useContext(HandLandmarkerContext);
