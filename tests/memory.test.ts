/**
 * journal lib/memory — 单元测试
 *
 * 测试 collectMemoryChanges
 * - 正常：记忆目录的文件按时间范围过滤
 * - 边界：空结果、时间范围无匹配
 * - 错误：目录不存在
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock node:fs
vi.mock("node:fs", () => ({
	statSync: vi.fn(),
	readdirSync: vi.fn(),
	readFileSync: vi.fn(),
}));

import { collectMemoryChanges } from "../lib/memory";
import { statSync, readdirSync, readFileSync } from "node:fs";
import type { Mock } from "vitest";

// ── Mock 数据 ────────────────────────────────────────────

const MOCK_TIME_BASE = new Date("2026-05-12T12:00:00.000Z").getTime();

// 2026-05-11 ~ 2026-05-13 范围
const SINCE = "2026-05-11T00:00:00.000Z";
const UNTIL = "2026-05-13T00:00:00.000Z";
const SINCE_EARLY = "2026-05-06T00:00:00.000Z";

interface MockFile {
	name: string;
	content: string;
	mtimeMs: number;
	birthtimeMs?: number;
}

/** 配置 mock：模拟 L1 记忆目录包含给定文件，L2 目录不存在 */
function setupMemoryDir(files: MockFile[]) {
	// statSync 行为：
	//   L1 目录 → 存在
	//   L2 目录 (".pi/memory") → 不存在
	//   L1 下的 .md 文件 → 查找匹配的 mock 文件返回 stat
	(statSync as Mock).mockImplementation((p: string, opts?: any) => {
		// 1. .md 文件（最具体，优先匹配）
		if (p.endsWith(".md")) {
			const match = files.find((f) => p.endsWith(f.name));
			if (match) {
				return {
					isDirectory: () => false,
					mtimeMs: match.mtimeMs,
					birthtimeMs: match.birthtimeMs ?? 0,
				};
			}
		}
		// 2. L2 目录 → 不存在
		if (p === ".pi/memory") {
			if (opts?.throwIfNoEntry === false) return false;
			const err = new Error("ENOENT");
			(err as any).code = "ENOENT";
			throw err;
		}
		// 3. L1 目录 → 存在
		if (p.endsWith("/memory") || p.includes("agent/memory")) {
			if (opts?.throwIfNoEntry === false) return true;
			return { isDirectory: () => true };
		}
		// 4. 无匹配
		const err = new Error("ENOENT");
		(err as any).code = "ENOENT";
		throw err;
	});

	// readdirSync: L1 目录返回文件列表
	(readdirSync as Mock).mockImplementation((p: string) => {
		if (p.endsWith("/memory") || p.includes("agent/memory")) {
			return files.map((f) => f.name);
		}
		return [];
	});

	// readFileSync: 返回对应内容
	(readFileSync as Mock).mockImplementation((p: string) => {
		const match = files.find((f) => p.endsWith(f.name));
		return match?.content ?? "";
	});
}

