"use client";

import React from "react";

interface VeinGuillochéProps {
  className?: string;
  strokeColor?: string;
  animated?: boolean;
}

export const VeinGuilloché: React.FC<VeinGuillochéProps> = ({
  className = "w-full h-full",
  strokeColor = "#B08D46",
  animated = false,
}) => {
  return (
    <svg
      className={`${className} ${animated ? "animate-pulse" : ""}`}
      viewBox="0 0 400 400"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Banknote Engraving Guilloché Line Pattern */}
        <pattern id="guilloché-mesh" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M0 20 Q10 0 20 20 T40 20" stroke={strokeColor} strokeWidth="0.5" strokeOpacity="0.25" fill="none" />
          <path d="M0 20 Q10 40 20 20 T40 20" stroke={strokeColor} strokeWidth="0.5" strokeOpacity="0.25" fill="none" />
        </pattern>
      </defs>

      {/* Outer Concentric Security Rings */}
      <circle cx="200" cy="200" r="190" stroke={strokeColor} strokeWidth="1" strokeDasharray="4 2" strokeOpacity="0.6" />
      <circle cx="200" cy="200" r="182" stroke={strokeColor} strokeWidth="1.5" strokeOpacity="0.8" />
      <circle cx="200" cy="200" r="174" stroke={strokeColor} strokeWidth="0.5" strokeOpacity="0.4" />

      {/* Guilloché Lathe Rosette Inner Mesh */}
      <circle cx="200" cy="200" r="160" fill="url(#guilloché-mesh)" />

      {/* Organic Palm Vascular Vein Engraving Lines (Banknote Security Fine Art) */}
      <g stroke={strokeColor} strokeLinecap="round" strokeLinejoin="round">
        {/* Main Trunk Axis */}
        <path d="M200 340 C200 280, 195 240, 190 190 C185 140, 175 100, 160 50" strokeWidth="2.5" strokeOpacity="0.9" />
        <path d="M200 340 C205 270, 210 230, 215 180 C220 130, 235 90, 245 50" strokeWidth="2" strokeOpacity="0.85" />
        
        {/* Primary Radial Vein Branches (Thumb, Index, Middle, Ring, Pinky) */}
        {/* Thumb Branch */}
        <path d="M195 240 C170 220, 140 210, 100 215 C80 218, 60 225, 45 235" strokeWidth="2" strokeOpacity="0.8" />
        <path d="M140 210 C125 190, 105 180, 80 180" strokeWidth="1.2" strokeOpacity="0.7" />

        {/* Index Finger Branch */}
        <path d="M190 190 C170 160, 150 120, 130 80 C120 60, 115 45, 110 30" strokeWidth="1.8" strokeOpacity="0.8" />
        <path d="M150 120 C140 100, 135 80, 130 60" strokeWidth="1" strokeOpacity="0.6" />

        {/* Middle Finger Branch */}
        <path d="M190 190 C190 140, 190 100, 185 55 C183 40, 182 25, 180 15" strokeWidth="2" strokeOpacity="0.85" />

        {/* Ring Finger Branch */}
        <path d="M215 180 C230 150, 245 110, 255 75 C260 55, 265 40, 270 25" strokeWidth="1.8" strokeOpacity="0.8" />

        {/* Pinky Finger Branch */}
        <path d="M215 180 C245 190, 275 195, 310 195 C330 195, 350 190, 365 180" strokeWidth="1.8" strokeOpacity="0.75" />
        <path d="M275 195 C295 175, 320 165, 345 155" strokeWidth="1" strokeOpacity="0.6" />

        {/* Interlocking Micro-Capillary Guilloché Lattice */}
        <path d="M170 220 C180 200, 185 170, 175 150" strokeWidth="1" strokeOpacity="0.5" strokeDasharray="3 3" />
        <path d="M210 230 C205 200, 210 170, 225 150" strokeWidth="1" strokeOpacity="0.5" strokeDasharray="3 3" />
        <path d="M130 80 C150 70, 170 65, 185 55" strokeWidth="0.8" strokeOpacity="0.5" />
        <path d="M255 75 C240 68, 210 60, 185 55" strokeWidth="0.8" strokeOpacity="0.5" />
      </g>

      {/* Lathe Micro-Star & Security Dots */}
      <circle cx="200" cy="200" r="4" fill={strokeColor} fillOpacity="0.9" />
      <circle cx="190" cy="190" r="2.5" fill={strokeColor} fillOpacity="0.7" />
      <circle cx="215" cy="180" r="2.5" fill={strokeColor} fillOpacity="0.7" />
    </svg>
  );
};
