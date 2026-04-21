import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

const DEMO_USER_ID = "00000000-0000-0000-0000-000000000001";
const STORE_FILE = path.join(process.cwd(), "data", "exercise-library.json");

const EXERCISE_SEEDS = [
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
  {
    name: "引体向上",
    aliases: ["Pull-up", "Chin-up", "引体"],
    recording_mode: "bodyweight_load",
    category: "背部",
    movement_pattern: "垂直拉",
    primary_muscles: ["背阔肌"],
    secondary_muscles: ["肱二头肌", "核心"],
    is_bodyweight: true,
    allow_extra_load: true,
    allow_assistance: true,
    notes: "通过上肢拉动身体向上，使下巴接近或超过横杆的自重垂直拉动作。",
    cues: ["起始时肩胛先下沉再发力", "避免大幅摆动借力", "上拉时胸部主动靠近横杆"],
  },
  {
    name: "高位下拉",
    aliases: ["Lat Pulldown", "下拉"],
    recording_mode: "strength",
    category: "背部",
    movement_pattern: "垂直拉",
    primary_muscles: ["背阔肌"],
    secondary_muscles: ["肱二头肌", "后束", "中背"],
    is_bodyweight: false,
    allow_extra_load: false,
    allow_assistance: false,
    notes: "利用下拉器械将横杆从高位下拉至胸前的垂直拉动作。",
    cues: ["先沉肩再拉肘", "避免过度后仰借力", "下拉到上胸附近并控制回放"],
  },
  {
    name: "杠铃划船",
    aliases: ["Barbell Row", "Bent-over Row"],
    recording_mode: "strength",
    category: "背部",
    movement_pattern: "水平拉",
    primary_muscles: ["中背"],
    secondary_muscles: ["背阔肌", "后束", "肱二头肌", "下背"],
    is_bodyweight: false,
    allow_extra_load: false,
    allow_assistance: false,
    notes: "身体前倾位下，以杠铃进行水平拉动的复合动作。",
    cues: ["躯干保持稳定角度", "杠铃拉向下胸或上腹", "避免借助腰部大幅反弹"],
  },
  {
    name: "坐姿划船",
    aliases: ["Seated Row", "Cable Row"],
    recording_mode: "strength",
    category: "背部",
    movement_pattern: "水平拉",
    primary_muscles: ["中背"],
    secondary_muscles: ["背阔肌", "肱二头肌", "后束"],
    is_bodyweight: false,
    allow_extra_load: false,
    allow_assistance: false,
    notes: "坐姿利用绳索或器械向身体方向拉动把手的水平拉动作。",
    cues: ["先收肩胛再拉手", "避免耸肩", "保持躯干稳定，不要前后甩动"],
  },
  {
    name: "面拉",
    aliases: ["Face Pull"],
    recording_mode: "strength",
    category: "肩部",
    movement_pattern: "水平拉",
    primary_muscles: ["三角肌后束"],
    secondary_muscles: ["上背", "斜方肌中下部", "肩袖"],
    is_bodyweight: false,
    allow_extra_load: false,
    allow_assistance: false,
    notes: "通过绳索将把手向面部方向拉回，强调后束与上背稳定的动作。",
    cues: ["肘部向两侧打开", "手拉向面部两侧而非胸前", "注意肩胛控制和外旋感觉"],
  },
  {
    name: "杠铃推举",
    aliases: ["Barbell Overhead Press", "OHP", "Overhead Press"],
    recording_mode: "strength",
    category: "肩部",
    movement_pattern: "垂直推",
    primary_muscles: ["三角肌前束"],
    secondary_muscles: ["肱三头肌", "上胸", "核心"],
    is_bodyweight: false,
    allow_extra_load: false,
    allow_assistance: false,
    notes: "站姿或坐姿将杠铃从肩上方向头顶推起的垂直推动作。",
    cues: ["核心收紧避免后仰过大", "杠铃路径尽量贴近面部中线", "顶端锁定时保持肩部稳定"],
  },
  {
    name: "哑铃肩推",
    aliases: ["Dumbbell Shoulder Press", "Dumbbell Overhead Press"],
    recording_mode: "strength",
    category: "肩部",
    movement_pattern: "垂直推",
    primary_muscles: ["三角肌前束"],
    secondary_muscles: ["肱三头肌", "三角肌中束", "核心"],
    is_bodyweight: false,
    allow_extra_load: false,
    allow_assistance: false,
    notes: "使用哑铃进行头顶上推的肩部复合动作。",
    cues: ["左右发力保持平衡", "避免耸肩代偿", "下放时控制到位后再推起"],
  },
  {
    name: "侧平举",
    aliases: ["Lateral Raise", "Dumbbell Lateral Raise"],
    recording_mode: "strength",
    category: "肩部",
    movement_pattern: "肩外展",
    primary_muscles: ["三角肌中束"],
    secondary_muscles: ["斜方肌上部"],
    is_bodyweight: false,
    allow_extra_load: false,
    allow_assistance: false,
    notes: "通过肩外展将哑铃从身体两侧抬起，主要训练三角肌中束。",
    cues: ["肘部微屈，避免手臂完全锁死", "抬至肩高附近即可", "控制离心，不要借摆"],
  },
  {
    name: "杠铃弯举",
    aliases: ["Barbell Curl", "Biceps Curl"],
    recording_mode: "strength",
    category: "手臂",
    movement_pattern: "肘屈",
    primary_muscles: ["肱二头肌"],
    secondary_muscles: ["肱肌", "肱桡肌"],
    is_bodyweight: false,
    allow_extra_load: false,
    allow_assistance: false,
    notes: "通过肘关节屈曲将杠铃向上弯起的手臂训练动作。",
    cues: ["上臂尽量固定在身体两侧", "避免身体后仰借力", "顶端停顿感受收缩"],
  },
  {
    name: "绳索下压",
    aliases: ["Triceps Pushdown", "Cable Pushdown"],
    recording_mode: "strength",
    category: "手臂",
    movement_pattern: "肘伸",
    primary_muscles: ["肱三头肌"],
    secondary_muscles: [],
    is_bodyweight: false,
    allow_extra_load: false,
    allow_assistance: false,
    notes: "利用绳索或直杆向下伸肘发力，主要训练肱三头肌。",
    cues: ["肘部贴近身体两侧", "下压到底充分伸直", "回放时控制速度避免反弹"],
  },
];

