import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

type SeedRecordingMode =
  | "strength"
  | "reps_only"
  | "duration_only"
  | "bodyweight_load"
  | "assisted_bodyweight"
  | "intervals_conditioning"
  | "time_only"
  | "time_or_distance";

type ExerciseRecordingModeValue =
  | "strength"
  | "reps_only"
  | "duration_only"
  | "bodyweight_load"
  | "assisted_bodyweight"
  | "intervals_conditioning";

type SeedExercise = {
  name: string;
  aliases: string[];
  recording_mode: SeedRecordingMode;
  category: string;
  movement_pattern: string;
  primary_muscles: string[];
  secondary_muscles: string[];
  is_bodyweight: boolean;
  allow_extra_load: boolean;
  allow_assistance: boolean;
  notes: string;
  cues: string[];
};

type ExerciseLibraryRecord = {
  id: string;
  user_id: string;
  name: string;
  aliases: string[];
  default_record_mode: "reps" | "duration";
  default_load_model: "absolute" | "bodyweight_plus";
  recording_mode: ExerciseRecordingModeValue;
  category: "compound" | "isolation";
  movement_pattern:
    | "squat_knee_dominant"
    | "hip_hinge"
    | "split_lunge"
    | "horizontal_push"
    | "vertical_push"
    | "horizontal_pull"
    | "vertical_pull"
    | "upper_isolation"
    | "lower_isolation"
    | "core"
    | "carry";
  primary_regions: Array<
    | "upper_chest"
    | "chest"
    | "lower_chest"
    | "front_delt"
    | "mid_delt"
    | "rear_delt"
    | "lats"
    | "upper_back"
    | "lower_back"
    | "biceps"
    | "triceps"
    | "forearm"
    | "abs"
    | "obliques"
    | "glutes"
    | "quads"
    | "hamstrings"
    | "adductors"
    | "calves"
  >;
  secondary_regions: Array<
    | "upper_chest"
    | "chest"
    | "lower_chest"
    | "front_delt"
    | "mid_delt"
    | "rear_delt"
    | "lats"
    | "upper_back"
    | "lower_back"
    | "biceps"
    | "triceps"
    | "forearm"
    | "abs"
    | "obliques"
    | "glutes"
    | "quads"
    | "hamstrings"
    | "adductors"
    | "calves"
  >;
  tags: Array<
    | "unilateral"
    | "bilateral"
    | "isometric"
    | "explosive"
    | "barbell"
    | "dumbbell"
    | "cable"
    | "machine"
    | "bodyweight"
    | "rehab"
    | "warmup_activation"
  >;
  description: string | null;
  enabled: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const DEMO_USER_ID = "00000000-0000-0000-0000-000000000001";
const STORE_FILE = path.join(process.cwd(), "data", "exercise-library.json");

const FOURTH_BATCH: SeedExercise[] = [
  {
    name: "臀桥",
    aliases: ["Glute Bridge"],
    recording_mode: "bodyweight_load",
    category: "下肢",
    movement_pattern: "髋主导",
    primary_muscles: ["臀大肌"],
    secondary_muscles: ["腘绳肌", "核心"],
    is_bodyweight: true,
    allow_extra_load: true,
    allow_assistance: false,
    notes: "仰卧状态下通过髋关节伸展抬起臀部的动作。",
    cues: ["顶端夹紧臀部", "避免腰部过度代偿", "脚跟发力"],
  },
  {
    name: "杠铃臀推",
    aliases: ["Barbell Hip Thrust"],
    recording_mode: "strength",
    category: "下肢",
    movement_pattern: "髋主导",
    primary_muscles: ["臀大肌"],
    secondary_muscles: ["腘绳肌", "核心"],
    is_bodyweight: false,
    allow_extra_load: false,
    allow_assistance: false,
    notes: "通过杠铃负重强化臀部的髋伸展动作。",
    cues: ["顶端完全伸髋", "避免下背代偿", "控制下放"],
  },
  {
    name: "箱式深蹲",
    aliases: ["Box Squat"],
    recording_mode: "strength",
    category: "下肢",
    movement_pattern: "蹲类 / 髋主导",
    primary_muscles: ["臀大肌"],
    secondary_muscles: ["股四头肌", "核心"],
    is_bodyweight: false,
    allow_extra_load: false,
    allow_assistance: false,
    notes: "通过触碰箱子控制深度的深蹲变式。",
    cues: ["轻触箱子而非完全坐下", "保持核心紧张", "避免反弹"],
  },
  {
    name: "相扑硬拉",
    aliases: ["Sumo Deadlift"],
    recording_mode: "strength",
    category: "下肢",
    movement_pattern: "髋主导",
    primary_muscles: ["臀大肌"],
    secondary_muscles: ["内收肌", "股四头肌"],
    is_bodyweight: false,
    allow_extra_load: false,
    allow_assistance: false,
    notes: "宽站距硬拉，强调臀部与内收肌参与。",
    cues: ["膝盖外推", "背部保持中立", "杠铃贴近身体"],
  },
  {
    name: "直腿硬拉",
    aliases: ["Stiff-leg Deadlift"],
    recording_mode: "strength",
    category: "下肢",
    movement_pattern: "髋主导",
    primary_muscles: ["腘绳肌"],
    secondary_muscles: ["臀大肌", "下背"],
    is_bodyweight: false,
    allow_extra_load: false,
    allow_assistance: false,
    notes: "强调腿后侧拉伸的硬拉变式。",
    cues: ["腿部尽量保持伸直", "感受腘绳肌拉伸", "避免弓背"],
  },
  {
    name: "行进弓步",
    aliases: ["Walking Lunge"],
    recording_mode: "bodyweight_load",
    category: "下肢",
    movement_pattern: "弓步",
    primary_muscles: ["股四头肌"],
    secondary_muscles: ["臀大肌", "核心"],
    is_bodyweight: true,
    allow_extra_load: true,
    allow_assistance: false,
    notes: "向前移动的弓步动作。",
    cues: ["步幅稳定", "膝盖方向控制", "躯干保持直立"],
  },
  {
    name: "登台阶",
    aliases: ["Step-up"],
    recording_mode: "bodyweight_load",
    category: "下肢",
    movement_pattern: "单腿蹲",
    primary_muscles: ["股四头肌"],
    secondary_muscles: ["臀大肌", "核心"],
    is_bodyweight: true,
    allow_extra_load: true,
    allow_assistance: false,
    notes: "单腿登上平台的功能性动作。",
    cues: ["发力腿完全主导", "避免借助另一条腿蹬地", "控制下放"],
  },
  {
    name: "死虫",
    aliases: ["Dead Bug"],
    recording_mode: "reps_only",
    category: "核心",
    movement_pattern: "核心稳定",
    primary_muscles: ["核心"],
    secondary_muscles: [],
    is_bodyweight: true,
    allow_extra_load: false,
    allow_assistance: false,
    notes: "仰卧抗伸展核心训练动作。",
    cues: ["腰部贴地", "动作缓慢控制", "避免代偿"],
  },
  {
    name: "俄罗斯转体",
    aliases: ["Russian Twist"],
    recording_mode: "reps_only",
    category: "核心",
    movement_pattern: "旋转",
    primary_muscles: ["腹斜肌"],
    secondary_muscles: ["核心"],
    is_bodyweight: true,
    allow_extra_load: true,
    allow_assistance: false,
    notes: "坐姿进行躯干旋转的核心训练。",
    cues: ["控制旋转节奏", "保持核心紧张", "避免摆动借力"],
  },
  {
    name: "绳索卷腹",
    aliases: ["Cable Crunch"],
    recording_mode: "strength",
    category: "核心",
    movement_pattern: "躯干屈曲",
    primary_muscles: ["腹直肌"],
    secondary_muscles: [],
    is_bodyweight: false,
    allow_extra_load: false,
    allow_assistance: false,
    notes: "利用绳索进行负重卷腹。",
    cues: ["脊柱逐节卷曲", "避免用髋部带动", "控制回放"],
  },
];

const MUSCLE_MAP: Record<
  string,
  | "upper_chest"
  | "chest"
  | "lower_chest"
  | "front_delt"
  | "mid_delt"
  | "rear_delt"
  | "lats"
  | "upper_back"
  | "lower_back"
  | "biceps"
  | "triceps"
  | "forearm"
  | "abs"
  | "obliques"
  | "glutes"
  | "quads"
  | "hamstrings"
  | "adductors"
  | "calves"
> = {
  臀大肌: "glutes",
  腘绳肌: "hamstrings",
  核心: "abs",
  股四头肌: "quads",
  内收肌: "adductors",
  下背: "lower_back",
  腹斜肌: "obliques",
  腹直肌: "abs",
};

const MOVEMENT_MAP: Record<
  string,
  | "squat_knee_dominant"
  | "hip_hinge"
  | "split_lunge"
  | "horizontal_push"
  | "vertical_push"
  | "horizontal_pull"
  | "vertical_pull"
  | "upper_isolation"
  | "lower_isolation"
  | "core"
  | "carry"
> = {
  髋主导: "hip_hinge",
  "蹲类 / 髋主导": "squat_knee_dominant",
  弓步: "split_lunge",
  单腿蹲: "split_lunge",
  核心稳定: "core",
  旋转: "core",
  躯干屈曲: "core",
};

function toNameKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "")
    .trim();
}

