"use client";

import React from "react";
import Link from "next/link";
import { Lock, Volume2, VolumeX, BookOpen, Info, Globe } from "lucide-react";
import { VeinGuilloché } from "@/components/VeinGuilloché";
import { usePalmPayStore } from "@/lib/store";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export const Navbar: React.FC = () => {
  const { soundEnabled, toggleSound } = usePalmPayStore();
  const { language, toggleLanguage, t } = useLanguage();

  return (
    <header className="fixed top-0 left-0 right-0 z-50 py-4 bg-ink/90 backdrop-blur-md border-b border-line/60">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between">
        {/* Brand Currency Emblem Logo */}
        <Link href="/" className="flex items-center gap-3.5 group">
          <div className="relative w-10 h-10 rounded-lg bg-gradient-to-br from-brass via-brass-bright to-brass p-[1px] shadow-brass-glow transition-transform group-hover:scale-105">
            <div className="w-full h-full bg-ink rounded-[7px] flex items-center justify-center p-1">
              <VeinGuilloché className="w-7 h-7 text-brass-bright" strokeColor="#D4AF6A" />
            </div>
          </div>
          <div className="flex flex-col">
            <span className="font-serif text-2xl font-bold tracking-tight text-paper">
              Palm<span className="text-brass">Pay</span>
            </span>
            <span className="text-[10px] font-mono tracking-widest text-slate-400 uppercase -mt-1">
              EST. 2026 // BIOMETRIC BANKNOTE SEC
            </span>
          </div>
        </Link>

        {/* System Ledger Navigation & Audio & Language Controls */}
        <div className="flex items-center gap-3 sm:gap-6 font-mono text-xs text-slate-300">
          <div className="hidden sm:flex items-center gap-6">
            <Link
              href="/ledger"
              className="flex items-center gap-1.5 text-slate-300 hover:text-brass transition-colors text-[11px] uppercase tracking-wider"
            >
              <BookOpen className="w-3.5 h-3.5 text-brass" />
              <span>{t("nav.ledger")}</span>
            </Link>

            <Link
              href="/about"
              className="flex items-center gap-1.5 text-slate-400 hover:text-brass transition-colors text-[11px] uppercase tracking-wider border-l border-line pl-6"
            >
              <Info className="w-3.5 h-3.5 text-brass" />
              <span>{t("nav.trust")}</span>
            </Link>
          </div>

          {/* Brass Language Toggle Button (EN / हिं) */}
          <button
            onClick={toggleLanguage}
            title={language === "en" ? "Switch to Hindi (हिंदी)" : "Switch to English"}
            className="px-2.5 py-1.5 rounded-lg bg-ink border border-brass/50 hover:border-brass text-paper font-mono text-xs flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
          >
            <Globe className="w-3.5 h-3.5 text-brass" />
            <span className="font-semibold text-brass">
              {language === "en" ? "EN / हिं" : "हिं / EN"}
            </span>
          </button>

          {/* Brass Sound Toggle Button */}
          <button
            onClick={toggleSound}
            title={soundEnabled ? "Audio Enabled (Click to Mute)" : "Audio Muted (Click to Enable)"}
            className="p-2 rounded-lg bg-ink border border-line hover:border-brass text-brass transition-all flex items-center justify-center shadow-sm active:scale-95"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
          </button>
        </div>
      </div>
    </header>
  );
};
