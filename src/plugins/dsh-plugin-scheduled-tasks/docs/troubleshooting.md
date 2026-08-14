# 排障记录：工具调用报 “Interrupted: interrupted”

> 适用：`@opendsh/dsh-plugin-scheduled-tasks`，也适用于任何为 DSH 写插件、需要注册 model-facing 工具的场景。

## 一句话结论

**DSH 插件绝不能把 `@deepseek-ai/*` 包放进 `dependencies`。** 这些是宿主（DSH Web）提供的 peer 依赖，必须走 `peerDependencies`；一旦放进 `dependencies`，pnpm 会为插件解析出第二份副本，导致 `@deepseek-ai/dsh-tools` 里的 `Symbol` 身份错乱，最终**所有工具调用**都会失败。

## 现象

在聊天里让 agent 建定时任务（或做任何需要调用工具的事），GUI 显示：

```
Status: Failed
Interrupted: interrupted
```

- `Interrupted: interrupted` 只是轨迹面板的**表面渲染**：当工具调用没有返回结果时，面板会合成一个 `{ name: "Interrupted", code: "interrupted" }` 的错误块。它本身不是根因，别被它带偏。
- 真正的错误藏在会话事件里（`turn/end`）：

```json
{ "kind": "error", "error": { "message": "Cannot read properties of undefined (reading 'prepare')", "code": "UNKNOWN" } }
```

## 根因

`reading 'prepare'` 来自 DSH agent loop 的工具调度器：

```js
ctx.tools[TOOL_RUNTIME_SCHEDULER].prepare(call.exec)
```

`TOOL_RUNTIME_SCHEDULER` 是 `@deepseek-ai/dsh-tools` 导出的一个 `Symbol`：

- agent loop 用「副本 A」的 Symbol 去读 `ctx.tools[TOOL_RUNTIME_SCHEDULER]`；
- `ToolRuntime` 服务用「副本 B」的 Symbol 写入 `[TOOL_RUNTIME_SCHEDULER]`。

两个副本里的 Symbol 是不同的对象，于是 `ctx.tools[TOOL_RUNTIME_SCHEDULER]` 读到 `undefined`，再 `.prepare(...)` 就抛 `Cannot read properties of undefined`。

**为什么会有两个副本**：插件把 `@deepseek-ai/dsh-tools` 同时放进了 `dependencies` 和 `peerDependencies`。`dependencies` 让 pnpm 为插件额外解析一份；在 hoisted 布局下，这一份可能与宿主加载的那一份脱钩。而 `Symbol` 的身份必须全局唯一，两份就是两份，注定对不上。

> 这不是 `task_create` 一个工具的问题。任何工具调用都会经过 `ctx.tools[TOOL_RUNTIME_SCHEDULER]`，所以同样的错误也会出现在 `bash`、`read` 等内置工具上（实测 `bash` 也中过招）。

## 修复

`package.json` 按下面的原则划分依赖：

- `dependencies` 只保留**真正的第三方运行时依赖**（本插件只有 `croner`）。
- 所有 `@deepseek-ai/*` 一律放 `peerDependencies`（运行时由宿主提供）+ `devDependencies`（本地构建 / 类型检查用）。
- 客户端专用的 `@deepseek-ai/dsh-client-ui-primitives` 同理：浏览器端由宿主的 seed module 提供（tsdown 配置 `neverBundle: /^@deepseek-ai\//`），绝不能作为服务端 `dependencies`。

修正后的形态：

```jsonc
"peerDependencies": {
  "@deepseek-ai/dsh-tools": "^0.1.0-rc.6",
  "@deepseek-ai/dsh-client-ui-primitives": "^0.1.0-rc.6"
  // ...其余宿主包
},
"devDependencies": {
  "@deepseek-ai/dsh-tools": "0.1.0-rc.6",
  "@deepseek-ai/dsh-client-ui-primitives": "^0.1.0-rc.6"
  // ...其余构建期包
},
"dependencies": {
  "croner": "^10.0.1"
}
```

## 如何定位（下次别被 “Interrupted” 骗了）

1. 找到对应会话的持久化事件文件：`~/.dsh/sessions/<project>/<session>/session.jsonl.zstd`。
2. 解压并过滤出 `turn/end` 事件，看 `reason`：

   ```sh
   zstd -d -c session.jsonl.zstd | python3 -c "
   import json, sys
   for line in sys.stdin:
       line = line.strip()
       if not line: continue
       e = json.loads(line)
       if e.get('type') == 'turn/end':
           print(json.dumps(e.get('data', {}).get('reason'), ensure_ascii=False))
   "
   ```

3. `turn/end` 里的 `reason` 才是真实原因；`Interrupted: interrupted` 只是 GUI 对「工具调用未返回结果」的合成展示。
4. 若 `reason.error.message` 形如 `Cannot read properties of undefined (reading '<方法>')`，优先怀疑 `@deepseek-ai/*` 被 `dependencies` 拉出了第二份，检查插件 `package.json` 的依赖划分。

## 验证 & 让修复生效

```sh
pnpm --dir src/plugins/dsh-plugin-scheduled-tasks typecheck
pnpm --dir src/plugins/dsh-plugin-scheduled-tasks test
pnpm --dir src/plugins/dsh-plugin-scheduled-tasks build
```

改源码后必须**重装并重启**，插件没有热更新通道：

```sh
dsh plugin --profile web add link:src/plugins/dsh-plugin-scheduled-tasks
# 然后重启 dsh web
```

重启前，若只想临时绕过：侧边栏「⏰ 定时任务」面板走 typert 协议（不经 tool runtime），仍然可用。
