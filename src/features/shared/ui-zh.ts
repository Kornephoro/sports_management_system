import { TRAINING_SET_TYPE_OPTIONS } from "@/lib/training-set-standards";

export const TERMS_ZH = {
  program: "训练计划",
  block: "训练阶段",
  sessionTemplate: "训练日模板",
  trainingUnitTemplate: "训练单元模板",
  plannedSession: "已安排训练",
  plannedUnit: "已安排训练单元",
  execute: "实时训练",
  sessionExecution: "训练执行记录",
  unitExecution: "训练单元执行记录",
  observations: "身体状态记录",
  evidence: "证据",
  constraint: "限制因素",
  injury: "伤病事件",
  today: "今日训练",
  executions: "训练记录",
  rpe: "主观用力程度（RPE）",
} as const;

const PROGRAM_STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  active: "进行中",
  paused: "已暂停",
  completed: "已完成",
  archived: "已归档",
};

const SPORT_TYPE_LABELS: Record<string, string> = {
  strength: "力量",
  hypertrophy: "增肌",
  running: "跑步",
  swimming: "游泳",
  racket: "球拍类",
  functional: "功能性训练",
  mixed: "混合训练",
};

const BLOCK_TYPE_LABELS: Record<string, string> = {
  accumulation: "累积期",
  intensification: "强化期",
  peaking: "峰值期",
  deload: "减量恢复期",
  maintenance: "维持期",
  technique: "技术期",
  base: "基础期",
  return_to_training: "回归训练期",
};

const SESSION_STATUS_LABELS: Record<string, string> = {
  planned: "待训练",
  ready: "可执行",
  partial: "部分完成",
  completed: "已完成",
  skipped: "已跳过",
  canceled: "已取消",
};

const SESSION_EXECUTION_STATUS_LABELS: Record<string, string> = {
  completed: "已完成",
  partial: "部分完成",
  skipped: "已跳过",
  aborted: "已中止",
  extra: "额外训练",
};

const UNIT_EXECUTION_STATUS_LABELS: Record<string, string> = {
  completed: "已完成",
  partial: "部分完成",
  skipped: "已跳过",
  failed: "失败",
  replaced: "已替换",
  dropped: "已移除",
};

const EVIDENCE_PARSE_STATUS_LABELS: Record<string, string> = {
  pending: "待解析",
  parsed: "已解析",
  needs_review: "待人工复核",
  confirmed: "已确认",
  rejected: "已驳回",
  failed: "解析失败",
};

const EVIDENCE_ASSET_TYPE_LABELS: Record<string, string> = {
  image: "图片",
  screenshot: "截图",
  pdf: "PDF 文档",
  other: "其他",
};

const CONSTRAINT_STATUS_LABELS: Record<string, string> = {
  active: "生效中",
  monitoring: "观察中",
  resolved: "已解除",
};

const CONSTRAINT_DOMAIN_LABELS: Record<string, string> = {
  mobility: "活动度",
  stability: "稳定性",
  pain: "疼痛",
  injury: "伤病",
  load_tolerance: "负荷耐受",
  return_to_training: "回归训练",
};

const CONSTRAINT_SEVERITY_LABELS: Record<string, string> = {
  low: "低",
  moderate: "中",
  high: "高",
};

const INJURY_STATUS_LABELS: Record<string, string> = {
  acute: "急性期",
  monitoring: "观察中",
  recovering: "恢复中",
  resolved: "已恢复",
  recurring: "反复出现",
};

const INJURY_TYPE_LABELS: Record<string, string> = {
  pain: "疼痛",
  strain: "肌肉拉伤",
  sprain: "扭伤",
  overuse: "过度使用",
  mobility_loss: "活动度下降",
  other: "其他",
};

const EVIDENCE_DOMAIN_HINT_LABELS: Record<string, string> = {
  training: "训练",
  nutrition: "饮食",
  body_metric: "身体指标",
  health: "健康",
  rehab: "康复",
  other: "其他",
};

const METRIC_LABELS: Record<string, string> = {
  bodyweight: "体重",
  waist_circumference: "腰围",
  resting_heart_rate: "静息心率",
  sleep_hours: "睡眠时长",
  fatigue_score: "疲劳评分",
};

const UNIT_ROLE_LABELS: Record<string, string> = {
  main: "主项",
  secondary: "次主项",
  accessory: "辅助项",
  skill: "技术",
  conditioning: "体能",
  warmup: "热身",
  cooldown: "冷却",
  mobility: "活动度",
  prehab: "预防性训练",
};

const PROGRESSION_FAMILY_LABELS: Record<string, string> = {
  strict_load: "严格负重",
  threshold: "阈值推进",
  exposure: "暴露次数",
  performance: "表现维持",
  autoregulated: "自我调节",
};

const PROGRESSION_POLICY_TYPE_LABELS: Record<string, string> = {
  linear_load_step: "线性进步 / Linear Progression",
  linear_periodization_step: "线性周期 / Linear Periodization",
  scripted_cycle: "脚本周期",
  double_progression: "双进阶 / Double Progression",
  total_reps_threshold: "总次数阈值进阶 / Total Reps Threshold Progression",
  add_set_then_load: "先加组后加重",
  reps_then_external_load: "先次数后外部负重",
  duration_threshold: "时长阈值",
  bodyweight_reps_progression: "自重次数进步",
  hold_or_manual: "维持或手动",
  manual: "手动",
};

const ADJUSTMENT_POLICY_TYPE_LABELS: Record<string, string> = {
  always: "总是调整",
  rotating_pool: "轮换池",
  gated: "门控调整",
  manual: "手动",
};

