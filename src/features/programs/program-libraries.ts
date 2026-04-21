export type LibraryUnitPreset = {
  id: string;
  name: string;
  prescriptionType: "sets_reps" | "sets_time";
  sets: number;
  reps?: number;
  durationSeconds?: number;
  loadValue?: number | string;
  loadUnit?: string;
  targetRepsMin?: number;
  targetRepsMax?: number;
  rpeMin?: number;
  rpeMax?: number;
  notes?: string;
};

export type TemplateLibraryPreset = {
  id: string;
  name: string;
  description: string;
  units: LibraryUnitPreset[];
};

export const ACTION_LIBRARY: LibraryUnitPreset[] = [
  {
    id: "barbell-squat",
    name: "杠铃深蹲",
    prescriptionType: "sets_reps",
    sets: 3,
    reps: 5,
    loadValue: 60,
    loadUnit: "kg",
    targetRepsMin: 3,
    targetRepsMax: 8,
    rpeMin: 5,
    rpeMax: 8,
  },
  {
    id: "romanian-deadlift",
    name: "罗马尼亚硬拉",
    prescriptionType: "sets_reps",
    sets: 3,
    reps: 6,
    loadValue: 70,
    loadUnit: "kg",
    targetRepsMin: 3,
    targetRepsMax: 8,
    rpeMin: 5,
    rpeMax: 8,
  },
  {
    id: "barbell-bench-press",
    name: "杠铃平板卧推",
    prescriptionType: "sets_reps",
    sets: 3,
    reps: 8,
    loadValue: 40,
    loadUnit: "kg",
    targetRepsMin: 3,
    targetRepsMax: 12,
    rpeMin: 6,
    rpeMax: 9,
  },
  {
    id: "push-up",
    name: "俯卧撑",
    prescriptionType: "sets_reps",
    sets: 3,
    reps: 8,
    loadValue: "自重",
    loadUnit: "bodyweight",
    targetRepsMin: 8,
    targetRepsMax: 20,
    rpeMin: 7,
    rpeMax: 10,
  },
  {
    id: "lat-pulldown",
    name: "高位下拉",
    prescriptionType: "sets_reps",
    sets: 3,
    reps: 8,
    loadValue: 80,
    loadUnit: "lbs",
    targetRepsMin: 6,
    targetRepsMax: 15,
    rpeMin: 6,
    rpeMax: 10,
  },
  {
    id: "seated-row",
    name: "坐姿划船",
    prescriptionType: "sets_reps",
    sets: 2,
    reps: 8,
    loadValue: 110,
    loadUnit: "lbs",
    targetRepsMin: 6,
    targetRepsMax: 15,
    rpeMin: 6,
    rpeMax: 10,
  },
  {
    id: "plank",
    name: "平板支撑",
    prescriptionType: "sets_time",
    sets: 2,
    durationSeconds: 60,
    loadValue: "自重",
    loadUnit: "bodyweight",
    notes: "按静力时长记录。",
  },
  {
    id: "dumbbell-shoulder-press",
    name: "哑铃肩上推举",
    prescriptionType: "sets_reps",
    sets: 3,
    reps: 10,
    loadValue: 12,
    loadUnit: "kg",
    targetRepsMin: 6,
    targetRepsMax: 12,
    rpeMin: 6,
    rpeMax: 9,
  },
  {
    id: "split-squat",
    name: "保加利亚分腿蹲",
    prescriptionType: "sets_reps",
    sets: 3,
    reps: 10,
    loadValue: "自重",
    loadUnit: "bodyweight",
    targetRepsMin: 8,
    targetRepsMax: 15,
    rpeMin: 6,
    rpeMax: 9,
  },
  {
    id: "dead-bug",
    name: "死虫",
    prescriptionType: "sets_time",
    sets: 3,
    durationSeconds: 45,
    loadValue: "自重",
    loadUnit: "bodyweight",
    notes: "核心稳定动作，按时长记录。",
  },
];

export const TEMPLATE_LIBRARY: TemplateLibraryPreset[] = [
  {
    id: "strength-day-a",
    name: "力量基础日 A",
    description: "下肢 + 推拉 + 核心，适合每周 1 次基础力量训练。",
    units: [
      ACTION_LIBRARY[0],
      ACTION_LIBRARY[1],
      ACTION_LIBRARY[2],
      ACTION_LIBRARY[4],
      ACTION_LIBRARY[6],
    ],
  },
  {
    id: "full-body-minimal",
    name: "全身最小训练日",
    description: "复合动作为主，时长可控，适合快速开练。",
    units: [ACTION_LIBRARY[0], ACTION_LIBRARY[2], ACTION_LIBRARY[5], ACTION_LIBRARY[6]],
  },
];

export function getActionLibraryItemById(actionId: string) {
  return ACTION_LIBRARY.find((item) => item.id === actionId) ?? null;
}

export function getTemplateLibraryPresetById(templateId: string) {
  return TEMPLATE_LIBRARY.find((item) => item.id === templateId) ?? null;
}
