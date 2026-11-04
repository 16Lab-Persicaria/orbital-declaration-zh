# Orbital Declaration

一款跑在浏览器里的硬科幻太空战斗游戏。舰船按牛顿运动定律和火箭方程运动，所以每次点火都要花掉再也回不来的速度增量。主推进器和炮位把热灌进热沉，只有散热板能把它排空。热沉一满，推进器就只剩四分之一，所有炮位停火，直到它排空。每艘舰都在辐射，每个传感器都看得见，所以太空里没有隐身。2211 年，木星的卫星签署《宣言》，脱离内星系管理局。你为木星盟约而战：八个剧情章节、一场横跨木星周围十一处地点的战役、自己搭建的遭遇战，还有一个让你设计自己舰船的船坞。

在 https://orbital-declaration.netlify.app 游玩英文原版。

物理设定遵循 Atomic Rockets (Project Rho)：https://projectrho.com/public_html/rocket/。游戏和那个网站不一致的地方，就是游戏的 bug。

## 本地游玩

游戏是纯 JavaScript 和 Canvas 2D。玩之前不需要构建或安装任何东西。

- 在浏览器里打开 `index.html`。所有东西都从目录里加载。在 `file://` 页面上，Chromium 会记录两条被拦截的字体预加载。字体仍会通过 `@font-face` 加载，忽略即可。
- 或者按线上站点的方式起个服务：运行 `node tools/serve.js`，打开 http://127.0.0.1:8787/。这个服务会套用 `netlify.toml` 里的响应头，包括 Content-Security-Policy，所以在会在线上坏掉的改动会先在这里坏掉。这个脚本接受一个目录和一个端口，8787 被占用时，`node tools/serve.js . 8790` 就用 8790 起这个目录。需要 Node 18 或更新版本。

## 运行自检

这些自检用 Playwright 在 Chromium 里无头驱动游戏。先安装一次 Playwright：

```
npm install -g playwright
npx playwright install chromium
```

在仓库根目录运行这些游玩测试。`NODE_PATH` 让 Node 指向装着 Playwright 的全局模块目录：

```
NODE_PATH=$(npm root -g) node tools/harness.js
```

`tools/harness.js` 跑十三个场景：页面加载、第一章打到结束、地图和面板上的点击与下单、物理面板、木卫三 (Ganymede) 的一场遭遇战、第五章的追击、一场战役战斗、每个章节跑 120 秒、250 公里处护卫艇的光束对决、400 公里处驱逐舰对一艘枪骑兵级和一艘护卫艇、火控和点防御一路打到损伤报告、传感器与决策、损管与船员。沿途跑 86 项检查，每项打印 `ok` 或 `FAIL`，有任何失败就以退出码 1 退出。设 `OD_URL=http://127.0.0.1:8787/` 可以让它对着起好的服务跑，而不是对着文件目录。

每个检查脚本覆盖游戏的一部分。表里没点名的模块没有自己的脚本。每个的跑法都和 harness 一样，除 `sound-check.js` 外也都接受 `OD_URL`。那一个从目录里加载自己的页面 `tools/sound-preview.html`。

| 脚本 | 检查什么 |
| --- | --- |
| `tools/autopilot-check.js` | 一条指令变成航向和点火，以及 AI 挑选指令（OD.Autopilot、OD.AI） |
| `tools/engagement-check.js` | 没有目标、没有发射舱、没有光束、没有点防御时的炮位读数与射程 |
| `tools/damage-check.js` | 部件损伤与应急抢修（OD.Damage） |
| `tools/crew-check.js` | 船员班组、派往哪里、加速度对人做什么（OD.Crew） |
| `tools/sensors-check.js` | 传感器、信号特征与解算质量（OD.Sensors） |
| `tools/decisions-check.js` | 决策卡在对的时刻出现、说该说的话（OD.Decisions） |
| `tools/objectives-check.js` | 脱离并跑掉的敌舰计为已驱离（OD.Sim） |
| `tools/bridge-check.js` | 控制台流程：战况屏、简报、机库、改装、键盘 |
| `tools/main-check.js` | 游戏外壳：战后简报、暂停、遭遇战面板、改装账目 |
| `tools/sound-check.js` | 音效与其节流，以及没有 WebAudio 时每次调用都是空操作（OD.Sound） |
| `tools/art-check.js` | 近距离缩放时，舰船立绘显示开火的炮位、离架的拦截弹、开着的点防御、泄漏的破口推进剂箱和作业中的修理班组（OD.ShipArt） |
| `tools/bridge-shots.js` | 截图到 `tools/bridge-shots/`：除战况屏外的每个控制台屏，1440×900；菜单、简报、遭遇战面板、机库，390×844。点击没有完成跳转就失败 |

