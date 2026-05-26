/**
 * journal index — 集成测试
 * 测试 doJournalReport 编排逻辑：mock 三管道依赖，验证返回完整 Markdown + 第五节骨架
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/git", () => ({ collectGitActivity: vi.fn() }));
vi.mock("../lib/memory", () => ({ collectMemoryChanges: vi.fn() }));
vi.mock("../lib/sessions", () => ({ collectSessionActivities: vi.fn() }));
vi.mock("../lib/render", () => ({ renderReport: vi.fn() }));

import { doJournalReport } from "../index";
import { collectGitActivity } from "../lib/git";
import { collectMemoryChanges } from "../lib/memory";
import { collectSessionActivities } from "../lib/sessions";
import { renderReport } from "../lib/render";
import type { Mock } from "vitest";

const mockReport = `# 日报
## Git 活动\n| 仓库 | 提交数 |\n|------|--------|\n| pi-agent | 3 |
## 会话活动\n- 会话: s1
## 摘要\n- 总提交: 3\n- 总会话: 1
## AI 总结\n> 本节内容将在报告生成后由 AI 补写。\n`;

const mockGit = [{ repo: "pi-agent", commits: 3, filesChanged: 10, additions: 100, deletions: 20 }];
const mockMem = [{ path: ".pi/memory/test.md", action: "updated", timestamp: "2026-05-12T10:00:00Z" }];
const mockSess = [{ sessionId: "s1", title: "fix auth", toolCount: 3, readCount: 1, writeCount: 2, totalTokens: 5000, duration: "30m", keyFiles: ["src/auth.ts"] }];

function setupMocks(git = mockGit, mem = mockMem, sess = mockSess) {
	(collectGitActivity as Mock).mockResolvedValue(git);
	(collectMemoryChanges as Mock).mockResolvedValue(mem);
	(collectSessionActivities as Mock).mockResolvedValue(sess);
	(renderReport as Mock).mockReturnValue(mockReport);
}

describe("doJournalReport（集成测试）", () => {
	beforeEach(() => vi.clearAllMocks());

	it("完整流程：调用三条管道 + render，返回 Markdown", async () => {
		setupMocks();
		const result = await doJournalReport({ timeRange: "today" });
		expect(collectGitActivity).toHaveBeenCalledOnce();
		expect(collectMemoryChanges).toHaveBeenCalledOnce();
		expect(collectSessionActivities).toHaveBeenCalledOnce();
		expect(renderReport).toHaveBeenCalledOnce();
		expect(result).toContain("# 日报");
	});

	it("三条管道收到相同的时间范围", async () => {
		setupMocks([], [], []);
		await doJournalReport({ timeRange: "today" });
		const [ga] = (collectGitActivity as Mock).mock.calls[0];
		const [ma] = (collectMemoryChanges as Mock).mock.calls[0];
		const [sa] = (collectSessionActivities as Mock).mock.calls[0];
		expect(ga.since).toBe(ma.since);
		expect(ga.since).toBe(sa.since);
	});

	it("renderReport 接收到汇总数据和摘要", async () => {
		setupMocks();
		await doJournalReport({ timeRange: "today" });
		const ra = (renderReport as Mock).mock.calls[0][0];
		expect(ra.gitActivity).toEqual(mockGit);
		expect(ra.memoryChanges).toEqual(mockMem);
		expect(ra.sessionActivities).toEqual(mockSess);
		expect(ra.summary).toHaveProperty("totalCommits");
		expect(ra.summary).toHaveProperty("totalSessions");
	});

	it("周报：timeRange='this_week' 触发 type='weekly'", async () => {
		setupMocks([], [], []);
		(renderReport as Mock).mockReturnValue("# 周报");
		await doJournalReport({ timeRange: "this_week" });
		expect((renderReport as Mock).mock.calls[0][0].type).toBe("weekly");
	});

	it("所有管道空数据时仍调用 renderReport", async () => {
		setupMocks([], [], []);
		const result = await doJournalReport({ timeRange: "today" });
		expect(renderReport).toHaveBeenCalledOnce();
		expect(result).toBeTruthy();
	});

	it("Git 管道异常不影响其他管道", async () => {
		(collectGitActivity as Mock).mockRejectedValue(new Error("git err"));
		(collectMemoryChanges as Mock).mockResolvedValue(mockMem);
		(collectSessionActivities as Mock).mockResolvedValue(mockSess);
		(renderReport as Mock).mockReturnValue(mockReport);
		const result = await doJournalReport({ timeRange: "today" });
		expect(collectMemoryChanges).toHaveBeenCalled();
		expect(collectSessionActivities).toHaveBeenCalled();
		expect(result).toBeTruthy();
	});

	it("所有管道异常返回降级报告", async () => {
		(collectGitActivity as Mock).mockRejectedValue(new Error("f"));
		(collectMemoryChanges as Mock).mockRejectedValue(new Error("f"));
		(collectSessionActivities as Mock).mockRejectedValue(new Error("f"));
		(renderReport as Mock).mockReturnValue(mockReport);
		expect(await doJournalReport({ timeRange: "today" })).toBeTruthy();
	});

	it("无效 timeRange 返回 null，不调任何管道", async () => {
		setupMocks();
		expect(await doJournalReport({ timeRange: "invalid" })).toBeNull();
		expect(collectGitActivity).not.toHaveBeenCalled();
	});

	it("空 timeRange 返回 null", async () => {
		setupMocks();
		expect(await doJournalReport({ timeRange: "" })).toBeNull();
	});

	it("报告包含 AI 总结第五节骨架", async () => {
		setupMocks();
		const result = await doJournalReport({ timeRange: "today" });
		expect(result).toContain("AI 总结");
		expect(result).toContain("本节内容将在报告生成后由 AI 补写");
	});
});
