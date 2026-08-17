"use client";

import React, { useState } from "react";

interface AmountEntryProps {
  amount: number;
  onChangeAmount: (newAmount: number) => void;
  isValid: boolean;
  setIsValid: (valid: boolean) => void;
}

const MANDATE_CAP = 100;
const PRESET_AMOUNTS = [20, 50, 100];

export const AmountEntry: React.FC<AmountEntryProps> = ({
  amount,
  onChangeAmount,
  isValid,
  setIsValid,
}) => {
  const [inputValue, setInputValue] = useState<string>(amount ? String(amount) : "50");
  const [isFocused, setIsFocused] = useState<boolean>(false);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value.replace(/[^0-9.]/g, "");
    setInputValue(rawVal);

    const numVal = parseFloat(rawVal);
    if (!isNaN(numVal) && numVal >= 1 && numVal <= MANDATE_CAP) {
      onChangeAmount(numVal);
      setIsValid(true);
    } else {
      setIsValid(false);
    }
  };

  const handleSelectPreset = (presetVal: number) => {
    setInputValue(String(presetVal));
    onChangeAmount(presetVal);
    setIsValid(true);
  };

  return (
    <div className="w-full space-y-4">
      {/* Cheque / Certificate Remittance Line Label */}
      <div className="flex items-center justify-between text-xs font-mono tracking-widest text-slate-400 uppercase">
        <span>REMITTANCE SUM</span>
        <span className="text-[10px] text-brass">MAX CAP: ₹100/TXN</span>
      </div>

      {/* Cheque Amount Entry Field */}
      <div className="relative flex items-baseline gap-2 pb-2 transition-all duration-300">
        {/* Currency Symbol in Fraunces Serif */}
        <span className="font-serif text-3xl sm:text-4xl font-bold text-brass select-none">
          ₹
        </span>

        {/* Monospace Tabular Input Field */}
        <input
          type="text"
          inputMode="decimal"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder="0.00"
          className={`w-full bg-transparent font-mono text-3xl sm:text-4xl font-bold text-paper placeholder-slate-600 focus:outline-none transition-all ${
            isFocused ? "text-paper" : "text-slate-200"
          }`}
        />

        {/* Engraved Brass Hairline Underneath */}
        <div
          className={`absolute bottom-0 left-0 right-0 h-0.5 transition-all duration-300 ${
            !isValid
              ? "bg-vein shadow-[0_0_10px_rgba(122,46,46,0.5)]"
              : isFocused
              ? "bg-brass-bright shadow-brass-glow h-[2px]"
              : "bg-brass/50"
          }`}
        />
      </div>

      {/* Quiet Inline Validation Message */}
      {!isValid && (
        <p className="font-mono text-xs text-vein-bright animate-pulse">
          * Capped at ₹100 for this mandate (enter ₹1 to ₹100)
        </p>
      )}

      {/* Quick-Select Engraved Preset Tabs (Capped at ₹100) */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <span className="text-[11px] font-mono text-slate-500 mr-1">PRESETS:</span>
        {PRESET_AMOUNTS.map((preset) => {
          const isSelected = amount === preset;
          return (
            <button
              key={preset}
              type="button"
              onClick={() => handleSelectPreset(preset)}
              className={`px-3.5 py-1.5 rounded-lg font-mono text-xs transition-all duration-200 border ${
                isSelected
                  ? "bg-brass text-ink font-semibold border-brass-bright shadow-brass-glow -translate-y-[1px]"
                  : "bg-ink/60 text-slate-300 border-line hover:border-brass/50 hover:text-paper hover:-translate-y-[1px]"
              }`}
            >
              ₹{preset}
            </button>
          );
        })}
      </div>
    </div>
  );
};
