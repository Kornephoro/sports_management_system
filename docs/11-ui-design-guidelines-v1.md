# 健身系统 Mobile UI 设计规范 v1 (Design Guidelines)

这份文档旨在记录整个健身系统的 UI 重构与移动端设计指引。为了让你在之后发展后续功能或新增页面时依然保持相同的“酷炫”、“现代”及“类手机化”的体验，请在生成代码时查阅并严格遵守本指南。

## 1. 核心架构与容器

整个系统采用了 **“移动端优先” (Mobile First)** 策略。
所有的页面外层统一包裹使用 `PageContainer` 组件（在 `src/features/shared/components/ui-primitives.tsx` 中定义），在其中设置了以下限制规则：
- **约束宽度**：`max-w-[480px]` 和 `mx-auto`
- **满高布局**：`min-h-screen`, `pb-28` 留白

**原则**: 在开发任何新大屏组件时，均要假定当前可用宽度在 `320px` ~ `480px` 之间，尽量避免设计包含长横向滚动的非重要内容。

## 2. 色彩与主题 (Light & Dark Mode)

App 完全原生支持 `light` 与 `dark` 两种模式，并具备酷炫（不花哨）的高级感。

### 明色模式 (Light Mode)
背景注重清爽与留白：
- **底层背景**：通常为纯白 (`bg-white`)。
- **模块/Card背景**：纯白或具有极细边框 (`border-zinc-200`) 且微弱投影的表面 (`shadow-sm`)。
- **辅助背景**：`bg-zinc-50/50` / `bg-zinc-100` 用于分块、标签底色和数据容器。
- **主要文字**：`text-zinc-900` / `font-bold` 等确保层级分明。
- **次要文字**：`text-zinc-500` / `text-zinc-600`。

### 暗色模式 (Dark Mode)
暗色模式必须体现出“健身房专业训练设备”的高级黑金或灰蓝质感：
- **底层大面背景**：推荐使用极深的灰色或黑底 (`dark:bg-zinc-950` / `dark:bg-black`)。
- **模块/Card背景**：通常为 `dark:bg-zinc-900` 或者更深的 `dark:bg-zinc-900/50`。
- **边框**：极弱的环境光边框 `dark:border-zinc-800` / `dark:border-zinc-800/60` (注意使用微弱透明度防生硬)。
- **交互层**：选中态 / Hover 态常使用 `dark:bg-zinc-800` / `dark:hover:bg-zinc-800`。
- **文字明度**：深色模式文字一定**不能全量纯白**。
  - 大标题/数字强调：`dark:text-zinc-50` / `dark:text-zinc-100`。
  - 正文：`dark:text-zinc-300` / `dark:text-zinc-400`。
  - 非常次要的信息：`dark:text-zinc-600`。

### 品牌主色 (Accent Colors)
请一概使用具有科技感的尾缀为 `500` 或 `600` 的蓝 / 绿 / 橙：
- **Primary / 核心操作**: `bg-blue-600` (Light) -> `dark:bg-blue-500` (Dark)
- **Success / 完成**: `text-emerald-700` -> `dark:text-emerald-400`
- **Warning / 异常**: `text-orange-700` -> `dark:text-orange-400` / `dark:text-amber-400`

## 3. 基础组件级审美 (Component Aesthetics)

所有的视觉核心要传递出原生 iOS APP 组件感，抛弃默认死板的矩形：

### 1) 卡片 (Cards)
基础数据面板和列表项都需要装载在圆角卡片中。
- 大板块圆角：请使用 **`.rounded-2xl`** 或 **`.rounded-3xl`** (例如弹窗)。
- 内部小级块：请使用 **`.rounded-xl`** 或 **`.rounded-lg`**。
- **阴影**：主副层级不要有过大黑色阴影。轻盈的 `shadow-sm` 足以应对日间模式，夜间模式甚至可以全靠色差过渡。

### 2) 按钮 (Buttons & Links)
- **主功能按钮 (Call to Action)**: 
  需块级化 (Block-level)、厚重，全宽居多，圆角要大 (`rounded-xl` 或 `rounded-2xl`)，并带有高度 Padding (`py-3`)。
- **次要标签/胶囊 (Pills)**: 
  使用 `rounded-full` 或者大圆形的标签 `px-3 py-1 text-xs font-semibold`，避免粗糙直角。

### 3) 各种表单/输入框 (Inputs)
- 不建议使用生硬的黑框，必须使用 `rounded-xl border border-zinc-300 dark:border-zinc-700 bg-transparent` 为输入框背书。
- 外设外边距应宽屏透气，点击区也要大 (`py-3`) 应对移动端肥手指。

### 4) 排版字体 (Typography)
- **字重强调**: 对主要数字、Title 要果断使用 **`font-extrabold`** 或 **`font-bold`**。
- **追踪度**: 标签内容可以适当使用 `.tracking-wide` 并配合 `.uppercase` (对英文有效) 来呈现科技专业度。

## 4. 示例：如何写一个兼容黑夜的标准模块？

遵循这里的 Tailwind Class：
```tsx
<div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
  <div className="flex items-center justify-between">
    <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">近期负荷</h3>
    <span className="rounded-lg bg-blue-100/80 px-2 py-1 text-xs font-bold text-blue-800 dark:bg-blue-900/40 dark:text-blue-400">
      提升中
    </span>
  </div>
  <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
    您的 5RM 硬拉在本周提升了 5kg。
  </p>
</div>
```

请在后续加入新的页面/功能点时，主动回看这份文档，确保你的新组件不跑偏，能严丝合缝地融入这款酷炫而克制的健身 APP 宇宙中。
