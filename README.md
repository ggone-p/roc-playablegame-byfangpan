# ROC 试玩原型

Creator 版本：Cocos Creator 3.8.8

这是二合塔防 H5 试玩广告的第一版可玩原型工程。

## 打开和运行

1. 打开 Cocos Creator 3.8.8。
2. 导入项目目录：
   `C:\Users\fangpan\Documents\Codex\2026-04-24\cocos-3-e-project-p-roc\roc-playable-cocos`
3. 等 Creator 自动导入资源并生成 `.meta` 文件。
4. 打开 `assets/scenes/main.scene`。
5. 选中场景里的 `Canvas` 节点。
6. 把 `assets/scripts/GameMain.ts` 挂到 `Canvas` 节点上。
7. 保存场景，然后点击预览。

`GameMain.ts` 会在运行时生成 Canvas、背景、5x5 棋盘、传送带、怪物、子弹、特效、HUD 和手指引导。

## 当前玩法

- 5x5 棋盘。
- 棋盘命中区对齐下方石板 5x5，不额外绘制网格。
- 传送带随机生成 1 级棋子，可拖拽到棋盘放置。
- 棋盘上的棋子也可以拖拽移动。
- 同角色、同等级棋子拖到一起二合一升级。
- 1 级棋子不攻击。
- 2 级及以上自动攻击。
- 只有剑士是近战。
- 弓箭手、摩卡、溜溜猴、魔法师是远程。
- 等级越高攻速越快。
- 5 级弓箭手会定时释放剑雨技能。
- 魔物沿 5 条带透视的纵向路线从上往下移动，远小近大。
- 当前先刷小恶魔，再刷毒魔菇；为了稳定可见，怪物暂时使用 PNG 序列帧，Spine 资源已保留在工程中，后续单独接。

## 主要调参位置

打开 `assets/scripts/GameMain.ts`，顶部这些常量可以直接调：

- `CONVEYOR_Y`
- `BOARD_TOP_Y`
- `BOARD_BOTTOM_Y`
- `BOARD_TOP_WIDTH`
- `BOARD_BOTTOM_WIDTH`
- `PATH_TOP_WIDTH`
- `PATH_BOTTOM_WIDTH`
- `MONSTER_START_Y`
- `MONSTER_END_Y`

棋子攻击参数在 `PIECES` 配置里，魔物血量在 `MONSTER_HP` 里。

## H5 试玩注意

当前弓箭手剑雨是全屏 PNG 序列帧，适合先验证玩法和表现，但最终导出试玩广告前建议优化：
抽帧、压缩纹理、合图，或者改成更轻量的粒子/图集方案。
