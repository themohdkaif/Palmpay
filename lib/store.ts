import { create } from "zustand";
import { IdentifyResponse, AuthorizeResponse, PaymentFlowStatus } from "./types";

interface PalmPayStore {
  // State
  amount: number;
  flowStatus: PaymentFlowStatus;
  sessionId: number | null;
  identifiedCustomer: IdentifyResponse | null;
  authorizeResult: AuthorizeResponse | null;
  capturedFrame: string | null;
  errorMessage: string | null;
  shouldSimulateFailure: boolean;
  soundEnabled: boolean;

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
  resetFlow: () => void;
}

export const usePalmPayStore = create<PalmPayStore>((set) => ({
  amount: 50,
  flowStatus: "idle",
  sessionId: null,
  identifiedCustomer: null,
  authorizeResult: null,
  capturedFrame: null,
  errorMessage: null,
  shouldSimulateFailure: false,
  soundEnabled: true,

  setAmount: (amount) => set({ amount }),
  setFlowStatus: (flowStatus) => set({ flowStatus }),
  setSessionId: (sessionId) => set({ sessionId }),
  setIdentifiedCustomer: (identifiedCustomer) => set({ identifiedCustomer }),
  setAuthorizeResult: (authorizeResult) => set({ authorizeResult }),
  setCapturedFrame: (capturedFrame) => set({ capturedFrame }),
  setErrorMessage: (errorMessage) => set({ errorMessage }),
  setShouldSimulateFailure: (shouldSimulateFailure) => set({ shouldSimulateFailure }),
  toggleSound: () => set((state) => ({ soundEnabled: !state.soundEnabled })),

  resetFlow: () =>
    set({
      amount: 50,
      flowStatus: "idle",
      sessionId: null,
      identifiedCustomer: null,
      authorizeResult: null,
      capturedFrame: null,
      errorMessage: null,
    }),
}));
