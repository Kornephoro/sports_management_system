"use client";

import { MuscleRegionV1 } from "@/lib/exercise-library-standards";
import { FrontMuscleMap } from "./front-muscle-map";
import { BackMuscleMap } from "./back-muscle-map";
import { AnatomicalLeaderLines } from "./anatomical-leader-lines";

import { expandMuscleRegions } from "./utils";

type DualAnatomyMapperProps = {
  primary: MuscleRegionV1[];
  secondary: MuscleRegionV1[];
  intensity?: Record<string, number>;
  colorMode?: "highlight" | "heatmap";
  showLabels?: boolean;
  onRegionClick?: (region: MuscleRegionV1) => void;
  clickable?: boolean;
  variant?: "card" | "plain";
  selectedRegion?: MuscleRegionV1 | null;
};

/**
 * Orchestrates Front and Back views side-by-side
 */
export function DualAnatomyMapper({
  primary: rawPrimary,
  secondary: rawSecondary,
  intensity,
  colorMode = "highlight",
  showLabels = false,
  onRegionClick,
  clickable = false,
  variant = "card",
  selectedRegion,
}: DualAnatomyMapperProps) {
  const primary = expandMuscleRegions(rawPrimary);
  const secondary = expandMuscleRegions(rawSecondary);
  const activeRegions = [...primary, ...secondary];

  const containerClass = variant === "card" 
    ? "relative clinical-glass rounded-2xl overflow-hidden p-2 sm:p-4"
    : "relative overflow-hidden";

  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-4 w-full">
      {/* Front View */}
      <div className={containerClass}>
        <FrontMuscleMap 
          primary={primary} 
          secondary={secondary} 
          intensity={intensity}
          colorMode={colorMode}
          clickable={clickable}
          onRegionClick={onRegionClick}
          selectedRegion={selectedRegion}
        />
        {showLabels && (
          <AnatomicalLeaderLines 
            view="front" 
            activeRegions={activeRegions} 
            primaryRegions={primary}
            selectedRegion={selectedRegion}
            onLabelClick={onRegionClick}
          />
        )}
      </div>

      {/* Back View */}
      <div className={containerClass}>
        <BackMuscleMap 
          primary={primary} 
          secondary={secondary} 
          intensity={intensity}
          colorMode={colorMode}
          clickable={clickable}
          onRegionClick={onRegionClick}
          selectedRegion={selectedRegion}
        />
        {showLabels && (
          <AnatomicalLeaderLines 
            view="back" 
            activeRegions={activeRegions} 
            primaryRegions={primary}
            selectedRegion={selectedRegion}
            onLabelClick={onRegionClick}
          />
        )}
      </div>
    </div>
  );
}
