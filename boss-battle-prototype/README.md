# Boss Battle Prototype

这个原型把 Seedance2 生成的视频当成底层演出，把回合制战斗、UI、输入和判定放在 React/TypeScript 上层。

## 技术方案

- 运行时：Vite + React + TypeScript
- 视频层：`HTMLVideoElement`，由 `src/clips.ts` 的 manifest 控制；非循环动作由 `ended` 事件驱动结算
- UI 层：DOM HUD，负责血条、AP、姿态、日志、指令栏和 QTE
- 战斗逻辑：`src/game.ts` 定义状态、行动、QTE 窗口与数值
- 资源策略：原始 6 分 51 秒视频被裁成全画幅 720p clip，避免运行时 seek 大视频
- 转场策略：视频舞台使用双层 `<video>` 交叉淡入淡出；状态推进仍由当前 active clip 的 `ended` 事件触发

## 战斗循环

1. Boss 登场 clip 播放。
2. 玩家回合选择技能，消耗 AP。
3. 技能 clip 完整播完后，TypeScript 结算伤害、姿态、易伤、护持和中毒。
4. 姿态满则进入 BREAK，破防 clip 完整播完后允许奥义追击。
5. 否则进入敌方回合，敌方攻击 clip 完整播放。
6. 敌方同一条攻击 clip 内包含多段 QTE，玩家按 Space 或点击 PARRY，按时机判定 Perfect / Guard / Miss。
7. 胜负、二阶段、破防、回合推进全部由状态机控制，视频不保存游戏状态。

## 当前剪辑表

| Clip | 原片时间段 | 用途 |
| --- | --- | --- |
| `boss_intro.mp4` | 03:30.000 - 03:44.000 | Boss 从剧情镜头进入战斗对峙。 |
| `boss_idle.mp4` | 03:44.000 - 03:48.000 | 常规玩家回合循环待机。 |
| `player_strike.mp4` | 04:39.200 - 04:56.600 | 玩家完整连段，保留起手、命中反馈和收招。 |
| `enemy_assault.mp4` | 04:24.000 - 04:35.400 | Boss 扑杀，QTE 窗口对齐内置 B 提示和冲击帧。 |
| `break_state.mp4` | 05:18.000 - 05:27.400 | BREAK 后 Boss 跪伏，玩家接近。 |
| `break_idle.mp4` | 05:23.200 - 05:27.000 | 破防机会循环，等待玩家确认奥义。 |
| `finisher.mp4` | 05:28.000 - 05:44.800 | 奥义标题、蓄力、落雷和击倒结算。 |
| `victory.mp4` | 05:44.400 - 05:50.500 | 倒地与胜利收尾。 |

## 运行

```bash
npm install
npm run dev
```

然后打开 Vite 输出的本地地址。

## Seedance2 正式资产要求

- 输出无 UI、无字幕的纯画面；如果概念验证阶段视频里已烧录 UI，原型仍保持全画幅，不再中心裁切。
- 每个状态单独生成：intro、idle loop、player attack、enemy attack、break、finisher、victory、defeat。
- 每个 clip 保持角色服装、镜头轴线、场景光照稳定。
- idle clip 需要能循环；攻击 clip 需要预留交互判定点。
- 破防建议拆成 break intro 与 break idle，否则玩家等待输入时会从倒地跳回常规待机。
- 上下边缘预留 HUD 安全区，避免角色关键动作被 UI 遮挡。
