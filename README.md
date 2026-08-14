# dsh-plugins

Out-of-tree DeepSeek Harness plugins workspace.

## Plugins

| Plugin | Description |
| --- | --- |
| [`@opendsh/dsh-plugin-scheduled-tasks`](src/plugins/dsh-plugin-scheduled-tasks/README.md) | Per-project scheduled tasks with prompts, executed as headless agent sessions in the project directory, with durable run history. |

## Workspace layout

```
src/plugins/
└── dsh-plugin-scheduled-tasks   (@opendsh/dsh-plugin-scheduled-tasks)
```

| Command | Meaning |
|---|---|
| `pnpm install` | Install workspace tooling (TypeScript 7, Biome, …). |
| `pnpm build` | Build every plugin package. |
| `pnpm test` | Run every plugin's vitest suite. |
| `pnpm lint` | Biome check across the workspace. |

## Toolchain

- **TypeScript 7** (the native compiler) for typechecking and server emit.
- **tsdown** for the browser client bundle, wrapped in the DSH
  `window.__ModuleLoader__.load` handoff (see each plugin's
  `scripts/wrap-client.mjs`).
- **vitest** for unit tests, **Biome** for lint/format.
