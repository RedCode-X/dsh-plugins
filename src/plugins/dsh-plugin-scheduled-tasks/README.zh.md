# @opendsh/dsh-plugin-scheduled-tasks

DSH Web 插件：**项目级定时任务**。在侧边栏点击 ⏰ 定时任务，为任务填写提示词，
到点后插件会在项目目录下启动一个全新的 agent 会话执行该提示词，并把运行结果
记录为持久化的运行历史。

## 功能

- **按项目（workspace）管理任务**：面板按当前选中的项目目录过滤任务列表。
- **三种调度类型**
  - `at` 一次性：在指定时刻运行一次（严格 RFC 3339 时刻，或「本地日期时间 +
    IANA 时区」；夏令时跳变时刻被拒绝，重叠时刻取更早的一个）。
  - `every` 周期：按创建锚定的固定间隔运行（≥ 5 分钟）；错过的周期不补跑，
    只运行最近一次到期的那一次。
  - `cron`：Cron 日历规则（五/六/七段表达式，如 `0 9 * * 1-5`，
    在显式 IANA 时区中求值，DST 感知）。
- **提示词执行**：到点后在项目目录下创建一个全新的 agent 会话，推送任务提示词并
  驱动到结束（与 `dsh --profile headless` 相同的驱动方式）。运行会话会出现在
  对应项目的对话列表中，并钉上「⏰ 任务名」标题，可随时点开查看完整对话；
  运行结束后会话保持注册（不销毁），列表中的记录不会消失。
- **运行历史**：状态（运行中 / 成功 / 失败）、起止时间、输出（上限 20 KB）、
  详细错误诊断（provider 错误码、blocked / max-tokens 等原因）；按时间倒序，
  每任务最多保留 20 条（可配置）。
- **立即运行**：不改变原计划，立刻执行一次。
- **生命周期语义**
  - 仅在 DSH Web 进程存活期间触发。重启后：到期的一次性任务补跑一次并标记
    「补跑」；周期任务只补最近一次到期。
  - 一次性任务运行后自动结束；周期任务保持启用并推进到下一个锚定目标。

## 架构

安装进 `web` profile 的双面 npm 包：

| 半边 | 入口 | 职责 |
|---|---|---|
| 服务端 | `lib/index.js` | Cordis 插件：打开 `scheduled_tasks` 存储领域（`ctx.storageDomain`），挂载任务存储、调度器（分段定时器、唤醒重读时钟防回拨）、headless 执行器与 `ctx.tasks` typert 服务。 |
| 协议 | `lib/typert.js` | Host TYPERT 清单（`tasks/*` 端点），由 `dsh-typert-loader` 自动注册。 |
| 浏览器 | `lib/client.js` | React 面板，挂载到 `sidebar.footer.action` 座位，通过安装的 `remote.tasks` 命名空间调用服务端。 |

客户端↔服务端走 DSH typert 协议（与 `dsh-commands` 同机制）：两侧都用严格的
zod 编解码校验参数与结果，面板不依赖任何会话存在。

## 安装

```sh
# 在 dsh-plugins 工作区根目录
pnpm install
pnpm --dir src/plugins/dsh-plugin-scheduled-tasks build

# 装入 web profile 并注册 loader 行
cd ~/.dsh/profiles/web
pnpm add "@opendsh/dsh-plugin-scheduled-tasks@file:/绝对路径/src/plugins/dsh-plugin-scheduled-tasks"
```

在 `~/.dsh/profiles/web/cordis.patch.yml` 中加入：

```yaml
- insert:
    - id: scheduled-tasks
      name: '@opendsh/dsh-plugin-scheduled-tasks'
```

重启 `dsh web`，侧边栏底部会出现 ⏰ 定时任务 按钮。

## 开发

```sh
pnpm --dir src/plugins/dsh-plugin-scheduled-tasks typecheck   # tsc（TypeScript 7）
pnpm --dir src/plugins/dsh-plugin-scheduled-tasks test        # vitest
pnpm --dir src/plugins/dsh-plugin-scheduled-tasks build       # tsc 产物 + tsdown 客户端 bundle + loader 包装
```

改动后需重新 build，并在 profile 内执行 `pnpm install` 同步 `file:` 依赖副本，
然后重启 `dsh web`（插件没有 HMR 通道）。

## 配置

| 键 | 默认 | 含义 |
|---|---|---|
| `maxConcurrentRuns` | `2` | 所有任务同时运行的 agent 会话数上限。 |
| `keepRunsPerTask` | `20` | 每任务保留的运行历史条数（超出删除最旧）。 |

## 已知限制

- 仅 Web 进程存活期间触发（与 `dsh-schedule` 一致），进程关闭时无外部唤醒。
- 每次运行消耗默认模型的 token——面板中已明确提示。
- 运行历史在面板打开时轮询刷新（10 秒间隔）；推送更新列为后续工作。
