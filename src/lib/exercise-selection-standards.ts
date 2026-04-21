export type ExerciseSelectionInput = {
  movement_pattern?: string;
  primary_muscle?: string;
  role?: "main" | "secondary" | "accessory";
  recording_mode?: string;
  require_bodyweight?: boolean;
  allow_extra_load?: boolean;
  allow_assistance?: boolean;
  exclude_exercise_ids?: string[];
  limit?: number;
};

export type ExerciseSuggestion = {
  exercise_id: string;
  name: string;
  score: number;
  reasons: string[];
};

export const EXERCISE_SELECTION_ROLE_OPTIONS: Array<{
  value: "main" | "secondary" | "accessory";
  label: string;
}> = [
  { value: "main", label: "主项" },
  { value: "secondary", label: "次主项" },
  { value: "accessory", label: "辅助" },
];

export const EXERCISE_SELECTION_RECORDING_MODE_OPTIONS: Array<{
  value: string;
  label: string;
}> = [
  { value: "strength", label: "常规力量（strength）" },
  { value: "reps_only", label: "仅次数（reps_only）" },
  { value: "duration_only", label: "仅时间（duration_only）" },
  { value: "bodyweight_load", label: "自重附重（bodyweight_load）" },
  { value: "assisted", label: "自重辅助（assisted）" },
  { value: "intervals", label: "间歇体能（intervals）" },
];