describe("collectMemoryChanges", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// ── 正常路径 ─────────────────────────────────────────

	it("按时间范围过滤返回匹配的记忆文件", async () => {
		setupMemoryDir([
			{ name: "架构决策.md", content: "# 架构决策\n内容", mtimeMs: new Date("2026-05-06T00:00:00Z").getTime() },
			{ name: "日报.md", content: "# 日报\n日报内容", mtimeMs: new Date("2026-05-12T00:00:00Z").getTime() },
		]);

		const result = await collectMemoryChanges({ since: SINCE, until: UNTIL });
		expect(result.length).toBe(1);
		expect(result[0].path).toBe("日报.md");
	});

	it("返回格式包含必需的字段", async () => {
		setupMemoryDir([
			{ name: "日报.md", content: "# 日报\n内容", mtimeMs: MOCK_TIME_BASE },
		]);

		const result = await collectMemoryChanges({ since: SINCE, until: UNTIL });
		expect(result[0]).toHaveProperty("path");
		expect(result[0]).toHaveProperty("action");
		expect(result[0]).toHaveProperty("timestamp");
	});

	it("时间戳转换为 ISO 字符串", async () => {
		setupMemoryDir([
			{ name: "日报.md", content: "# 日报\n内容", mtimeMs: MOCK_TIME_BASE },
		]);

		const result = await collectMemoryChanges({ since: SINCE, until: UNTIL });
		expect(typeof result[0].timestamp).toBe("string");
		expect(result[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	it("较大时间范围返回多个匹配", async () => {
		setupMemoryDir([
			{ name: "架构决策.md", content: "# 架构\n内容", mtimeMs: new Date("2026-05-06T00:00:00Z").getTime() },
			{ name: "踩坑记录.md", content: "# 踩坑\n内容", mtimeMs: new Date("2026-05-09T00:00:00Z").getTime() },
			{ name: "日报.md", content: "# 日报\n内容", mtimeMs: new Date("2026-05-12T00:00:00Z").getTime() },
		]);

		const result = await collectMemoryChanges({ since: SINCE_EARLY, until: UNTIL });
		expect(result.length).toBe(3);
	});

	// ── 边界值 ─────────────────────────────────────────

	it("时间范围内无匹配返回空数组", async () => {
		setupMemoryDir([
			{ name: "旧文件.md", content: "# 旧\n内容", mtimeMs: new Date("2025-01-01T00:00:00Z").getTime() },
		]);

		const result = await collectMemoryChanges({ since: SINCE, until: UNTIL });
		expect(result).toEqual([]);
	});

	it("目录为空时返回空数组", async () => {
		setupMemoryDir([]);

		const result = await collectMemoryChanges({ since: SINCE, until: UNTIL });
		expect(result).toEqual([]);
	});

	it("时间范围精确到秒", async () => {
		const ts12 = new Date("2026-05-12T00:00:00.000Z").getTime();
		const ts10 = new Date("2026-05-10T23:59:59.000Z").getTime();
		setupMemoryDir([
			{ name: "刚好.md", content: "# A\n内容", mtimeMs: ts12 },
			{ name: "刚好外.md", content: "# B\n内容", mtimeMs: ts10 },
		]);

		const result = await collectMemoryChanges({ since: "2026-05-12T00:00:00.000Z", until: "2026-05-13T00:00:00.000Z" });
		expect(result.length).toBe(1);
		expect(result[0].path).toBe("刚好.md");
	});

	// ── 错误路径 ─────────────────────────────────────────

	it("目录不存在时静默降级返回空数组", async () => {
		// 所有 statSync 返回不存在
		(statSync as Mock).mockImplementation((_p: string, opts?: any) => {
			if (opts?.throwIfNoEntry === false) return false;
			const err = new Error("ENOENT");
			(err as any).code = "ENOENT";
			throw err;
		});
		(readdirSync as Mock).mockReturnValue([]);

		const result = await collectMemoryChanges({ since: SINCE, until: UNTIL });
		expect(result).toEqual([]);
	});

	// ── new/modified/unknown 区分 ─────────────────────────────

	it("birthtime >= since 标记为 new", async () => {
		const mtime = new Date("2026-05-12T12:00:00.000Z").getTime();
		const birthtime = new Date("2026-05-12T00:00:00.000Z").getTime();
		setupMemoryDir([
			{ name: "新文件.md", content: "# 新文件\n内容", mtimeMs: mtime, birthtimeMs: birthtime },
		]);

		const result = await collectMemoryChanges({ since: SINCE, until: UNTIL });
		expect(result.length).toBe(1);
		expect(result[0].action).toBe("new");
	});

	it("mtime >= since && birthtime < since 标记为 modified", async () => {
		const mtime = new Date("2026-05-12T00:00:00.000Z").getTime();
		const birthtime = new Date("2026-05-06T00:00:00.000Z").getTime();
		setupMemoryDir([
			{ name: "旧文件改过.md", content: "# 旧文件\n内容", mtimeMs: mtime, birthtimeMs: birthtime },
		]);

		const result = await collectMemoryChanges({ since: SINCE, until: UNTIL });
		expect(result.length).toBe(1);
		expect(result[0].action).toBe("modified");
	});

	it("birthtime 等于 epoch 或等于 mtime 时标记为 unknown", async () => {
		const ts = new Date("2026-05-12T00:00:00.000Z").getTime();
		setupMemoryDir([
			{ name: "无birthtime.md", content: "# 内容\n内容", mtimeMs: ts, birthtimeMs: 0 },
			{ name: "birthtimeEqMtime.md", content: "# 内容\n内容", mtimeMs: ts, birthtimeMs: ts },
		]);

		const result = await collectMemoryChanges({ since: SINCE, until: UNTIL });
		expect(result.length).toBe(2);
		expect(result.every((r) => r.action === "unknown")).toBe(true);
	});

	// ── description 提取 ─────────────────────────────────────

	it("description 提取第 3~10 行内容（跳过标题和关键词行）", async () => {
		const longContent = "# 标题\n`kw1` `kw2`\n第3行\n第4行\n第5行\n第6行\n第7行\n第8行\n第9行\n第10行\n第11行\n第12行";
		setupMemoryDir([
			{ name: "长文件.md", content: longContent, mtimeMs: MOCK_TIME_BASE },
		]);

		const result = await collectMemoryChanges({ since: SINCE, until: UNTIL });
		expect(result.length).toBe(1);
		expect(result[0].description).not.toContain("第11行");
		expect(result[0].description).not.toContain("第12行");
		expect(result[0].description).toContain("第3行");
	});

	it("description 对短内容不报错", async () => {
		setupMemoryDir([
			{ name: "短文件.md", content: "# 标题", mtimeMs: MOCK_TIME_BASE },
		]);

		const result = await collectMemoryChanges({ since: SINCE, until: UNTIL });
		expect(result.length).toBe(1);
		expect(result[0].description).toBeDefined();
		expect(typeof result[0].description).toBe("string");
	});

	// ── 忽略 MEMORY.md ─────────────────────────────────────

	it("MEMORY.md 文件被忽略", async () => {
		setupMemoryDir([
			{ name: "MEMORY.md", content: "# Memory Index\n内容", mtimeMs: MOCK_TIME_BASE },
			{ name: "实际记忆.md", content: "# 记忆\n内容", mtimeMs: MOCK_TIME_BASE },
		]);

		const result = await collectMemoryChanges({ since: SINCE, until: UNTIL });
		expect(result.length).toBe(1);
		expect(result[0].path).toBe("实际记忆.md");
	});
});
