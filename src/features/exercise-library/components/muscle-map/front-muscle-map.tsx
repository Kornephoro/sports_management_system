"use client";

import { MuscleRegionV1 } from "@/lib/exercise-library-standards";
import { FRONT_ANATOMICAL_REGIONS, FRONT_BODY_OUTLINE } from "./anatomical-paths";

type FrontMuscleMapProps = {
  primary: MuscleRegionV1[];
  secondary: MuscleRegionV1[];
  intensity?: Record<string, number>; // For heatmap mode: region -> 0-1 score
  clickable?: boolean;
  onRegionClick?: (region: MuscleRegionV1) => void;
  colorMode?: "highlight" | "heatmap";
  selectedRegion?: MuscleRegionV1 | null;
};

export function FrontMuscleMap({ 
  primary, 
  secondary, 
  intensity = {}, 
  clickable, 
  onRegionClick, 
  colorMode = "highlight",
  selectedRegion
}: FrontMuscleMapProps) {
  
  const getFillColor = (region: MuscleRegionV1) => {
    if (colorMode === "heatmap") {
      const score = intensity[region] || 0;
      if (score > 0.8) return "#ef4444"; 
      if (score > 0.5) return "#f59e0b"; 
      if (score > 0.2) return "#fbbf24"; 
      return "transparent";
    }

    if (primary.includes(region)) return "var(--muscle-highlight-primary)";
    if (selectedRegion === region) return "var(--muscle-highlight-primary)";
    if (secondary.includes(region)) return "var(--muscle-highlight-secondary)";
    return "transparent";
  };

  return (
    <svg 
      viewBox="0 0 1024 1024" 
      className="w-full h-auto"
    >
      {/* Base Silhouette */}
      <path 
        d={FRONT_BODY_OUTLINE} 
        fill="var(--muscle-silhouette)"
        stroke="var(--muscle-outline)"
        strokeWidth="1"
        className="transition-colors duration-700"
      />

      {/* Muscle Regions */}
      {FRONT_ANATOMICAL_REGIONS.map((regionData, idx) => {
        const isPrimary = primary.includes(regionData.region);
        const isSecondary = secondary.includes(regionData.region);
        const isSelected = selectedRegion === regionData.region;
        const isActive = isPrimary || isSecondary || isSelected || (intensity[regionData.region] ?? 0) > 0;
        
        return (
          <g 
            key={`${regionData.region}-${idx}`}
            onClick={() => clickable && onRegionClick?.(regionData.region)}
            className={`${clickable ? "cursor-pointer group" : ""} transition-all duration-300`}
          >
            {regionData.paths.map((d, pIdx) => (
              <path
                key={pIdx}
                d={d}
                fill={getFillColor(regionData.region)}
                stroke={isActive ? (isSelected ? "#3b82f6" : "rgba(255,255,255,0.4)") : "transparent"}
                strokeWidth={isSelected ? "2" : "1"}
                className="transition-all duration-500 ease-in-out group-hover:fill-blue-500/30"
                style={{
                  filter: (isPrimary || isSelected) ? "drop-shadow(0 0 12px var(--accent-neon-glow))" : "none",
                  fillOpacity: isSecondary ? 0.6 : 1
                }}
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
}
