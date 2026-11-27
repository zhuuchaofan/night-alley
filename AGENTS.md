# AGENTS.md — 夜巷 (Night Alley)

1987 年老城区夜巷割草生存原型：守夜学徒手持桃木剑，在成群心魔与夜行物中活到天亮。Phaser 3.90.0 + TypeScript 5.9.x + Vite 8.3.8 + Vitest + Playwright。公开仓库 `zhuuchaofan/night-alley`。

- 概念：`docs/concept.md`（一页纸 v0.1）。实现以概念为准，概念没写的不要做
- 原型期：全用色块与系统字，不画像素美术、不做音效、不做存档

## 角色

- **PM**：朱超凡（制作人）——定方向、玩法、最终验收
- **PL**：babyball（Muse）——策划、调度、质控、发布；起草任务、独立验收、合并、验 live
- **开发**：AGY（Antigravity CLI）——按任务实现、开 PR、部署
- **产品**：Codex CLI——需求对齐、平衡核查、玩家体验审稿；不写游戏代码
- **测试玩家**：Grok——PM 单独控制，不归 PL 调度

## 命令

- `npm run build`：`tsc --noEmit && vite build`
- `npm test`：单测（vitest run）
- `npm run test:e2e`：E2E（playwright test）
- `npm run dev`：本地预览

## 铁律

- 本地构建 + 单测 + E2E 全绿之前不推；合并 ≠ 部署，合完必须截图验 live 页
- Vite 部署 GitHub Pages 子路径必须 `base: './'`，否则 404
- 只改任务范围内的文件，不要动无关文件
- 代码、文案、美术 100% 原创：开源参考只看设计，不抄代码、文案、美术

## 最小改动（禁过度防御）

Make the smallest change that fully solves the task. Do not add abstractions, fallbacks, defensive guards, refactors, or features unless they are strictly required.

- 不为本项目不会发生的情况加 feature flag、迁移框架、兼容层、包装层；不为理论上的边界情况加分支
- 上游已保证、类型系统已排除的值，不要层层判空；不要用 try/catch 吞掉真正的错误

## 模型路由

- 提案/方案/文案 → Gemini Orchestrator (Neon)：`--model gemini-pro-orchestrator-neon`
- 改代码/查 bug → Claude Sonnet 5.5 Medium：`--model claude-sonnet-5-5-medium`（Claude+GPT 周额度为 0 时改走 Gemini）
- 审查 → Codex CLI（ChatGPT Plus）
- agy 内的 `gpt-oss-120b-medium` 是 GPT-OSS 120B 开源模型，不是 GPT-6.2，不用于严谨任务
- 每次调用须显式加 `--model`，settings.json 的 model 键不生效

## 审查门（Codex 只读审 PR，合并前）

- 挡上线（Block）：算错数（钱/血量/伤害等数值）、丢数据、越权改动（改了任务范围之外的文件或规则）
- 其他只记建议（Suggestion），不挡
- 最多审两轮。审稿意见先由 PL 核实（跑测试/读代码），核实过的才进修整单，未核实的丢弃并注明原因

## 错一次，补一个测试

- 每个被纠正的 bug，必须留下一个能拦住它的测试或检查（单测或 E2E），随修复一起提交
- 写成文字规则是最后的办法：能用测试拦住的，不写规则