const MUSCLE_MAP = {
  股四头肌: "quads",
  臀大肌: "glutes",
  腘绳肌: "hamstrings",
  核心: "abs",
  下背: "lower_back",
  背阔肌: "lats",
  肱二头肌: "biceps",
  中背: "upper_back",
  后束: "rear_delt",
  三角肌后束: "rear_delt",
  上背: "upper_back",
  斜方肌中下部: "upper_back",
  肩袖: "rear_delt",
  上胸: "upper_chest",
  三角肌中束: "mid_delt",
  斜方肌上部: "upper_back",
  肱肌: "biceps",
  肱桡肌: "forearm",
  胸大肌: "chest",
  肱三头肌: "triceps",
  三角肌前束: "front_delt",
};

const MOVEMENT_MAP = {
  "蹲类 / 膝主导": "squat_knee_dominant",
  "髋主导 / 硬拉类": "hip_hinge",
  髋主导: "hip_hinge",
  "蹲类 / 器械": "squat_knee_dominant",
  膝关节伸展: "lower_isolation",
  膝关节屈曲: "lower_isolation",
  单腿蹲: "split_lunge",
  水平推: "horizontal_push",
  垂直拉: "vertical_pull",
  水平拉: "horizontal_pull",
  垂直推: "vertical_push",
  肩外展: "upper_isolation",
  肘屈: "upper_isolation",
  肘伸: "upper_isolation",
};

function toNameKey(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "")
    .trim();
}

function dedupeStrings(values) {
  const seen = new Set();
  const result = [];
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

function toRecordMode(mode) {
  return mode === "duration_only" || mode === "intervals_conditioning" ? "duration" : "reps";
}

function toLoadModel(seed) {
  return seed.is_bodyweight || seed.allow_assistance ? "bodyweight_plus" : "absolute";
}

function toCategory(seed) {
  const isolationNames = new Set(["腿屈伸", "腿弯举", "面拉", "侧平举", "杠铃弯举", "绳索下压"]);
  return isolationNames.has(seed.name) ? "isolation" : "compound";
}

function toRegions(values, max) {
  const mapped = values
    .map((item) => MUSCLE_MAP[item])
    .filter(Boolean);
  return [...new Set(mapped)].slice(0, max);
}

function toTags(seed) {
  const tags = [];
  if (seed.name.includes("杠铃")) tags.push("barbell");
  if (seed.name.includes("哑铃")) tags.push("dumbbell");
  if (seed.name.includes("腿举") || seed.name.includes("腿屈伸") || seed.name.includes("腿弯举")) tags.push("machine");
  if (seed.name.includes("绳索") || seed.name.includes("下压") || seed.name.includes("高位下拉") || seed.name.includes("坐姿划船") || seed.aliases.some((alias) => alias.toLowerCase().includes("cable"))) tags.push("cable");
  if (seed.name.includes("分腿")) tags.push("unilateral");
  if (!seed.name.includes("分腿")) tags.push("bilateral");
  if (seed.is_bodyweight) tags.push("bodyweight");
  return [...new Set(tags)];
}

function buildNotes(seed) {
  const cueText = seed.cues.map((item) => `- ${item}`).join("\n");
  return [
    `定义备注：${seed.notes}`,
    "动作提示：",
    cueText,
    `定义属性：is_bodyweight=${seed.is_bodyweight}; allow_extra_load=${seed.allow_extra_load}; allow_assistance=${seed.allow_assistance}`,
  ].join("\n");
}

function toRecord(seed, existing) {
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
    movement_pattern: MOVEMENT_MAP[seed.movement_pattern] ?? "core",
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
  const items = Array.isArray(parsed) ? parsed : [];

  for (const seed of EXERCISE_SEEDS) {
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
  console.log(`Seeded/updated ${EXERCISE_SEEDS.length} exercises. Total records: ${items.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
