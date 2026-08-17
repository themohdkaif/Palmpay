"use client";

import React from "react";
import Link from "next/link";
import { PageTransition } from "@/components/PageTransition";
import { VeinGuilloché } from "@/components/VeinGuilloché";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { ArrowLeft, ShieldCheck, Database, Lock, Cpu, Landmark, FileText, ExternalLink } from "lucide-react";

export default function AboutPage() {
  const { t } = useLanguage();

  return (
    <PageTransition>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 space-y-8">
        
        {/* Top Header */}
        <div className="flex items-center gap-4 border-b border-line pb-6">
          <Link
            href="/"
            className="p-2 rounded-xl bg-ink border border-line hover:border-brass text-brass transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <span className="font-mono text-xs text-brass uppercase tracking-widest block">
              {t("about.subtitle")}
            </span>
            <h1 className="font-serif text-3xl sm:text-4xl font-bold text-paper tracking-tight">
              {t("about.title")}
            </h1>
          </div>
        </div>

        {/* Banknote Engraved Disclosure Document */}
        <div className="rounded-2xl bg-ink border-2 border-brass/50 p-6 sm:p-10 shadow-2xl text-paper space-y-8 relative overflow-hidden">
          
          <div className="absolute right-6 top-6 opacity-10 pointer-events-none">
            <VeinGuilloché className="w-56 h-56 text-brass" strokeColor="#B08D46" />
          </div>

          {/* Section 1: Prototype & Mandate Test Mode Status */}
          <div className="space-y-3 relative z-10">
            <div className="flex items-center gap-2 text-brass font-mono text-xs uppercase tracking-wider font-bold">
              <Landmark className="w-4 h-4" />
              <span>{t("about.section1Title")}</span>
            </div>
            <h3 className="font-serif text-xl font-bold text-paper">
              {t("about.section1Subtitle")}
            </h3>
            <p className="text-xs font-mono text-slate-300 leading-relaxed">
              {t("about.section1Body")}
            </p>
          </div>

          {/* Section 2: Machine Learning Architecture */}
          <div className="space-y-3 relative z-10 border-t border-line/60 pt-6">
            <div className="flex items-center gap-2 text-brass font-mono text-xs uppercase tracking-wider font-bold">
              <Cpu className="w-4 h-4" />
              <span>{t("about.section2Title")}</span>
            </div>
            <h3 className="font-serif text-xl font-bold text-paper">
              {t("about.section2Subtitle")}
            </h3>
            <p className="text-xs font-mono text-slate-300 leading-relaxed">
              {t("about.section2Body")}
            </p>
          </div>

          {/* Section 3: Privacy & DPDP Compliance */}
          <div className="space-y-3 relative z-10 border-t border-line/60 pt-6">
            <div className="flex items-center gap-2 text-brass font-mono text-xs uppercase tracking-wider font-bold">
              <ShieldCheck className="w-4 h-4" />
              <span>{t("about.section3Title")}</span>
            </div>
            <h3 className="font-serif text-xl font-bold text-paper">
              {t("about.section3Subtitle")}
            </h3>
            <p className="text-xs font-mono text-slate-300 leading-relaxed">
              {t("about.section3Body")}
            </p>
            <ul className="list-disc list-inside text-xs font-mono text-slate-400 space-y-1.5 pl-2">
              <li>{t("about.bullet1")}</li>
              <li>{t("about.bullet2")}</li>
              <li>{t("about.bullet3")}</li>
            </ul>
          </div>

          {/* Bottom Stamp Footer */}
          <div className="pt-4 border-t-2 border-brass/40 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-brass" />
              <span>AUTHENTICATED BIOMETRIC SPECIFICATION v2.0</span>
            </div>

            <Link
              href="/scan"
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-brass via-brass-bright to-brass text-ink font-serif font-bold text-xs shadow-brass-glow hover:shadow-[0_0_20px_rgba(176,141,70,0.5)] transition-all"
            >
              {t("about.proceedScanButton")}
            </Link>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
