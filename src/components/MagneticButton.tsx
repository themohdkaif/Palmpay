"use client";

import React, { useRef, useEffect } from "react";
import { setupMagneticHover } from "@/lib/gsap-animations";

interface MagneticButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?: "brass" | "outline" | "vein";
  className?: string;
}

export const MagneticButton: React.FC<MagneticButtonProps> = ({
  children,
  variant = "brass",
  className = "",
  onClick,
  disabled,
  ...props
}) => {
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const cleanup = setupMagneticHover(buttonRef.current);
    return () => cleanup();
  }, []);

  const variantStyles = {
    brass:
      "bg-gradient-to-r from-brass via-brass-bright to-brass text-ink font-serif font-bold tracking-wide border border-brass-bright/50 shadow-brass-glow hover:shadow-[0_0_25px_rgba(176,141,70,0.5)] active:scale-98",
    outline:
      "bg-ink/80 border border-brass/50 text-brass hover:bg-brass/10 hover:border-brass font-mono text-sm tracking-wider",
    vein:
      "bg-vein hover:bg-vein-bright text-paper font-serif font-semibold border border-brass/30 shadow-lg",
  };

  return (
    <button
      ref={buttonRef}
      onClick={onClick}
      disabled={disabled}
      className={`relative inline-flex items-center justify-center gap-3 px-8 py-4 rounded-xl transition-all duration-300 disabled:opacity-50 disabled:pointer-events-none ${variantStyles[variant]} ${className}`}
      {...props}
    >
      <span className="relative z-10 flex items-center gap-2.5">{children}</span>
    </button>
  );
};
