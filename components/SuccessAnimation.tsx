"use client";

import React, { useEffect, useRef } from "react";
import gsap from "gsap";
import { VeinGuilloché } from "@/components/VeinGuilloché";
import { usePalmPayStore } from "@/lib/store";
import { playStampSound } from "@/lib/audio";

interface SuccessAnimationProps {
  amount: number;
  currency: string;
  merchant: string;
  onAnimationComplete?: () => void;
}

export const SuccessAnimation: React.FC<SuccessAnimationProps> = ({
  amount,
  currency,
  merchant,
  onAnimationComplete,
}) => {
  const soundEnabled = usePalmPayStore((s) => s.soundEnabled);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const spinnerRingRef = useRef<SVGSVGElement | null>(null);
  const filledSealRef = useRef<HTMLDivElement | null>(null);
  const shockwaveRef = useRef<HTMLDivElement | null>(null);
  const textContentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Master GSAP Timeline for Engraved "Payment Certified" Banknote Seal
    const tl = gsap.timeline({
      onComplete: () => {
        if (onAnimationComplete) onAnimationComplete();
      },
    });

    // 1. Engraved Brass Lathe Ring Rotation (0.5s)
    tl.to(spinnerRingRef.current, {
      rotation: 360,
      duration: 0.5,
      ease: "power2.inOut",
    })
      // Hide Spinner Ring
      .to(spinnerRingRef.current, {
        opacity: 0,
        scale: 0.8,
        duration: 0.15,
        ease: "power1.in",
      })

      // 2. Filled Currency Security Seal Appears with Elastic Bounce & Stamp Sound
      .fromTo(
        filledSealRef.current,
        { scale: 0, opacity: 0 },
        {
          scale: 1,
          opacity: 1,
          duration: 0.45,
          ease: "back.out(1.6)",
          onStart: () => {
            playStampSound(soundEnabled);
          },
        },
        "-=0.05"
      )

      // 3. Shockwave Ring Expands Outward & Fades
      .fromTo(
        shockwaveRef.current,
        { scale: 0.8, opacity: 0.8 },
        {
          scale: 1.6,
          opacity: 0,
          duration: 0.5,
          ease: "power2.out",
        },
        "-=0.2"
      )

      // 4. "PAYMENT CERTIFIED" Serif Title & Ledger Amount Slide Up
      .fromTo(
        textContentRef.current,
        { y: 16, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.4,
          ease: "power3.out",
        },
        "-=0.3"
      )

      // 5. Micro-settle effect on container (Scale 1.01 -> 1)
      .to(containerRef.current, {
        scale: 1,
        duration: 0.15,
        ease: "power2.inOut",
      });

    return () => {
      tl.kill();
    };
  }, [onAnimationComplete]);

  return (
    <div ref={containerRef} className="flex flex-col items-center text-center w-full max-w-sm mx-auto my-2">
      {/* Engraved Security Seal Container */}
      <div className="relative w-28 h-28 flex items-center justify-center mb-6">
        
        {/* 1. Initial Spinning Lathe Ring */}
        <svg
          ref={spinnerRingRef}
          className="absolute inset-0 w-28 h-28 text-brass z-20 pointer-events-none"
          viewBox="0 0 112 112"
          fill="none"
        >
          <circle
            cx="56"
            cy="56"
            r="50"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeDasharray="200 80"
            strokeLinecap="round"
            className="opacity-90"
          />
        </svg>

        {/* 3. Shockwave Ring */}
        <div
          ref={shockwaveRef}
          className="absolute inset-0 rounded-full border border-brass bg-brass/20 pointer-events-none opacity-0 shadow-brass-glow"
        />

        {/* 2. Banknote Certified Security Seal (Brass Outer Foil, Oxblood Vein Medallion Core) */}
        <div
          ref={filledSealRef}
          className="relative z-10 w-24 h-24 rounded-full bg-gradient-to-tr from-brass via-brass-bright to-brass p-[3px] shadow-brass-glow opacity-0 flex items-center justify-center"
        >
          <div className="w-full h-full rounded-full bg-vein flex items-center justify-center p-2 border border-brass/50 shadow-inner">
            <VeinGuilloché className="w-16 h-16 text-brass-bright" strokeColor="#D4AF6A" />
          </div>
        </div>
      </div>

      {/* 4. Certified Title & Ledger Amount (Fraunces Serif + IBM Plex Mono) */}
      <div ref={textContentRef} className="flex flex-col items-center opacity-0 space-y-2">
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-brass/10 border border-brass/40 text-[11px] font-mono tracking-widest text-brass uppercase">
          <span>PAYMENT CERTIFIED</span>
        </div>

        <h2 className="font-serif text-4xl sm:text-5xl font-bold text-ink tracking-tight pt-1">
          ₹{amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
        </h2>

        <p className="text-xs font-mono text-ink/70">
          Remitted to <span className="text-ink font-semibold">{merchant}</span>
        </p>
      </div>
    </div>
  );
};
