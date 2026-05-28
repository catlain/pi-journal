/**
 * journal index — 内部函数测试
 * 测试 safeCollect 和 generateReport 边缘分支
 *
 * lib 模块已 mock，不依赖真实 fs 操作。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("../lib/git", () => ({ collectGitActivity: vi.fn() }));
vi.mock("../lib/memory", () => ({ collectMemoryChanges: vi.fn() }));
vi.mock("../lib/sessions", () => ({ collectSessionActivities: vi.fn() }));
vi.mock("../lib/render", () => ({ renderReport: vi.fn() }));

import { safeCollect, doJournalReport } from "../index";
import { collectGitActivity } from "../lib/git";
import { collectMemoryChanges } from "../lib/memory";
import { collectSessionActivities } from "../lib/sessions";
import { renderReport } from "../lib/render";

/**
 * safeCollect — 安全采集管道包装
 */
describe("safeCollect", () => {
	it("正常函数返回其值", async () => {
		const result = await safeCollect(() => Promise.resolve(42), -1);
		expect(result).toBe(42);
	});

	it("异步异常函数返回 fallback", async () => {
		const result = await safeCollect(() => Promise.reject(new Error("fail")), -1);
		expect(result).toBe(-1);
	});

	it("同步异常函数返回 fallback（被包装成 async）", async () => {
		const result = await safeCollect(() => { throw new Error("sync"); }, "fallback");
		expect(result).toBe("fallback");
	});

	it("fallback 为对象类型", async () => {
		const fb = { ok: false };
		const result = await safeCollect(() => Promise.reject(new Error("e")), fb);
		expect(result).toBe(fb);
	});

	it("异常在 generateReport 管道中走 safeCollect 路径", async () => {
		(collectGitActivity as Mock).mockRejectedValue(new Error("err"));
		(collectMemoryChanges as Mock).mockRejectedValue(new Error("err"));
		(collectSessionActivities as Mock).mockRejectedValue(new Error("err"));
		(renderReport as Mock).mockReturnValue("# 降级报告\n所有管道失败");

		const result = await doJournalReport("today");
		expect(result).toBeTruthy();
		expect(result).toContain("# 降级报告");
	});
});

/**
 * generateReport — 剩余边缘分支
 */
describe("generateReport (additional edge cases)", () => {
	beforeEach(() => vi.clearAllMocks());

	it("this_week 生成周报 period 格式", async () => {
		(collectGitActivity as Mock).mockResolvedValue([]);
		(collectMemoryChanges as Mock).mockResolvedValue([]);
		(collectSessionActivities as Mock).mockResolvedValue([]);
		(renderReport as Mock).mockReturnValue("# 周报");

		await doJournalReport("this_week");
		const callArgs = (renderReport as Mock).mock.calls[0][0];
		expect(callArgs.type).toBe("weekly");
		expect(callArgs.period).toMatch(/\d{2}-\d{2} ~ \d{2}-\d{2}/);
	});

	it("daily 类型 period 是 YYYY-MM-DD 格式", async () => {
		(collectGitActivity as Mock).mockResolvedValue([]);
		(collectMemoryChanges as Mock).mockResolvedValue([]);
		(collectSessionActivities as Mock).mockResolvedValue([]);
		(renderReport as Mock).mockReturnValue("# 日报");

		await doJournalReport("yesterday");
		const callArgs = (renderReport as Mock).mock.calls[0][0];
		expect(callArgs.type).toBe("daily");
		expect(callArgs.period).toMatch(/^\d{4}-\d{2}-\d{2}$/);
	});

	it("summary 正确聚合数据", async () => {
		(collectGitActivity as Mock).mockResolvedValue([
			{ repo: "a", commits: 2, filesChanged: 5, additions: 10, deletions: 2 },
			{ repo: "b", commits: 3, filesChanged: 8, additions: 30, deletions: 5 },
		]);
		(collectMemoryChanges as Mock).mockResolvedValue([]);
		(collectSessionActivities as Mock).mockResolvedValue([
			{ sessionId: "s1", writeCount: 5 },
			{ sessionId: "s2", writeCount: 3 },
		]);
		(renderReport as Mock).mockReturnValue("# 日报");

		await doJournalReport("today");
		const callArgs = (renderReport as Mock).mock.calls[0][0];
		expect(callArgs.summary.totalCommits).toBe(5);
		expect(callArgs.summary.totalSessions).toBe(2);
		expect(callArgs.summary.totalEdits).toBe(8);
	});
});
