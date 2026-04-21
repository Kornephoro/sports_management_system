import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

type SeedExercise = {
  name: string;
  aliases: string[];
  recording_mode:
    | "strength"
    | "reps_only"
    | "duration_only"
    | "bodyweight_load"
    | "assisted_bodyweight"
    | "intervals_conditioning";
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
  recording_mode:
    | "strength"
    | "reps_only"
    | "duration_only"
    | "bodyweight_load"
    | "assisted_bodyweight"
    | "intervals_conditioning";
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

const FIRST_BATCH: SeedExercise[] = [
  {
    name: "杠铃深蹲",
    aliases: ["深蹲", "Barbell Squat", "Back Squat"],
    recording_mode: "strength",
    category: "下肢",
    movement_pattern: "蹲类 / 膝主导",
    primary_muscles: ["股四头肌"],
    secondary_muscles: ["臀大肌", "腘绳肌", "核心"],
    is_bodyweight: false,
    allow_extra_load: false,
    allow_assistance: false,
    notes: "杠铃置于背部，通过屈髋屈膝完成下蹲与站起。",
    cues: ["核心收紧保持脊柱中立", "膝盖与脚尖方向一致", "下蹲至大腿至少平行地面"],
  },
  {
    name: "前蹲",
    aliases: ["Front Squat"],
    recording_mode: "strength",
    category: "下肢",
    movement_pattern: "蹲类 / 膝主导",
    primary_muscles: ["股四头肌"],
    secondary_muscles: ["核心", "臀大肌"],
    is_bodyweight: false,
    allow_extra_load: false,
    allow_assistance: false,
    notes: "杠铃置于肩前位置进行深蹲。",
    cues: ["肘部抬高保持杠铃稳定", "躯干保持更直立", "避免塌腰"],
  },
  {
    name: "硬拉",
    aliases: ["Deadlift", "Conventional Deadlift"],
    recording_mode: "strength",
    category: "下肢",
    movement_pattern: "髋主导 / 硬拉类",
    primary_muscles: ["臀大肌"],
    secondary_muscles: ["腘绳肌", "下背", "背阔肌"],
    is_bodyweight: false,
    allow_extra_load: false,
    allow_assistance: false,
    notes: "从地面将杠铃拉起至站立。",
    cues: ["背部保持中立", "杠铃贴近小腿", "发力从腿驱动再到髋"],
  },
  {
    name: "罗马尼亚硬拉",
    aliases: ["RDL", "Romanian Deadlift"],
    recording_mode: "strength",
    category: "下肢",
    movement_pattern: "髋主导",
    primary_muscles: ["腘绳肌"],
    secondary_muscles: ["臀大肌", "下背"],
    is_bodyweight: false,
    allow_extra_load: false,
    allow_assistance: false,
    notes: "保持微屈膝，通过髋关节主导完成下放与拉起。",
    cues: ["感受大腿后侧拉伸", "保持杠铃贴腿", "不要下背代偿"],
  },
  {
    name: "腿举",
    aliases: ["Leg Press"],
    recording_mode: "strength",
    category: "下肢",
    movement_pattern: "蹲类 / 器械",
    primary_muscles: ["股四头肌"],
    secondary_muscles: ["臀大肌"],
    is_bodyweight: false,
    allow_extra_load: false,
    allow_assistance: false,
    notes: "通过器械推蹬负重。",
    cues: ["控制下放速度", "避免膝内扣", "脚掌稳定发力"],
  },
  {
    name: "腿屈伸",
    aliases: ["Leg Extension"],
    recording_mode: "strength",
    category: "下肢",
    movement_pattern: "膝关节伸展",
    primary_muscles: ["股四头肌"],
    secondary_muscles: [],
    is_bodyweight: false,
    allow_extra_load: false,
    allow_assistance: false,
    notes: "器械孤立训练股四头肌。",
    cues: ["顶峰停顿收缩", "缓慢下放", "避免借力"],
  },
  {
    name: "腿弯举",
    aliases: ["Leg Curl"],
    recording_mode: "strength",
    category: "下肢",
    movement_pattern: "膝关节屈曲",
    primary_muscles: ["腘绳肌"],
    secondary_muscles: [],
    is_bodyweight: false,
    allow_extra_load: false,
    allow_assistance: false,
    notes: "器械训练腘绳肌。",
    cues: ["避免髋部抬起", "控制回放", "收缩到位"],
  },
  {
    name: "保加利亚分腿蹲",
    aliases: ["Bulgarian Split Squat"],
    recording_mode: "strength",
    category: "下肢",
    movement_pattern: "单腿蹲",
    primary_muscles: ["股四头肌"],
    secondary_muscles: ["臀大肌", "核心"],
    is_bodyweight: false,
    allow_extra_load: true,
    allow_assistance: false,
    notes: "后脚抬高的单腿深蹲。",
    cues: ["前脚稳定发力", "躯干微前倾", "保持平衡"],
  },
  {
    name: "杠铃卧推",
    aliases: ["Bench Press", "Barbell Bench Press"],
    recording_mode: "strength",
    category: "胸",
    movement_pattern: "水平推",
    primary_muscles: ["胸大肌"],
    secondary_muscles: ["肱三头肌", "三角肌前束"],
    is_bodyweight: false,
    allow_extra_load: false,
    allow_assistance: false,
    notes: "卧姿推举杠铃。",
    cues: ["肩胛收紧", "杠铃下放至胸部", "保持稳定路径"],
  },
  {
    name: "哑铃卧推",
    aliases: ["Dumbbell Bench Press"],
    recording_mode: "strength",
    category: "胸",
    movement_pattern: "水平推",
    primary_muscles: ["胸大肌"],
    secondary_muscles: ["肱三头肌", "三角肌前束"],
    is_bodyweight: false,
    allow_extra_load: false,
    allow_assistance: false,
    notes: "使用哑铃进行卧推。",
    cues: ["控制左右稳定", "动作轨迹自然", "避免借力"],
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
  股四头肌: "quads",
  臀大肌: "glutes",
  腘绳肌: "hamstrings",
  核心: "abs",
  下背: "lower_back",
  背阔肌: "lats",
  胸大肌: "chest",
  肱三头肌: "triceps",
  三角肌前束: "front_delt",
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
  "蹲类 / 膝主导": "squat_knee_dominant",
  "髋主导 / 硬拉类": "hip_hinge",
  髋主导: "hip_hinge",
  "蹲类 / 器械": "squat_knee_dominant",
  膝关节伸展: "lower_isolation",
  膝关节屈曲: "lower_isolation",
  单腿蹲: "split_lunge",
  水平推: "horizontal_push",
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

function toRecordMode(mode: SeedExercise["recording_mode"]): "reps" | "duration" {
  if (mode === "duration_only" || mode === "intervals_conditioning") {
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
  if (seed.name === "腿屈伸" || seed.name === "腿弯举") {
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
  if (seed.name.includes("哑铃")) tags.push("dumbbell");
  if (seed.name.includes("腿举") || seed.name.includes("腿屈伸") || seed.name.includes("腿弯举")) {
    tags.push("machine");
  }
  if (seed.name.includes("分腿")) tags.push("unilateral");
  if (!seed.name.includes("分腿")) tags.push("bilateral");
  if (seed.is_bodyweight) tags.push("bodyweight");

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
    recording_mode: seed.recording_mode,
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

  for (const seed of FIRST_BATCH) {
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
  console.log(`Seeded/updated ${FIRST_BATCH.length} exercises. Total records: ${items.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
