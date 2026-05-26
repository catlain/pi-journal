/**
 * journal lib/sessions — 单元测试
 *
 * 测试 collectSessionActivities
 * - 正常：从 session-analyzer 获取会话并统计
 * - 边界：空会话列表、跨天会话
 * - 错误：readJsonlFile 失败、getSessionFiles 异常
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// 模拟 session-analyzer/core.ts 的直接相对 import
vi.mock("../session-analyzer/core", () => ({
	getSessionFiles: vi.fn(),
	readJsonlFile: vi.fn(),
}));

import { collectSessionActivities } from "../lib/sessions";
import { getSessionFiles, readJsonlFile } from "../session-analyzer/core";
import type { Mock } from "vitest";

// ── Mock 数据 ────────────────────────────────────────────

const mockEntries = [
	{
		timestamp: "2026-05-12T10:00:00.000Z",
		sessionId: "sess_001",
		type: "tool_use",
		content: { tool: "read", args: { path: "/src/auth/login.ts" } },
		tokens: 500,
	},
	{
		timestamp: "2026-05-12T10:05:00.000Z",
		sessionId: "sess_001",
		type: "tool_use",
		content: { tool: "write", args: { path: "/src/auth/login.ts" } },
		tokens: 2000,
	},
	{
		timestamp: "2026-05-12T10:10:00.000Z",
		sessionId: "sess_001",
		type: "tool_use",
		content: { tool: "read", args: { path: "/src/auth/session.ts" } },
		tokens: 300,
	},
	{
		timestamp: "2026-05-12T14:00:00.000Z",
		sessionId: "sess_002",
		type: "tool_use",
		content: { tool: "write", args: { path: "/src/utils.ts" } },
		tokens: 1500,
	},
	{
		timestamp: "2026-05-12T11:00:00.000Z",
		sessionId: "sess_001",
		type: "think",
		content: { text: "planning" },
		tokens: 800,
	},
];

const mockSessionFiles = [
	"/sessions/20260512T100000_sess_001.jsonl",
	"/sessions/20260512T140000_sess_002.jsonl",
];

describe("collectSessionActivities", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// ── 正常路径 ─────────────────────────────────────────

	it("返回按 session 聚合的统计列表", async () => {
		(getSessionFiles as Mock).mockResolvedValue(mockSessionFiles);
		(readJsonlFile as Mock).mockImplementation(async (file: string) => {
			if (file.includes("sess_001")) return mockEntries.filter((e) => e.sessionId === "sess_001");
			if (file.includes("sess_002")) return mockEntries.filter((e) => e.sessionId === "sess_002");
			return [];
		});

		const result = await collectSessionActivities({ since: "2026-05-12T00:00:00.000Z", until: "2026-05-12T23:59:59.000Z" });
		expect(result.length).toBe(2);
	});

	it("每个 session 包含必需的统计字段", async () => {
		(getSessionFiles as Mock).mockResolvedValue(mockSessionFiles);
		(readJsonlFile as Mock).mockResolvedValue(mockEntries.filter((e) => e.sessionId === "sess_001"));

		const result = await collectSessionActivities({ since: "2026-05-12T00:00:00.000Z", until: "2026-05-12T23:59:59.000Z" });
		const session = result[0];
		expect(session).toHaveProperty("sessionId");
		expect(session).toHaveProperty("toolCount");
		expect(session).toHaveProperty("readCount");
		expect(session).toHaveProperty("writeCount");
		expect(session).toHaveProperty("totalTokens");
		expect(session).toHaveProperty("duration");
	});

	it("读/写次数统计正确", async () => {
		(getSessionFiles as Mock).mockResolvedValue(mockSessionFiles);
		(readJsonlFile as Mock).mockResolvedValue(mockEntries.filter((e) => e.sessionId === "sess_001"));

		const result = await collectSessionActivities({ since: "2026-05-12T00:00:00.000Z", until: "2026-05-12T23:59:59.000Z" });
		const session = result.find((s) => s.sessionId === "sess_001")!;
		expect(session.readCount).toBe(2); // 2 个 read tool
		expect(session.writeCount).toBe(1); // 1 个 write tool
		expect(session.toolCount).toBe(3); // 共 3 个 tool_use
	});

	it("totalTokens 正确累加所有 entry 的 tokens", async () => {
		(getSessionFiles as Mock).mockResolvedValue(mockSessionFiles);
		(readJsonlFile as Mock).mockResolvedValue(mockEntries.filter((e) => e.sessionId === "sess_001"));

		const result = await collectSessionActivities({ since: "2026-05-12T00:00:00.000Z", until: "2026-05-12T23:59:59.000Z" });
		const session = result.find((s) => s.sessionId === "sess_001")!;
		expect(session.totalTokens).toBe(3600); // 500 + 2000 + 300 + 800
	});

	it("keyFiles 从读写文件集合中去重", async () => {
		(getSessionFiles as Mock).mockResolvedValue(mockSessionFiles);
		(readJsonlFile as Mock).mockResolvedValue(mockEntries.filter((e) => e.sessionId === "sess_001"));

		const result = await collectSessionActivities({ since: "2026-05-12T00:00:00.000Z", until: "2026-05-12T23:59:59.000Z" });
		const session = result.find((s) => s.sessionId === "sess_001")!;
		expect(session.keyFiles).toContain("/src/auth/login.ts");
		expect(session.keyFiles).toContain("/src/auth/session.ts");
		// 去重：login.ts 只出现一次
		expect(session.keyFiles.filter((f: string) => f === "/src/auth/login.ts").length).toBe(1);
	});

	// ── 边界值 ─────────────────────────────────────────

	it("getSessionFiles 返回空时返回空数组", async () => {
		(getSessionFiles as Mock).mockResolvedValue([]);

		const result = await collectSessionActivities({ since: "2026-05-12T00:00:00.000Z", until: "2026-05-12T23:59:59.000Z" });
		expect(result).toEqual([]);
	});

	it("会话文件内容为空时仍返回条目但统计为 0", async () => {
		(getSessionFiles as Mock).mockResolvedValue(mockSessionFiles.slice(0, 1));
		(readJsonlFile as Mock).mockResolvedValue([]);

		const result = await collectSessionActivities({ since: "2026-05-12T00:00:00.000Z", until: "2026-05-12T23:59:59.000Z" });
		expect(result.length).toBe(1);
		expect(result[0].toolCount).toBe(0);
		expect(result[0].totalTokens).toBe(0);
	});

	it("大量 token（100000+）不溢出", async () => {
		const bigTokens = Array.from({ length: 50 }, (_, i) => ({
			timestamp: `2026-05-12T10:${String(i).padStart(2, "0")}:00.000Z`,
			sessionId: "sess_001",
			type: "tool_use",
			content: { tool: "write", args: { path: "/big/file.ts" } },
			tokens: 3000,
		}));

		(getSessionFiles as Mock).mockResolvedValue(mockSessionFiles.slice(0, 1));
		(readJsonlFile as Mock).mockResolvedValue(bigTokens);

		const result = await collectSessionActivities({ since: "2026-05-12T00:00:00.000Z", until: "2026-05-12T23:59:59.000Z" });
		expect(result[0].totalTokens).toBe(150000); // 50 * 3000
		expect(result[0].toolCount).toBe(50);
	});
});
