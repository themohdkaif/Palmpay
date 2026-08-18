import { create } from "zustand";
import { IdentifyResponse, AuthorizeResponse, PaymentFlowStatus } from "./types";

interface PalmPayStore {
  // Core Payment State
  amount: number;
  flowStatus: PaymentFlowStatus;
  sessionId: number | null;
  identifiedCustomer: IdentifyResponse | null;
  authorizeResult: AuthorizeResponse | null;
  capturedFrame: string | null;
  errorMessage: string | null;
  shouldSimulateFailure: boolean;
  soundEnabled: boolean;

  // Remote Raspberry Pi Terminal Relay State
  pairedTerminalId: string | null;
  pairingToken: string | null;
  terminalWs: WebSocket | null;
  remoteVideoFrame: string | null;
  remoteHandState: "none" | "positioning" | "holding" | "captured";
  remoteFeedback: string;
  remoteHoldProgress: number;
  remoteCaptureFrames: string[] | null;

  // Actions
  setAmount: (amount: number) => void;
  setFlowStatus: (status: PaymentFlowStatus) => void;
  setSessionId: (id: number | null) => void;
  setIdentifiedCustomer: (data: IdentifyResponse | null) => void;
  setAuthorizeResult: (result: AuthorizeResponse | null) => void;
  setCapturedFrame: (frame: string | null) => void;
  setErrorMessage: (msg: string | null) => void;
  setShouldSimulateFailure: (simulate: boolean) => void;
  toggleSound: () => void;

  // Remote Terminal Actions
  setTerminalPairing: (terminalId: string | null, token: string | null, ws: WebSocket | null) => void;
  setRemoteFrame: (frameB64: string | null) => void;
  setRemoteDetectionState: (state: "none" | "positioning" | "holding" | "captured", feedback: string, progress: number) => void;
  setRemoteCaptureFrames: (frames: string[] | null) => void;
  clearTerminalPairing: () => void;
  resetFlow: () => void;
}

export const usePalmPayStore = create<PalmPayStore>((set, get) => ({
  amount: 50,
  flowStatus: "idle",
  sessionId: null,
  identifiedCustomer: null,
  authorizeResult: null,
  capturedFrame: null,
  errorMessage: null,
  shouldSimulateFailure: false,
  soundEnabled: true,

  // Remote Terminal Default State
  pairedTerminalId: null,
  pairingToken: null,
  terminalWs: null,
  remoteVideoFrame: null,
  remoteHandState: "none",
  remoteFeedback: "",
  remoteHoldProgress: 0,
  remoteCaptureFrames: null,

  setAmount: (amount) => set({ amount }),
  setFlowStatus: (flowStatus) => set({ flowStatus }),
  setSessionId: (sessionId) => set({ sessionId }),
  setIdentifiedCustomer: (identifiedCustomer) => set({ identifiedCustomer }),
  setAuthorizeResult: (authorizeResult) => set({ authorizeResult }),
  setCapturedFrame: (capturedFrame) => set({ capturedFrame }),
  setErrorMessage: (errorMessage) => set({ errorMessage }),
  setShouldSimulateFailure: (shouldSimulateFailure) => set({ shouldSimulateFailure }),
  toggleSound: () => set((state) => ({ soundEnabled: !state.soundEnabled })),

  setTerminalPairing: (pairedTerminalId, pairingToken, terminalWs) =>
    set({ pairedTerminalId, pairingToken, terminalWs }),

  setRemoteFrame: (remoteVideoFrame) => set({ remoteVideoFrame }),

  setRemoteDetectionState: (remoteHandState, remoteFeedback, remoteHoldProgress) =>
    set({ remoteHandState, remoteFeedback, remoteHoldProgress }),

  setRemoteCaptureFrames: (remoteCaptureFrames) => set({ remoteCaptureFrames }),

  clearTerminalPairing: () => {
    const ws = get().terminalWs;
    if (ws) {
      try {
        ws.close();
      } catch (_) {}
    }
    set({
      pairedTerminalId: null,
      pairingToken: null,
      terminalWs: null,
      remoteVideoFrame: null,
      remoteHandState: "none",
      remoteFeedback: "",
      remoteHoldProgress: 0,
      remoteCaptureFrames: null,
    });
  },

  resetFlow: () =>
    set({
      amount: 50,
      flowStatus: "idle",
      sessionId: null,
      identifiedCustomer: null,
      authorizeResult: null,
      capturedFrame: null,
      errorMessage: null,
      remoteCaptureFrames: null,
    }),
}));