const TRAINING_SET_TYPE_LABELS: Record<string, string> = Object.fromEntries(
  TRAINING_SET_TYPE_OPTIONS.map((item) => [item.value, `${item.labelZh} / ${item.labelEn}`]),
);

export function labelOrRaw(value: string, map: Record<string, string>) {
  return map[value] ?? value;
}

export function getProgramStatusLabel(status: string) {
  return labelOrRaw(status, PROGRAM_STATUS_LABELS);
}

export function getSportTypeLabel(sportType: string) {
  return labelOrRaw(sportType, SPORT_TYPE_LABELS);
}

export function getBlockTypeLabel(blockType: string) {
  return labelOrRaw(blockType, BLOCK_TYPE_LABELS);
}

export function getSessionStatusLabel(status: string) {
  return labelOrRaw(status, SESSION_STATUS_LABELS);
}

export function getSessionExecutionStatusLabel(status: string) {
  return labelOrRaw(status, SESSION_EXECUTION_STATUS_LABELS);
}

export function getUnitExecutionStatusLabel(status: string) {
  return labelOrRaw(status, UNIT_EXECUTION_STATUS_LABELS);
}

export function getEvidenceParseStatusLabel(status: string) {
  return labelOrRaw(status, EVIDENCE_PARSE_STATUS_LABELS);
}

export function getEvidenceAssetTypeLabel(assetType: string) {
  return labelOrRaw(assetType, EVIDENCE_ASSET_TYPE_LABELS);
}

export function getConstraintStatusLabel(status: string) {
  return labelOrRaw(status, CONSTRAINT_STATUS_LABELS);
}

export function getConstraintDomainLabel(domain: string) {
  return labelOrRaw(domain, CONSTRAINT_DOMAIN_LABELS);
}

export function getConstraintSeverityLabel(severity: string) {
  return labelOrRaw(severity, CONSTRAINT_SEVERITY_LABELS);
}

export function getInjuryStatusLabel(status: string) {
  return labelOrRaw(status, INJURY_STATUS_LABELS);
}

export function getInjuryTypeLabel(type: string) {
  return labelOrRaw(type, INJURY_TYPE_LABELS);
}

export function getEvidenceDomainHintLabel(domainHint: string) {
  return labelOrRaw(domainHint, EVIDENCE_DOMAIN_HINT_LABELS);
}

export function getMetricLabel(metricKey: string) {
  return labelOrRaw(metricKey, METRIC_LABELS);
}

export function getUnitRoleLabel(unitRole: string) {
  return labelOrRaw(unitRole, UNIT_ROLE_LABELS);
}

export function getProgressionFamilyLabel(family: string) {
  return labelOrRaw(family, PROGRESSION_FAMILY_LABELS);
}

export function getProgressionPolicyTypeLabel(policyType: string) {
  return labelOrRaw(policyType, PROGRESSION_POLICY_TYPE_LABELS);
}

export function getAdjustmentPolicyTypeLabel(policyType: string) {
  return labelOrRaw(policyType, ADJUSTMENT_POLICY_TYPE_LABELS);
}

export function getTrainingSetTypeLabel(setType: string) {
  return labelOrRaw(setType, TRAINING_SET_TYPE_LABELS);
}

export function translateUiError(message: string) {
  const normalized = message.trim();

  if (normalized === "Validation failed") {
    return "请求参数校验失败，请检查输入内容。";
  }
  if (normalized === "Internal server error") {
    return "服务器暂时不可用，请稍后重试。";
  }
  if (normalized.startsWith("Request failed:")) {
    return `请求失败（${normalized.replace("Request failed:", "").trim()}），请稍后重试。`;
  }

  const replacements: Array<[string, string]> = [
    ["Program not found", "未找到训练计划"],
    ["Program has no session templates. Please choose a demo-ready program with SessionTemplate data first.", "当前训练计划没有可用训练日模板，请先选择包含模板数据的训练计划。"],
    ["No enabled session templates found under this program. Please enable at least one SessionTemplate.", "当前训练计划没有启用的训练日模板，请至少启用一个训练日模板。"],
    ["Enabled session templates found, but no TrainingUnitTemplate is attached. Please add at least one unit template.", "已启用训练日模板，但未配置训练单元模板，请至少添加一个训练单元。"],
    ["Planned session not found", "未找到已安排训练"],
    ["Session execution not found", "未找到训练执行记录"],
    ["Unit execution not found", "未找到训练单元执行记录"],
    ["Exercise library item not found", "未找到动作库条目"],
    ["EvidenceAsset not found", "未找到证据记录"],
    ["ConstraintProfile not found", "未找到限制因素记录"],
    ["InjuryIncident not found", "未找到伤病事件记录"],
    ["No changes to update", "未检测到可保存的变更"],
    ["Missing required query parameter: userId", "缺少必要参数：用户标识"],
    ["Missing required query parameter: metricKey", "缺少必要参数：指标标识"],
    ["Failed to load", "加载失败"],
    ["Generate failed", "生成失败"],
    ["Submit failed", "提交失败"],
    ["Upload failed", "上传失败"],
    ["Please retry", "请重试"],
    ["database connection issue", "数据库连接异常"],
    ["Mock parse can only be triggered when parse_status is pending", "仅在“待解析”状态下可以触发模拟解析"],
    ["Evidence can only be confirmed from parsed or needs_review status", "仅在“已解析/待人工复核”状态下可以确认"],
    ["Evidence can only be rejected from parsed or needs_review status", "仅在“已解析/待人工复核”状态下可以驳回"],
    ["Invalid parse status transition", "无效的解析状态流转"],
  ];

  let translated = normalized;
  for (const [from, to] of replacements) {
    translated = translated.replaceAll(from, to);
  }

  return translated;
}