## 部署

`node tools/build-site.js dist` 把站点需要的文件复制进 `dist/`，并给每个脚本 URL 盖上内容哈希。改过的脚本拿到新 URL，所以 `netlify.toml` 里 `/js/*` 的一年缓存期永远不会吐出旧脚本。`node tools/serve.js dist` 把这份复制起个服务，供最后过目。线上站点就是 Netlify 站点 `orbital-declaration`。它用 Netlify 部署工具从那份复制部署，而不是由 Netlify 从这个仓库构建：`netlify.toml` 没有构建命令，直接连到仓库的站点会把带着未盖哈希脚本 URL 的源码目录按一年缓存发出去。

## 文件

- `index.html`：页面、样式和脚本清单。所有东西都挂在 `window.OD` 上。
- `SPEC.md`：模块契约与设计记录。每个版本都写了加了什么、评审发现了什么、改了什么。
- `js/`：22 个脚本，按此顺序加载。
  - `util.js`：辅助函数。处处都是 SI 单位，只在显示边缘做格式化。
  - `physics.js`：火箭方程、引力、光束光斑尺寸、弹丸飞行时间，以及每个散热板数字背后的热平衡。
  - `ships.js`：舰级及其数值。
  - `autopilot.js`：把一条指令变成航向和油门。舰船只沿舰首方向推进。
  - `ai.js`：电脑控制的舰船挑选指令。自动驾驶负责飞。
  - `guide.js`：规划器与领航员。用真实自动驾驶把一条指令预先跑一遍，用大白话说出会发生什么。
  - `damage.js`：部件损伤。一次命中先破舰体完整度，然后落在某个部件上：主推进器、反应堆、传感器、一块散热板、一个推进剂箱或一个炮位。
  - `crew.js`：以班组部署的船员，以及加速度对人做什么。
  - `sensors.js`：传感器与信号特征。每艘舰都在辐射，其功率除以距离平方决定解算质量。
  - `sim.js`：模拟核心。单个引力天体下的运动、热量、登舰、目标、触发器。
  - `shipart.js`：程序化舰船立绘。构建生成，从不手改（见下）。
  - `render.js`：Canvas 2D 渲染器。
  - `ui.js`：HUD、提示框、物理面板和 DOM 界面。
  - `sound.js`：音效，全部用 WebAudio 合成。
  - `bridge.js`：舰桥控制台。菜单画在战术画布上。
  - `story.js`：八个章节。
  - `campaign.js`：木星战役。十一处地点、一支延续的舰队、回合。
  - `skirmish.js`：遭遇战设置。
  - `engagement.js`：炮位对舰体做什么。光束、线圈炮弹丸、拦截弹和点防御。
  - `decisions.js`：决策卡。模拟里的取舍，作为选择摆到玩家面前。
  - `configurator.js`：船坞设计台。每个选择都同时改动数值和图形。
  - `main.js`：游戏外壳。主循环、输入与各模式。
- `assets/ships/src/`：舰船立绘源码。`core.js` 是渲染器，其余每个脚本是一个舰体族，各自的 `README.md` 说明一个族怎么写。`sh assets/ships/build.sh`（在仓库根目录下）把它们按 core 在前的顺序拼接成 `js/shipart.js`，并在替换文件前先在 Node 里加载一遍。`assets/ships/renders/` 收着每个舰体的渲染视图。
- `assets/site/`：图标、社交分享卡和自托管字体。
- `assets/configurator/shots/`：船坞的截图。
- `tools/`：harness、各检查脚本、本地服务、站点构建、图标与社交卡的渲染器（`site-render.html` 配 `site-render.js`，无头运行），以及三个改模块时在浏览器里打开的预览页：看舰船立绘的 `shipart-preview.html`、看船坞的 `configurator-preview.html`、听音效的 `sound-preview.html`。
- `404.html`、`manifest.webmanifest`、`robots.txt`、`favicon.ico`、`netlify.toml`：托管用。

## 许可证

MIT，见 `LICENSE`。`assets/site/fonts/` 里的字体（Rajdhani、IBM Plex Mono、IBM Plex Sans）按 SIL Open Font License 1.1 授权，见 https://openfontlicense.org。目录里只带子集化后的字体文件，不带许可证文本。