function dedupeStrings(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function dedupeArray<T extends string>(values: T[]) {
  return [...new Set(values)];
}

function toRecordingMode(mode: SeedRecordingMode): ExerciseRecordingModeValue {
  if (mode === "time_only" || mode === "time_or_distance") {
    return "duration_only";
  }
  return mode as ExerciseRecordingModeValue;
}

function toRecordMode(mode: SeedRecordingMode): "reps" | "duration" {
  if (
    mode === "duration_only" ||
    mode === "intervals_conditioning" ||
    mode === "time_only" ||
    mode === "time_or_distance"
  ) {
    return "duration";
  }
  return "reps";
}

function toLoadModel(seed: SeedExercise): "absolute" | "bodyweight_plus" {
  if (seed.is_bodyweight || seed.allow_assistance) {
    return "bodyweight_plus";
  }
  return "absolute";
}

function toCategory(seed: SeedExercise): "compound" | "isolation" {
  if (seed.name === "死虫" || seed.name === "俄罗斯转体" || seed.name === "绳索卷腹") {
    return "isolation";
  }
  return "compound";
}

function toMovementPattern(seed: SeedExercise) {
  return MOVEMENT_MAP[seed.movement_pattern] ?? "core";
}

function toRegions(values: string[], max: number) {
  const mapped = values
    .map((item) => MUSCLE_MAP[item])
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  return dedupeArray(mapped).slice(0, max);
}

function toTags(seed: SeedExercise) {
  const tags: Array<
    | "unilateral"
    | "bilateral"
    | "isometric"
    | "explosive"
    | "barbell"
    | "dumbbell"
    | "cable"
    | "machine"
    | "bodyweight"
    | "rehab"
    | "warmup_activation"
  > = [];

  if (seed.name.includes("杠铃")) tags.push("barbell");
  if (seed.name.includes("绳索")) tags.push("cable");
  if (seed.is_bodyweight) tags.push("bodyweight");
  if (seed.name.includes("弓步") || seed.name.includes("单腿") || seed.name.includes("登台阶")) {
    tags.push("unilateral");
  } else {
    tags.push("bilateral");
  }

  return dedupeArray(tags);
}

function buildNotes(seed: SeedExercise) {
  const cueText = seed.cues.map((item) => `- ${item}`).join("\n");
  return [
    `定义备注：${seed.notes}`,
    "动作提示：",
    cueText,
    `定义属性：is_bodyweight=${seed.is_bodyweight}; allow_extra_load=${seed.allow_extra_load}; allow_assistance=${seed.allow_assistance}`,
  ].join("\n");
}

function toRecord(seed: SeedExercise, existing?: ExerciseLibraryRecord): ExerciseLibraryRecord {
  const now = new Date().toISOString();
  const primaryRegions = toRegions(seed.primary_muscles, 2);
  const secondaryRegions = toRegions(seed.secondary_muscles, 4).filter(
    (item) => !primaryRegions.includes(item),
  );

  return {
    id: existing?.id ?? randomUUID(),
    user_id: existing?.user_id ?? DEMO_USER_ID,
    name: seed.name,
    aliases: dedupeStrings([...(existing?.aliases ?? []), ...seed.aliases]),
    default_record_mode: toRecordMode(seed.recording_mode),
    default_load_model: toLoadModel(seed),
    recording_mode: toRecordingMode(seed.recording_mode),
    category: toCategory(seed),
    movement_pattern: toMovementPattern(seed),
    primary_regions: primaryRegions,
    secondary_regions: secondaryRegions,
    tags: toTags(seed),
    description: seed.notes,
    enabled: existing?.enabled ?? true,
    notes: buildNotes(seed),
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
}

async function main() {
  const raw = await fs.readFile(STORE_FILE, "utf8");
  const parsed = JSON.parse(raw);
  const items: ExerciseLibraryRecord[] = Array.isArray(parsed) ? parsed : [];

  for (const seed of FOURTH_BATCH) {
    const key = toNameKey(seed.name);
    const index = items.findIndex(
      (item) => item.user_id === DEMO_USER_ID && toNameKey(item.name) === key,
    );
    if (index >= 0) {
      items[index] = toRecord(seed, items[index]);
    } else {
      items.push(toRecord(seed));
    }
  }

  await fs.writeFile(STORE_FILE, JSON.stringify(items, null, 2), "utf8");
  console.log(`Seeded/updated ${FOURTH_BATCH.length} exercises. Total records: ${items.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
