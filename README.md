# 夜巷 NIGHT ALLEY

1987 年老城区夜巷割草生存原型：守夜学徒手持桃木剑，在成群心魔与夜行物中活到天亮——边走边打，越打越强。

- 概念：`docs/concept.md`
- 一局 3 分钟：撑到天亮 = 胜；血条见底 = 败
- 唯一主动操作是移动（WASD/方向键，手机拖动）；攻击全自动；升级三选一是唯一的决策点

## 本地运行

```bash
npm ci
npm run dev      # 本地预览
npm run build    # tsc + vite build
npm test         # 单测
npm run test:e2e # E2E（需先 npm run build）
```

## 技术

Phaser 3.90.0 + TypeScript 5.9.x + Vite 8.3.8 + Vitest + Playwright。原型期全用色块与系统字，不画像素美术、不做音效。
