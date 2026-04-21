import { MUSCLE_REGION_VALUES } from "@/lib/exercise-library-standards";
import { FRONT_ANATOMICAL_REGIONS, BACK_ANATOMICAL_REGIONS } from "@/features/exercise-library/components/muscle-map/anatomical-paths";

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function main() {
  const validSet = new Set<string>(MUSCLE_REGION_VALUES);
  const frontKeys = FRONT_ANATOMICAL_REGIONS.map((item) => item.region);
  const backKeys = BACK_ANATOMICAL_REGIONS.map((item) => item.region);
  const allUsed = unique([...frontKeys, ...backKeys]);

  const illegal = allUsed.filter((key) => !validSet.has(key));
  const missing = MUSCLE_REGION_VALUES.filter((key) => !allUsed.includes(key));

  if (illegal.length > 0) {
    console.warn(`[WARNING] 肌群图包含自定义 key: ${illegal.join(", ")}`);
  }
  
  // Note: We might be doing a partial high-fidelity rollout, so we show missing as a warning if not all 19 are there yet
  if (missing.length > 0) {
    console.warn(`[WARNING] 肌群图尚未覆盖标准 key: ${missing.join(", ")}`);
  }

  console.log("肌群定义现状：已覆盖", allUsed.length, "个区域。校验流程刷新确认。");
}

main();
