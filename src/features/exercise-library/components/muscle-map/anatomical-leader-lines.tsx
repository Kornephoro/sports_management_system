"use client";

import { MuscleRegionV1 } from "@/lib/exercise-library-standards";
import { MUSCLE_LABEL_METADATA } from "./anatomical-paths";

type AnatomicalLeaderLinesProps = {
  view: "front" | "back";
  activeRegions: MuscleRegionV1[];
  primaryRegions: MuscleRegionV1[];
  selectedRegion?: MuscleRegionV1 | null;
  onLabelClick?: (region: MuscleRegionV1) => void;
};

/**
 * Professional-grade leaderboard lines and labels
 * Mirroring high-end physiological mapping tools
 */
export function AnatomicalLeaderLines({ 
  view, 
  activeRegions, 
  primaryRegions,
  selectedRegion,
  onLabelClick
}: AnatomicalLeaderLinesProps) {
  
  // Viewport setup for coordinate calculation
  // We assume the body is centered and 1024x1024 viewbox
  const CANVAS_SIZE = 1024;
  const LABEL_MARGIN = 20;
  
  return (
    <svg 
      viewBox={`0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}`} 
      className="absolute inset-0 w-full h-full pointer-events-none z-30"
      style={{ overflow: 'visible' }}
    >
      {MUSCLE_LABEL_METADATA.map((m) => {
        const anchor = view === "front" ? m.anchorFront : m.anchorBack;
        if (!anchor) return null;

        const isActive = activeRegions.includes(m.region);
        const isPrimary = primaryRegions.includes(m.region);
        const isSelected = selectedRegion === m.region;
        
        // Visual constants
        const labelX = m.side === 'left' ? LABEL_MARGIN : CANVAS_SIZE - LABEL_MARGIN;
        const textAnchor = m.side === 'left' ? 'start' : 'end';
        
        // L-Shape Path Calculation
        // Line starts horizontal from muscle, then angled/horizontal to the edge
        const elbowX = m.side === 'left' ? anchor.x - 40 : anchor.x + 40;
        const pathData = `M ${anchor.x} ${anchor.y} L ${elbowX} ${anchor.y} L ${labelX} ${anchor.y}`;

        return (
          <g 
            key={`${view}-${m.region}`} 
            className="transition-all duration-500 cursor-pointer pointer-events-auto"
            onClick={(e) => {
              e.stopPropagation();
              onLabelClick?.(m.region);
            }}
          >
            {/* Leader Line */}
            <path 
              d={pathData}
              fill="none"
              stroke={isActive || isSelected ? "var(--muscle-highlight-primary)" : "currentColor"}
              strokeWidth={isActive || isSelected ? 1.5 : 0.5}
              strokeOpacity={isActive || isSelected ? 0.8 : 0.15}
              className="transition-all duration-500"
            />
            
            {/* Anchor Dot */}
            <circle 
              cx={anchor.x} 
              cy={anchor.y} 
              r={isActive || isSelected ? 3 : 1.5}
              fill={isActive || isSelected ? "var(--muscle-highlight-primary)" : "currentColor"}
              fillOpacity={isActive || isSelected ? 1 : 0.2}
            />

            {/* Label Text */}
            <text 
              x={labelX} 
              y={anchor.y} 
              dy="0.35em"
              textAnchor={textAnchor}
              className={`text-[18px] transition-all duration-300 ${
                isActive || isSelected 
                  ? "font-black" 
                  : "font-medium"
              }`}
              fill={isActive || isSelected ? "var(--muscle-highlight-primary)" : "currentColor"}
              fillOpacity={isActive || isSelected ? 1 : 0.3}
            >
              {m.label}
            </text>

            {/* Underline for active labels */}
            {(isActive || isSelected) && (
               <line 
                 x1={labelX} 
                 y1={anchor.y + 12}
                 x2={m.side === 'left' ? labelX + 40 : labelX - 40}
                 y2={anchor.y + 12}
                 stroke="var(--muscle-highlight-primary)"
                 strokeWidth="2"
                 strokeOpacity="0.5"
               />
            )}
          </g>
        );
      })}
    </svg>
  );
}
