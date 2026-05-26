# Journal 扩展 — 实施方案

## 目标
创建 `journal` 扩展，注册 `journal` 工具，采集指定时间范围内的记忆变更、git 活动、会话摘要，生成结构化 Markdown 报告到日记目录。

## 架构

```
extensions/journal/
├── index.ts          # 扩展入口，注册 journal 工具
├── lib/
│   ├── types.ts      # 类型定义（GitActivity, MemoryChange, SessionActivity, JournalReport）
│   ├── time.ts       # 时间范围解析 parseTimeRange(since?: string) → {since, until} | null
│   ├── git.ts        # 采集 git 活动 collectGitActivities(cwd, since, until) → GitActivity[]
│   ├── memory.ts     # 采集记忆变更 collectMemoryChanges({since, until}) → MemoryChange[]
│   ├── sessions.ts   # 采集会话信息 collectSessionActivities({since, until}) → SessionActivity[]
│   └── render.ts     # 渲染 Markdown 报告 renderReport(JournalReport) → string
├── tests/            # 已有测试文件
├── vitest.config.ts
└── package.json
```

## 模块详细设计

### lib/types.ts
```typescript
export interface GitActivity {
  cwd: string;
  commits: Array<{
    hash: string;
    date: string;
    message: string;
    files: string[];
  }>;
  modules: Record<string, { commits: number; files: number }>;
  totalFiles: number;
}

export interface MemoryChange {
  path: string;
  scope: "L1" | "L2";
  action: "new" | "modified" | "unknown";
  description: string;
}

export interface SessionActivity {
  sessionId: string;
  model: string;
  messageCount: number;
  toolCount: number;
  totalTokens: number;
  filesEdited: string[];
}

export interface JournalReport {
  date: string;
  since: string;
  until: string;
  git: GitActivity;
  memory: MemoryChange[];
  sessions: SessionActivity[];
}
```

### lib/time.ts
- `parseTimeRange(since?: string): { since: string; until: string } | null`
- 支持: `1d`, `3d`, `1w`, `1h`, `30m`, `today`, `yesterday`, ISO 日期, ISO 时间戳
- 无参数时默认 `1d`
- 无效输入返回 null

### lib/git.ts
- `collectGitActivities(cwd: string, since: string, until: string): Promise<GitActivity>`
- 使用 `git log --since=X --until=Y --format='%h|%ai|%s' --stat`
- 按目录前缀分组为 modules

### lib/memory.ts
- `collectMemoryChanges(opts: { since: string; until: string }): Promise<MemoryChange[]>`
- 扫描 L1 (`~/.pi/agent/memory/`) 和 L2 (`.pi/memory/`)
- 用 mtime/birthtime 过滤时间范围
- birthtime >= since → new; mtime >= since && birthtime < since → modified; birthtime=0 或 birthtime=mtime → unknown
- 读前 10 行内容作为 description
- 依赖 shared-utils 的 scanMemoryDir

### lib/sessions.ts
- `collectSessionActivities(opts: { since: string; until: string }): Promise<SessionActivity[]>`
- 复用 session-analyzer 的 `getSessionFiles` + `readJsonlFile`
- 首行时间过滤优化：文件名或首行时间不在范围内的跳过（不读全文）
- 从 JSONL entries 提取 sessionId, model, 消息/工具计数, token 总计, 编辑文件列表

### lib/render.ts
- `renderReport(report: JournalReport): string`
- 输出 Markdown 格式：总览表 + Git 活动统计 + 记忆变更 + 会话活动 + AI 总结占位

### index.ts
- 注册 `journal` 工具
- 参数: since(可选, 默认'1d'), output(可选, 默认'journal/'), scope(可选, 默认'all')
- 执行: parseTimeRange → collectGitActivities + collectMemoryChanges + collectSessionActivities → renderReport
- 返回: 报告内容 + 提示 AI 将报告写入 `{output}/{date}.md` 并补写总结

## 依赖
- `session-analyzer/core.ts`: getSessionFiles, readJsonlFile
- `shared-utils`: scanMemoryDir
- 无额外 npm 依赖

## 关键决策
1. birthtime 在 Linux 可能不可靠（为 epoch 0），用 unknown 标记
2. 首行时间过滤：从文件名或 JSONL 首行提取时间，范围外文件跳过
3. 报告前 4 节纯程序生成，第 5 节 AI 补写
4. 工具返回值包含明确指示让 AI 写文件
