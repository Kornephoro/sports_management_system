import { TemplatePackageSplitType, TemplatePackageSlot, TemplatePackageUnitOverride } from "@/features/training/training-api";

export type PackageDraftDay = {
  id?: string;
  dayCode: string;
  sequenceInMicrocycle: number;
  templateLibraryItemId: string;
  label: string;
  notes: string;
  progressionOverrides: TemplatePackageUnitOverride[];
};

export type PackageDraft = {
  name: string;
  splitType: TemplatePackageSplitType;
  notes: string;
  enabled: boolean;
  days: PackageDraftDay[];
  microcycleSlots: TemplatePackageSlot[];
};

export type SlotPreset = {
  id: string;
  label: string;
  slots: Array<{
    type: "train" | "rest";
    dayCode: string | null;
    label?: string;
  }>;
};

export const SLOT_PRESETS: SlotPreset[] = [
  {
    id: "single_day",
    label: "1分化 · 练一休一",
    slots: [
      { type: "train", dayCode: "A" },
      { type: "rest", dayCode: null, label: "休息" },
    ],
  },
  {
    id: "two_way",
    label: "2分化 · 练二休一",
    slots: [
      { type: "train", dayCode: "A" },
      { type: "train", dayCode: "B" },
      { type: "rest", dayCode: null, label: "休息" },
    ],
  },
  {
    id: "three_way_r1",
    label: "3分化 · 练三休一",
    slots: [
      { type: "train", dayCode: "A" },
      { type: "train", dayCode: "B" },
      { type: "train", dayCode: "C" },
      { type: "rest", dayCode: null, label: "休息" },
    ],
  },
  {
    id: "three_way_r2",
    label: "3分化 · 练三休二",
    slots: [
      { type: "train", dayCode: "A" },
      { type: "train", dayCode: "B" },
      { type: "train", dayCode: "C" },
      { type: "rest", dayCode: null, label: "休息" },
      { type: "rest", dayCode: null, label: "休息" },
    ],
  },
  {
    id: "four_way_r2",
    label: "4分化 · 练四休二",
    slots: [
      { type: "train", dayCode: "A" },
      { type: "train", dayCode: "B" },
      { type: "train", dayCode: "C" },
      { type: "train", dayCode: "D" },
      { type: "rest", dayCode: null, label: "休息" },
      { type: "rest", dayCode: null, label: "休息" },
    ],
  },
];

export function buildDefaultSlots(days: PackageDraftDay[]): TemplatePackageSlot[] {
  if (days.length === 0) {
    return [{ slotIndex: 1, type: "train", dayCode: "A", label: null }];
  }

  return days.map((day, index) => ({
    slotIndex: index + 1,
    type: "train" as const,
    dayCode: day.dayCode,
    label: day.label || null,
  }));
}

export function sanitizeSlots(
  slots: TemplatePackageSlot[] | undefined,
  days: PackageDraftDay[],
): TemplatePackageSlot[] {
  const dayCodes = days.map((day) => day.dayCode.trim().toUpperCase()).filter(Boolean);
  const dayCodeSet = new Set(dayCodes);
  const firstDayCode = dayCodes[0] ?? null;

  const normalized = (slots ?? [])
    .map<TemplatePackageSlot>((slot, index) => ({
      slotIndex: index + 1,
      type: (slot.type === "rest" ? "rest" : "train") as "train" | "rest",
      dayCode: slot.type === "rest" ? null : slot.dayCode?.toUpperCase() ?? firstDayCode,
      label: slot.label ?? null,
    }))
    .filter((slot) => {
      if (slot.type === "rest") return true;
      return slot.dayCode !== null && dayCodeSet.has(slot.dayCode);
    });

  const hasTrain = normalized.some((slot) => slot.type === "train");
  if (!hasTrain) {
    return buildDefaultSlots(days);
  }

  return normalized.map((slot, index) => ({
    ...slot,
    slotIndex: index + 1,
  }));
}

export function applySlotPreset(
  presetId: string,
  days: PackageDraftDay[],
): TemplatePackageSlot[] {
  const preset = SLOT_PRESETS.find((item) => item.id === presetId);
  if (!preset) {
    return buildDefaultSlots(days);
  }

  const availableDayCodes = days.map((day) => day.dayCode.trim().toUpperCase()).filter(Boolean);
  const fallback = availableDayCodes[0] ?? "A";

  return preset.slots.map<TemplatePackageSlot>((slot, index) => ({
    slotIndex: index + 1,
    type: slot.type,
    dayCode:
      slot.type === "rest"
        ? null
        : availableDayCodes.includes(slot.dayCode ?? "")
          ? slot.dayCode
          : availableDayCodes[index % Math.max(availableDayCodes.length, 1)] ?? fallback,
    label: slot.label ?? null,
  }));
}

export function createEmptyPackageDraft(defaultTemplateId = ""): PackageDraft {
  const days: PackageDraftDay[] = [
    {
      dayCode: "A",
      sequenceInMicrocycle: 1,
      templateLibraryItemId: defaultTemplateId,
      label: "训练日 A",
      notes: "",
      progressionOverrides: [],
    },
    {
      dayCode: "B",
      sequenceInMicrocycle: 2,
      templateLibraryItemId: defaultTemplateId,
      label: "训练日 B",
      notes: "",
      progressionOverrides: [],
    },
    {
      dayCode: "C",
      sequenceInMicrocycle: 3,
      templateLibraryItemId: defaultTemplateId,
      label: "训练日 C",
      notes: "",
      progressionOverrides: [],
    },
  ];

  return {
    name: "",
    splitType: "three_way",
    notes: "",
    enabled: true,
    days,
    microcycleSlots: applySlotPreset("three_way_r2", days),
  };
}

export function computeSlotSummary(draft: PackageDraft) {
  const trainCount = draft.microcycleSlots.filter((slot) => slot.type === "train").length;
  const restCount = draft.microcycleSlots.length - trainCount;
  const weeklyTrainFrequency =
    draft.microcycleSlots.length > 0
      ? Number(((trainCount / draft.microcycleSlots.length) * 7).toFixed(1))
      : 0;
  const slotLabel = draft.microcycleSlots
    .map((slot) => (slot.type === "rest" ? "R" : slot.dayCode ?? "T"))
    .join("/");

  return {
    trainCount,
    restCount,
    weeklyTrainFrequency,
    slotLabel,
  };
}
