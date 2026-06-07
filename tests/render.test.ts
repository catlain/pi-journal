/**
 * journal lib/render — 单元测试
 *
 * 测试 renderReport 纯函数：渲染日报/周报 Markdown 报告
 * 验证输出格式、章节完整性、降级处理
 */

import { describe, it, expect } from "vitest";
import { renderReport } from "../lib/render";

const mockGit = [
	{ repo: "pi-agent", branch: "main", commits: 5, filesChanged: 12, additions: 200, deletions: 50 },
];
const mockMemory = [
	{ path: ".pi/memory/架构决策.md", action: "updated", timestamp: "2026-05-12T10:00:00Z" },
];
const mockSessions = [
	{ sessionId: "abc123", title: "实现 auth", toolCount: 15, readCount: 8, writeCount: 7,
	  totalTokens: 25000, duration: "2h 15m", keyFiles: ["src/auth/login.ts"] },
];
const mockSummary = {
	totalCommits: 5, totalSessions: 1, totalEdits: 7,
	peakHours: "14:00-16:00", mainTopics: ["auth"],
};

const baseInput = {
	type: "daily" as const,
	period: "2026-05-12",
	gitActivity: mockGit,
	gitCommitMessages: [["feat: add auth module", "fix: login redirect"]] as string[][],
	memoryChanges: mockMemory,
	sessionActivities: mockSessions,
	summary: mockSummary,
};

const emptyInput = {
	type: "daily" as const,
	period: "2026-05-12",
	gitActivity: [] as typeof mockGit,
	gitCommitMessages: [] as string[][],
	memoryChanges: [] as typeof mockMemory,
	sessionActivities: [] as typeof mockSessions,
	summary: { totalCommits: 0, totalSessions: 0, totalEdits: 0, peakHours: "", mainTopics: [] },
};

describe("renderReport", () => {
	it("日报包含核心章节标题", () => {
		const r = renderReport(baseInput);
		expect(r).toContain("# 日报");
		expect(r).toContain("## 📦 Git 提交记录");
		expect(r).toContain("## ✍️ 日记内容");
	});

	it("日报包含统计数据", () => {
		const r = renderReport(baseInput);
		expect(r).toContain("5"); // commits
		expect(r).toContain("25000"); // tokens
	});

	it("周报标题和范围正确", () => {
		const r = renderReport({ ...emptyInput, type: "weekly", period: "05-11 ~ 05-17" });
		expect(r).toContain("# 周报");
		expect(r).toContain("05-11 ~ 05-17");
	});

	it("空 Git 活动显示无活动提示", () => {
		const r = renderReport(emptyInput);
		expect(r).toContain("无 Git 活动");
	});

	it("空记忆变更显示无变更", () => {
		const r = renderReport(emptyInput);
		expect(r).toContain("无变更");
	});

	it("Git 提交记录包含 commit message", () => {
		const r = renderReport(baseInput);
		expect(r).toContain("feat: add auth module");
		expect(r).toContain("fix: login redirect");
	});

	it("会话活动包含 sessionId 和 token 数", () => {
		const r = renderReport(baseInput);
		expect(r).toContain("abc123");
		expect(r).toContain("2h 15m");
		expect(r).toContain("25000");
	});

	it("20 个会话全部出现在报告中", () => {
		const many = Array.from({ length: 20 }, (_, i) => ({
			sessionId: `s${i}`, title: `S${i}`, toolCount: 5,
			readCount: 2, writeCount: 3, totalTokens: 1000,
			duration: "10m", keyFiles: [],
		}));
		const r = renderReport({
			...baseInput, sessionActivities: many, gitCommitMessages: [],
			summary: { totalCommits: 0, totalSessions: 20, totalEdits: 0, peakHours: "", mainTopics: [] },
		});
		for (let i = 0; i < 20; i++) expect(r).toContain(`s${i}`);
	});

	it("包含 AI 写作引导提示", () => {
		const r = renderReport(baseInput);
		expect(r).toContain("功能增减");
		expect(r).toContain("决策变更");
		expect(r).toContain("踩坑记录");
	});

	it("语义语料正确渲染", () => {
		const sessionWithSemantic = [{
			sessionId: "semantic1", title: "测试语义", toolCount: 5,
			readCount: 2, writeCount: 3, totalTokens: 1000,
			duration: "10m", keyFiles: [],
			semantic: {
				summary: "实现了用户认证",
				digest: "user: 做一下认证\nassistant: 好的",
				keyDecisions: ["使用 JWT 方案"],
				userIntents: ["实现用户认证"],
			},
		}];
		const r = renderReport({
			...baseInput, sessionActivities: sessionWithSemantic,
			summary: baseInput.summary,
		});
		expect(r).toContain("实现了用户认证");
		expect(r).toContain("使用 JWT 方案");
		expect(r).toContain("实现用户认证");
	});
});
