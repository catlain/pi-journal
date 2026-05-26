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
	memoryChanges: mockMemory,
	sessionActivities: mockSessions,
	summary: mockSummary,
};

const emptyInput = {
	type: "daily" as const,
	period: "2026-05-12",
	gitActivity: [],
	memoryChanges: [],
	sessionActivities: [],
	summary: { totalCommits: 0, totalSessions: 0, totalEdits: 0, peakHours: "", mainTopics: [] },
};

describe("renderReport", () => {
	it("日报包含全部 4 个章节标题", () => {
		const r = renderReport(baseInput);
		expect(r).toContain("# 日报");
		expect(r).toContain("## Git 活动");
		expect(r).toContain("## 记忆变更");
		expect(r).toContain("## 会话活动");
		expect(r).toContain("## 摘要");
	});

	it("日报包含具体统计数据", () => {
		const r = renderReport(baseInput);
		expect(r).toContain("5"); // commits
		expect(r).toContain("1"); // sessions
		expect(r).toContain("7"); // edits
	});

	it("周报导航标题和范围正确", () => {
		const r = renderReport({ ...emptyInput, type: "weekly", period: "05-11 ~ 05-17", summary: { ...emptyInput.summary } });
		expect(r).toContain("# 周报");
		expect(r).toContain("05-11 ~ 05-17");
	});

	it("空 Git 活动不生成表格行", () => {
		const r = renderReport(emptyInput);
		const lines = r.split("\n");
		const idx = lines.findIndex((l) => l.startsWith("## Git"));
		expect(lines.slice(idx + 1).filter((l) => l.startsWith("|")).length).toBe(0);
	});

	it("空记忆变更显示占位文案", () => {
		const r = renderReport(emptyInput);
		expect(r).toContain("## 记忆变更");
		expect(r).toContain("无变更");
	});

	it("空会话活动不显示 session 详情", () => {
		const r = renderReport(emptyInput);
		expect(r).not.toContain("abc123");
	});

	it("Git 表格包含仓库名和提交数", () => {
		const r = renderReport(baseInput);
		expect(r).toContain("pi-agent");
		expect(r).toContain("5");
		expect(r).toContain("12"); // filesChanged
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
			...baseInput, sessionActivities: many,
			summary: { totalCommits: 0, totalSessions: 20, totalEdits: 0, peakHours: "", mainTopics: [] },
		});
		for (let i = 0; i < 20; i++) expect(r).toContain(`s${i}`);
	});
});
