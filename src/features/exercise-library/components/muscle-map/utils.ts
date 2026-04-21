import { MuscleRegionV1 } from "@/lib/exercise-library-standards";

/**
 * Expands composite muscle groups into their constituent atomic regions.
 * Example: 'chest' -> ['chest_upper', 'chest_mid_lower']
 */
export function expandMuscleRegions(regions: MuscleRegionV1[]): MuscleRegionV1[] {
  const expanded = new Set<MuscleRegionV1>();
  
  regions.forEach(region => {
    if (region === 'chest') {
      expanded.add('chest_upper');
      expanded.add('chest_mid_lower');
    } else {
      expanded.add(region);
    }
  });

  return Array.from(expanded);
}

/**
 * Returns the parent group for an atomic muscle region if it exists.
 */
export function getParentMuscleGroup(region: MuscleRegionV1): MuscleRegionV1 | null {
  if (region === 'chest_upper' || region === 'chest_mid_lower') return 'chest';
  return null;
}

/**
 * Checks if a specific muscle belongs to a group.
 * Example: isMuscleInGroup('chest_upper', 'chest') -> true
 */
export function isMuscleInGroup(child: MuscleRegionV1, parent: MuscleRegionV1 | "all"): boolean {
  if (parent === "all") return true;
  if (child === parent) return true;
  
  if (parent === 'chest') {
    return child === 'chest_upper' || child === 'chest_mid_lower';
  }
  
  return false;
}
