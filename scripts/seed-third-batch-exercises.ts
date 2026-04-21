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

const THIRD_BATCH: SeedExercise[] = [
  {
    name: "双杠臂屈伸",
    aliases: ["Dips", "Parallel Bar Dip"],
    recording_mode: "bodyweight_load",
    category: "胸/手臂",
    movement_pattern: "垂直推",
    primary_muscles: ["肱三头肌"],
    secondary_muscles: ["胸大肌", "三角肌前束"],
    is_bodyweight: true,
    allow_extra_load: true,
    allow_assistance: true,
    notes: "利用双杠进行自重推起的复合动作。",
    cues: ["身体略微前倾可增加胸部参与", "肘部向后而不是外张", "避免下放过深导致肩部压力过大"],
  },
  {
    name: "上斜卧推",
    aliases: ["Incline Bench Press"],
    recording_mode: "strength",
    category: "胸",
    movement_pattern: "水平推",
    primary_muscles: ["胸大肌上束"],
    secondary_muscles: ["三角肌前束", "肱三头肌"],
    is_bodyweight: false,
    allow_extra_load: false,
    allow_assistance: false,
    notes: "在上斜角度进行卧推，强化上胸。",
    cues: ["肩胛稳定收紧", "控制杠铃下放路径", "避免耸肩"],
  },
  {
    name: "俯卧撑",
    aliases: ["Push-up"],
    recording_mode: "bodyweight_load",
    category: "胸",
    movement_pattern: "水平推",
    primary_muscles: ["胸大肌"],
    secondary_muscles: ["肱三头肌", "核心"],
    is_bodyweight: true,
    allow_extra_load: true,
    allow_assistance: true,
    notes: "基础自重推类动作。",
    cues: ["身体保持一条直线", "核心收紧", "下降至胸接近地面"],
  },
  {
    name: "飞鸟",
    aliases: ["Dumbbell Fly", "Chest Fly"],
    recording_mode: "strength",
    category: "胸",
    movement_pattern: "肩水平内收",
    primary_muscles: ["胸大肌"],
    secondary_muscles: [],
    is_bodyweight: false,
    allow_extra_load: false,
    allow_assistance: false,
    notes: "孤立胸部的开合动作。",
    cues: ["手臂保持微屈", "专注胸部拉伸与收缩", "避免过度下放伤肩"],
  },
  {
    name: "反向飞鸟",
    aliases: ["Reverse Fly", "Rear Delt Fly"],
    recording_mode: "strength",
    category: "肩",
    movement_pattern: "肩水平外展",
    primary_muscles: ["三角肌后束"],
    secondary_muscles: ["上背"],
    is_bodyweight: false,
    allow_extra_load: false,
    allow_assistance: false,
    notes: "强化后束和上背的孤立动作。",
    cues: ["动作过程中保持控制", "避免借力摆动", "专注肩后侧发力"],
  },
  {
    name: "小腿提踵",
    aliases: ["Calf Raise"],
    recording_mode: "bodyweight_load",
    category: "下肢",
    movement_pattern: "踝关节跖屈",
    primary_muscles: ["腓肠肌"],
    secondary_muscles: ["比目鱼肌"],
    is_bodyweight: true,
    allow_extra_load: true,
    allow_assistance: false,
    notes: "小腿肌群训练动作。",
    cues: ["顶端充分收缩", "下放控制幅度", "避免借助弹性反弹"],
  },
  {
    name: "平板支撑",
    aliases: ["Plank"],
    recording_mode: "time_only",
    category: "核心",
    movement_pattern: "核心稳定",
    primary_muscles: ["腹直肌"],
    secondary_muscles: ["核心整体"],
    is_bodyweight: true,
    allow_extra_load: true,
    allow_assistance: false,
    notes: "核心抗伸展训练。",
    cues: ["身体保持直线", "避免塌腰", "核心持续紧张"],
  },
  {
    name: "仰卧起坐",
    aliases: ["Sit-up"],
    recording_mode: "reps_only",
    category: "核心",
    movement_pattern: "躯干屈曲",
    primary_muscles: ["腹直肌"],
    secondary_muscles: ["髂腰肌"],
    is_bodyweight: true,
    allow_extra_load: true,
    allow_assistance: false,
    notes: "经典核心训练动作。",
    cues: ["控制上起节奏", "避免借力甩起", "专注腹部发力"],
  },
  {
    name: "悬垂举腿",
    aliases: ["Hanging Leg Raise"],
    recording_mode: "reps_only",
    category: "核心",
    movement_pattern: "髋屈",
    primary_muscles: ["腹直肌"],
    secondary_muscles: ["髂腰肌"],
    is_bodyweight: true,
    allow_extra_load: true,
    allow_assistance: true,
    notes: "悬挂状态下抬腿训练核心。",
    cues: ["避免摆动", "控制下放", "尽量提高腿部高度"],
  },
  {
    name: "农夫行走",
    aliases: ["Farmer's Walk"],
    recording_mode: "time_or_distance",
    category: "全身",
    movement_pattern: "负重行走",
    primary_muscles: ["前臂"],
    secondary_muscles: ["核心", "斜方肌"],
    is_bodyweight: false,
    allow_extra_load: false,
    allow_assistance: false,
    notes: "负重行走强化握力与核心稳定。",
    cues: ["保持身体直立", "核心收紧", "步伐稳定均匀"],
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
  肱三头肌: "triceps",
  胸大肌: "chest",
  胸大肌上束: "upper_chest",
  三角肌前束: "front_delt",
  三角肌后束: "rear_delt",
  上背: "upper_back",
  腓肠肌: "calves",
  比目鱼肌: "calves",
  腹直肌: "abs",
  核心: "abs",
  核心整体: "abs",
  髂腰肌: "obliques",
  前臂: "forearm",
  斜方肌: "upper_back",
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
  垂直推: "vertical_push",
  水平推: "horizontal_push",
  肩水平内收: "upper_isolation",
  肩水平外展: "upper_isolation",
  踝关节跖屈: "lower_isolation",
  核心稳定: "core",
  躯干屈曲: "core",
  髋屈: "core",
  负重行走: "carry",
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
  if (mode === "duration_only" || mode === "intervals_conditioning" || mode === "time_only" || mode === "time_or_distance") {
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
  if (seed.name === "飞鸟" || seed.name === "反向飞鸟" || seed.name === "小腿提踵") {
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
  if (seed.name.includes("哑铃") || seed.name.includes("飞鸟")) tags.push("dumbbell");
  if (seed.is_bodyweight) tags.push("bodyweight");
  if (seed.name.includes("支撑")) tags.push("isometric");
  if (seed.name.includes("分腿") || seed.name.includes("单腿")) {
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

  for (const seed of THIRD_BATCH) {
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
  console.log(`Seeded/updated ${THIRD_BATCH.length} exercises. Total records: ${items.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
