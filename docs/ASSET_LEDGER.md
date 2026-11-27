# 素材台账（ASSET_LEDGER）

> 画面升级迭代建立。任何外部素材（字体、图片、参考资源）须先在此登记来源与许可证，再进入项目使用。

## 字体

| 项目 | 内容 |
|------|------|
| 名称 | Fusion Pixel Font（缝合像素字体）12px 等宽简体中文版（`fusion-pixel-12px-monospaced-zh_hans.ttf`） |
| 版本 tag | `2026.11.10`（Release 资产 `fusion-pixel-font-12px-monospaced-ttf-v2026.11.10.zip`） |
| 来源 URL | https://github.com/TakWolf/fusion-pixel-font/releases/tag/2026.11.10 |
| 作者 | TakWolf（https://takwolf.com） |
| 许可证 | SIL Open Font License 1.1（OFL-1.1），许可全文副本见 [OFL.txt](./fonts/OFL.txt) |
| 用途 | 游戏内全部场景文字（标题、HUD、升级卡、结算、按钮与操作提示）的位图字体渲染（点阵 JSON `src/data/pixel-font.json` 复用自当铺项目并通过 `scripts/merge-pixel-font.py` 补全缺失字形；原始 TTF 仅放 `/tmp`，不入库）。运行时正文以 24px、标题以 48px 显示：12px 图集经 Phaser `BitmapText` 整数 2×/4× NEAREST 放大 |
| 是否修改 | 仅按项目用字子集化并做 12px 阈值二值化（灰度 > 128）转为 1-bit 点阵 JSON，未修改任何字形设计 |
| 上游第三方许可 | Fusion Pixel 缝合自以下上游开源像素字体（本仓库统一将 SIL OFL 1.1 许可全文副本存放在 [docs/fonts/OFL.txt](./fonts/OFL.txt)）：<br>1. **Ark Pixel Font**（TakWolf，https://github.com/TakWolf/ark-pixel-font ）— SIL OFL 1.1<br>2. **Cubic 11（俐方體 11 號）**（含 JF Dot M+H 12 / M+ BITMAP FONTS 声明）— SIL OFL 1.1<br>3. **Galmuri**（Copyright (c) 2019–2025 Lee Minseo）— SIL OFL 1.1 |

## 像素美术

- `src/data/pixelart.ts`（守夜学徒待机与行走 2 帧、纸人影、灯笼怪、经验珠、桃木剑挥砍弧光、铜钱镖、灯笼火圈 2 帧、夜巷地面砖纹、两侧墙体剪影、挂灯笼与硬边光晕/暗角）：项目原创手写 32×32 像素点阵，严格使用 16 色主调色板（每图 ≤ 12 色），未使用任何外部图片素材或 AI 生图；经 `src/game/pixelart.ts` 按 2×2 最近邻块渲染为 64×64 纹理。
