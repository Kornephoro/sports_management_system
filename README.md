# Sports Management System (v1 Scaffold)

本仓库当前处于 **第 1 轮：项目骨架与基础设施**。

已完成：

- Next.js + TypeScript + Tailwind CSS
- Prisma 初始化（最小 `schema.prisma`）
- Supabase 基础依赖与客户端封装
- 环境变量读取与 Zod 校验
- 基础目录结构（`src/app`、`src/components`、`src/features`、`src/lib`、`src/server`、`src/types`、`prisma`、`docs`）

## Quick Start

1. 安装依赖

```bash
npm install
```

2. 复制环境变量模板并填写

```bash
cp .env.example .env.local
```

3. 本地运行

```bash
npm run dev
```

4. 打开页面

- http://localhost:3000

## Validation

```bash
npm run lint
npm run typecheck
npm run build
npm run prisma:validate
```

> 说明：当前 Prisma 为骨架阶段，未定义业务模型、migration、seed。

## V1 Regression Verify

统一回归入口：

```bash
npm run verify:v1
```

`verify:v1` 会在本地生成回归摘要文件（默认）：`artifacts/verify-v1-summary.json`

提交前最小检查：

```bash
npm run preflight:v1
```

CI workflow：`.github/workflows/v1-regression.yml`

- 自动执行：`pull_request`、`push(main)`、`workflow_dispatch`
- 关键步骤：`npm ci` -> `npm run prisma:generate` -> `npm run db:seed` -> `npm run verify:v1`
- CI 会上传 artifact：`v1-regression-summary`（来自 `artifacts/verify-v1-summary.json`，失败时也会尝试保留）
- 需要配置的 GitHub Secrets：
  - `DATABASE_URL`
  - `DIRECT_URL`
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`

PR 模板包含最小门禁勾选项（已执行 `preflight:v1`）：`.github/pull_request_template.md`

## Demo Rehearsal (Round 14)

第二次内部演示前最小联调彩排入口：

```bash
npm run verify:demo-readiness
```

该命令会执行：

- Demo Program 存在且 `planning_ready` 检查
- `npm run verify:v1`（覆盖 Program / Observation / Evidence / Constraint-Injury 闭环）
- 输出演示重点与注意事项（包含 Evidence parse 仍为 mock）

结果产物：

- `artifacts/demo-readiness-summary.json`

失败时最小处理建议：

- Demo Program 缺失或未就绪：先执行 `npm run db:seed`
- 回归失败：查看 `artifacts/verify-v1-summary.json` 中的失败子任务后修复再重试

## Demo Environment Precheck (Round 15)

`verify:demo-readiness` 现在会在回归前先做环境前置检查：

- 必需环境变量存在性（`DATABASE_URL`、`DIRECT_URL`、`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`）
- 数据库最小连通性探测（`SELECT 1`）

若失败，仍会输出并落盘 summary：

- `artifacts/demo-readiness-summary.json`

并给出分类后的 nextActions（如 TLS/网络/认证），便于在演示前快速定位环境问题。
