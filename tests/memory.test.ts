/**
 * journal lib/memory — 单元测试
 *
 * 测试 collectMemoryChanges
 * - 正常：scanMemoryDir 返回的记忆列表按时间范围过滤
 * - 边界：空结果、时间范围无匹配
 * - 错误：目录不存在、scanMemoryDir 抛异常
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// 必须在所有 import 之前 mock
vi.mock("@pi-atelier/shared-utils", () => ({
	scanMemoryDir: vi.fn(),
}));

import { collectMemoryChanges } from "../lib/memory";
import { scanMemoryDir } from "@pi-atelier/shared-utils";
import type { Mock } from "vitest";

// ── Mock 数据 ────────────────────────────────────────────

const mockMemories = [
	{ path: ".pi/memory/架构决策.md", content: "架构决策内容", mtimeMs: new Date("2026-05-06T00:00:00Z").getTime() },
	{ path: ".pi/memory/踩坑记录.md", content: "踩坑记录内容", mtimeMs: new Date("2026-05-09T00:00:00Z").getTime() },
	{ path: ".pi/memory/扩展测试基础设施.md", content: "测试相关", mtimeMs: new Date("2026-05-10T00:00:00Z").getTime() },
	{ path: ".pi/memory/日报.md", content: "日报内容", mtimeMs: new Date("2026-05-12T00:00:00Z").getTime() },
];

// 2026-05-11 ~ 2026-05-13 范围（仅日报匹配日期）
const SINCE = "2026-05-11T00:00:00.000Z";
const UNTIL = "2026-05-13T00:00:00.000Z";

// 2026-05-06 ~ 2026-05-13 范围（匹配多个）
const SINCE_EARLY = "2026-05-06T00:00:00.000Z";

describe("collectMemoryChanges", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// ── 正常路径 ─────────────────────────────────────────

	it("按时间范围过滤返回匹配的记忆文件", async () => {
		(scanMemoryDir as Mock).mockResolvedValue(mockMemories);

		const result = await collectMemoryChanges({ since: SINCE, until: UNTIL });
		expect(result.length).toBe(1);
		expect(result[0].path).toBe(".pi/memory/日报.md");
	});

	it("返回格式包含必需的字段", async () => {
		(scanMemoryDir as Mock).mockResolvedValue([mockMemories[3]]);

		const result = await collectMemoryChanges({ since: SINCE, until: UNTIL });
		expect(result[0]).toHaveProperty("path");
		expect(result[0]).toHaveProperty("action");
		expect(result[0]).toHaveProperty("timestamp");
	});

	it("时间戳转换为 ISO 字符串", async () => {
		(scanMemoryDir as Mock).mockResolvedValue([mockMemories[3]]);

		const result = await collectMemoryChanges({ since: SINCE, until: UNTIL });
		expect(typeof result[0].timestamp).toBe("string");
		expect(result[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
	});

	it("scanMemoryDir 被正确调用", async () => {
		(scanMemoryDir as Mock).mockResolvedValue([]);

		await collectMemoryChanges({ since: SINCE, until: UNTIL });
		expect(scanMemoryDir).toHaveBeenCalledOnce();
	});

	it("较大时间范围返回多个匹配", async () => {
		(scanMemoryDir as Mock).mockResolvedValue(mockMemories);

		const result = await collectMemoryChanges({ since: SINCE_EARLY, until: UNTIL });
		// SINCE_EARLY = 2026-05-06T00:00:00Z, UNTIL = 2026-05-13T00:00:00Z
		// mtimeMs 范围: 5-06 (>=SINCE_EARLY), 5-09, 5-10, 5-12—all >= SINCE_EARLY and < UNTIL
		expect(result.length).toBe(4); // 5-06, 5-09, 5-10, 5-12
	});

	// ── 边界值 ─────────────────────────────────────────

	it("时间范围内无匹配返回空数组", async () => {
		(scanMemoryDir as Mock).mockResolvedValue(mockMemories);

		const result = await collectMemoryChanges({ since: "2025-01-01T00:00:00.000Z", until: "2025-01-02T00:00:00.000Z" });
		expect(result).toEqual([]);
	});

	it("scanMemoryDir 返回空数组时返回空数组", async () => {
		(scanMemoryDir as Mock).mockResolvedValue([]);

		const result = await collectMemoryChanges({ since: SINCE, until: UNTIL });
		expect(result).toEqual([]);
	});

	it("时间范围精确到秒", async () => {
		const ts12 = new Date("2026-05-12T00:00:00.000Z").getTime();
		const ts10 = new Date("2026-05-10T23:59:59.000Z").getTime();
		const preciseMemories = [
			{ ...mockMemories[3], mtimeMs: ts12 }, // 2026-05-12T00:00:00.000Z — 在范围内
			{ ...mockMemories[2], mtimeMs: ts10 }, // 2026-05-10T23:59:59.000Z — 刚好在范围外
		];
		(scanMemoryDir as Mock).mockResolvedValue(preciseMemories);

		const result = await collectMemoryChanges({ since: "2026-05-12T00:00:00.000Z", until: "2026-05-13T00:00:00.000Z" });
		expect(result.length).toBe(1);
		expect(result[0].path).toBe(".pi/memory/日报.md");
	});

	// ── 错误路径 ─────────────────────────────────────────

	it("scanMemoryDir 异常时返回空数组（静默降级）", async () => {
		(scanMemoryDir as Mock).mockRejectedValue(new Error("EACCES: permission denied"));

		const result = await collectMemoryChanges({ since: SINCE, until: UNTIL });
		expect(result).toEqual([]);
	});

	it("scanMemoryDir 抛出非权限错误也静默降级", async () => {
		(scanMemoryDir as Mock).mockRejectedValue(new Error("ENOENT"));

		const result = await collectMemoryChanges({ since: SINCE, until: UNTIL });
		expect(result).toEqual([]);
	});

	// ── new/modified/unknown 区分 ─────────────────────────────

	it("birthtime >= since 标记为 new", async () => {
		const mtime = new Date("2026-05-12T12:00:00.000Z").getTime();
		const birthtime = new Date("2026-05-12T00:00:00.000Z").getTime();
		(scanMemoryDir as Mock).mockResolvedValue([
			{ path: ".pi/memory/新文件.md", content: "# 新文件\n内容", mtimeMs: mtime, birthtimeMs: birthtime }, // 创建于 5-12 00:00，修改于 5-12 12:00
		]);

		const result = await collectMemoryChanges({ since: SINCE, until: UNTIL });
		expect(result.length).toBe(1);
		expect(result[0].action).toBe("new");
	});

	it("mtime >= since && birthtime < since 标记为 modified", async () => {
		const mtime = new Date("2026-05-12T00:00:00.000Z").getTime();
		const birthtime = new Date("2026-05-06T00:00:00.000Z").getTime();
		(scanMemoryDir as Mock).mockResolvedValue([
			{ path: ".pi/memory/旧文件改过.md", content: "# 旧文件\n内容", mtimeMs: mtime, birthtimeMs: birthtime }, // 创建于 5-06，修改于 5-12
		]);

		const result = await collectMemoryChanges({ since: SINCE, until: UNTIL });
		expect(result.length).toBe(1);
		expect(result[0].action).toBe("modified");
	});

	it("birthtime 等于 epoch 或等于 mtime 时标记为 unknown", async () => {
		const ts = new Date("2026-05-12T00:00:00.000Z").getTime();
		(scanMemoryDir as Mock).mockResolvedValue([
			{ path: ".pi/memory/无birthtime.md", content: "# 内容", mtimeMs: ts, birthtimeMs: 0 }, // birthtime = epoch
			{ path: ".pi/memory/birthtimeEqMtime.md", content: "# 内容", mtimeMs: ts, birthtimeMs: ts }, // birthtime == mtime
		]);

		const result = await collectMemoryChanges({ since: SINCE, until: UNTIL });
		expect(result.length).toBe(2);
		expect(result.every((r) => r.action === "unknown")).toBe(true);
	});

	// ── description 提取 ─────────────────────────────────────

	it("description 提取前 10 行内容（跳过标题和关键词行）", async () => {
		const ts = new Date("2026-05-12T00:00:00.000Z").getTime();
		const longContent = "# 标题\n`kw1` `kw2`\n第3行\n第4行\n第5行\n第6行\n第7行\n第8行\n第9行\n第10行\n第11行\n第12行";
		(scanMemoryDir as Mock).mockResolvedValue([
			{ path: ".pi/memory/长文件.md", content: longContent, mtimeMs: ts, birthtimeMs: 0 },
		]);

		const result = await collectMemoryChanges({ since: SINCE, until: UNTIL });
		expect(result.length).toBe(1);
		// description 取 lines.slice(2, 10)：第3~10行
		expect(result[0].description).not.toContain("第11行");
		expect(result[0].description).not.toContain("第12行");
		expect(result[0].description).toContain("第3行");
	});

	it("description 对短内容不报错", async () => {
		const ts = new Date("2026-05-12T00:00:00.000Z").getTime();
		(scanMemoryDir as Mock).mockResolvedValue([
			{ path: ".pi/memory/短文件.md", content: "# 标题", mtimeMs: ts, birthtimeMs: 0 },
		]);

		const result = await collectMemoryChanges({ since: SINCE, until: UNTIL });
		expect(result.length).toBe(1);
		expect(result[0].description).toBeDefined();
		expect(typeof result[0].description).toBe("string");
	});

	// ── L2 目录不存在降级 ─────────────────────────────────────

	it("scanMemoryDir 抛 ENOENT 时静默降级返回空数组", async () => {
		// scanMemoryDir 现在一次调用返回所有记忆（L1+L2 合并），抛异常时静默降级
		(scanMemoryDir as Mock).mockRejectedValue(new Error("ENOENT: no such file or directory"));

		const result = await collectMemoryChanges({ since: SINCE, until: UNTIL });
		expect(result).toEqual([]);
	});
});
