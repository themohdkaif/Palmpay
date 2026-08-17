"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Lock, Cpu, CheckCircle, Landmark } from "lucide-react";
import { MagneticButton } from "@/components/MagneticButton";
import { PageTransition } from "@/components/PageTransition";
import { VeinGuilloché } from "@/components/VeinGuilloché";
import { AmountEntry } from "@/components/AmountEntry";
import { usePalmPayStore } from "@/lib/store";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { animateHeadlineReveal } from "@/lib/gsap-animations";
import gsap from "gsap";

export default function LandingPage() {
  const router = useRouter();
  const heroRef = useRef<HTMLDivElement | null>(null);
  const medallionRef = useRef<HTMLDivElement | null>(null);

  const { amount, setAmount } = usePalmPayStore();
  const { t } = useLanguage();
  const [isValidAmount, setIsValidAmount] = useState<boolean>(true);

  useEffect(() => {
    // Trigger GSAP headline text reveal animation
    if (heroRef.current) {
      animateHeadlineReveal("#hero-container");
    }

    // Gentle slow lathe rotation on engraved vein medallion
    if (medallionRef.current) {
      gsap.to(medallionRef.current, {
        rotation: 360,
        duration: 90,
        repeat: -1,
        ease: "none",
      });
    }
  }, []);

  const handlePayNowClick = () => {
    if (!isValidAmount || amount < 1) return;

    // GSAP page exit transition
    if (heroRef.current) {
      gsap.to(heroRef.current, {
        opacity: 0,
        y: -20,
        duration: 0.4,
        ease: "power2.in",
        onComplete: () => {
          router.push("/scan");
        },
      });
    } else {
      router.push("/scan");
    }
  };

  return (
    <PageTransition>
      <div ref={heroRef} id="hero-container" className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-14">
        
        {/* Subtle Background Vein Guilloché Watermark Layer */}
        <div className="absolute inset-0 pointer-events-none opacity-5 flex items-center justify-center overflow-hidden">
          <VeinGuilloché className="w-[800px] h-[800px] text-brass" strokeColor="#B08D46" />
        </div>

        {/* Top Banknote Certificate Header Rule */}
        <div className="reveal-item relative z-10 flex items-center justify-between pb-4 mb-8 sm:mb-10 border-b border-line/80 font-mono text-xs text-slate-400">
          <span className="flex items-center gap-2 text-brass">
            <Landmark className="w-4 h-4" />
            <span>{t("landing.subtitle")}</span>
          </span>
          <span className="hidden sm:inline-block tracking-widest text-slate-500">
            SPECIMEN NO. 2026-PP
          </span>
        </div>

        {/* Asymmetric Banknote Face Layout */}
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
          
          {/* Left Column: Headline, Amount Entry Cheque Line & CTA Button */}
          <div className="lg:col-span-7 flex flex-col items-start space-y-6 sm:space-y-7">
            
            {/* GSAP Animated Headline (Fraunces Serif Display) */}
            <div className="space-y-3 text-left">
              <span className="reveal-item block font-mono text-xs tracking-widest text-brass uppercase">
                VASCULAR BIOMETRIC INSTRUMENT
              </span>
              <h1 className="reveal-item font-serif text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-paper leading-[1.08]">
                {t("landing.heroTitle1")}
                <br />
                <span className="text-slate-300 font-normal">{t("landing.heroTitle2")}</span>
              </h1>
              <p className="reveal-item text-slate-400 text-base sm:text-lg max-w-xl font-sans font-light leading-relaxed">
                {t("landing.description")}
              </p>
            </div>

            {/* Quiet Technical Readouts */}
            <div className="reveal-item grid grid-cols-3 gap-4 w-full font-mono text-xs text-slate-400 py-1 border-y border-line/60">
              <div>
                <span className="block text-[10px] text-slate-500 uppercase tracking-widest">{t("landing.engineLabel")}</span>
                <span className="text-paper font-medium">HOG + PCA ML</span>
              </div>
              <div>
                <span className="block text-[10px] text-slate-500 uppercase tracking-widest">{t("landing.securityLabel")}</span>
                <span className="text-paper font-medium">AES-256 HASH</span>
              </div>
              <div>
                <span className="block text-[10px] text-slate-500 uppercase tracking-widest">{t("landing.precisionLabel")}</span>
                <span className="text-brass font-medium">99.9% MATCH</span>
              </div>
            </div>

            {/* Cheque-Style Remittance Amount Entry Section */}
            <div className="reveal-item w-full pt-1">
              <AmountEntry
                amount={amount}
                onChangeAmount={setAmount}
                isValid={isValidAmount}
                setIsValid={setIsValidAmount}
              />
            </div>

            {/* Engraved Brass CTA Button */}
            <div className="reveal-item pt-2 w-full sm:w-auto">
              <MagneticButton
                onClick={handlePayNowClick}
                disabled={!isValidAmount || amount < 1}
                variant="brass"
                className="w-full sm:w-auto px-8 sm:px-10 py-4 sm:py-5 text-base sm:text-lg"
              >
                <VeinGuilloché className="w-6 h-6 text-ink" strokeColor="#0F1A14" />
                <span>{t("landing.payNowButton")} (₹{isValidAmount && amount ? amount.toLocaleString("en-IN") : "0"})</span>
                <ArrowRight className="w-5 h-5 text-ink ml-1 group-hover:translate-x-1 transition-transform shrink-0" />
              </MagneticButton>
            </div>

            {/* Demo Checkout Ledger Summary Footer */}
            <div className="reveal-item flex flex-wrap items-center gap-3 text-xs font-mono text-slate-400 pt-3 border-t border-line/60 w-full">
              <span className="text-slate-500">PAYEE MERCHANT:</span>
              <span className="text-paper font-medium">PalmPay Store</span>
              <span className="text-slate-600">•</span>
              <span className="text-brass font-semibold">₹{amount ? amount.toLocaleString("en-IN") : "0"}.00 INR</span>
            </div>
          </div>

          {/* Right Column: Engraved Vein Guilloché Medallion Motif */}
          <div className="lg:col-span-5 flex justify-center w-full">
            <div className="relative w-full max-w-sm sm:max-w-md aspect-square rounded-3xl bg-ink border-2 border-brass/40 p-6 sm:p-8 shadow-2xl flex flex-col justify-between overflow-hidden">
              
              {/* Outer Banknote Security Hairlines */}
              <div className="absolute inset-2 border border-line/60 rounded-2xl pointer-events-none" />
              <div className="absolute inset-3 border border-dashed border-brass/20 rounded-xl pointer-events-none" />

              {/* Medallion Header */}
              <div className="relative z-10 flex items-center justify-between font-mono text-[11px] text-slate-400">
                <span className="text-brass">OPTICAL PLATE #00412</span>
                <span className="text-slate-500">AUTHENTICATED</span>
              </div>

              {/* Central Guilloché Vein Lathe Medallion */}
              <div className="relative z-10 my-auto flex items-center justify-center p-4">
                <div ref={medallionRef} className="w-52 h-52 sm:w-64 sm:h-64">
                  <VeinGuilloché className="w-full h-full text-brass" strokeColor="#B08D46" />
                </div>
              </div>

              {/* Medallion Footer Ledger */}
              <div className="relative z-10 flex items-center justify-between font-mono text-[11px] text-slate-400 pt-3 border-t border-line/80">
                <span>SERIES 2026</span>
                <span className="text-brass">PATENTED VEIN LATHE</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
