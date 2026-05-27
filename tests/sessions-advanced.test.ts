/**
 * journal lib/sessions — 错误路径与优化测试
 *
 * 从 sessions.test.ts 拆分，覆盖：
 * - 错误：readJsonlFile 失败、getSessionFiles 异常
 * - 优化：首行时间过滤跳过范围外文件
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("pi-session-analyzer/core", () => ({
	getSessionFiles: vi.fn(),
	readJsonlFile: vi.fn(),
}));

import { collectSessionActivities } from "../lib/sessions";
import { getSessionFiles, readJsonlFile } from "pi-session-analyzer/core";
import type { Mock } from "vitest";

describe("collectSessionActivities — 错误路径与优化", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// ── 错误路径 ─────────────────────────────────────────

	it("readJsonlFile 异常时跳过该文件", async () => {
		(getSessionFiles as Mock).mockResolvedValue(["/sessions/fail.jsonl", "/sessions/ok.jsonl"]);
		(readJsonlFile as Mock).mockImplementation(async (file: string) => {
			if (file.includes("fail")) throw new Error("read error");
			return [{ timestamp: "2026-05-12T10:00:00.000Z", sessionId: "ok", type: "tool_use", content: { tool: "read" }, tokens: 100 }];
		});

		const result = await collectSessionActivities({ since: "2026-05-12T00:00:00.000Z", until: "2026-05-12T23:59:59.000Z" });
		expect(result.length).toBe(1);
		expect(result[0].sessionId).toBe("ok");
	});

	it("getSessionFiles 异常时返回空数组（静默降级）", async () => {
		(getSessionFiles as Mock).mockRejectedValue(new Error("permission denied"));

		const result = await collectSessionActivities({ since: "2026-05-12T00:00:00.000Z", until: "2026-05-12T23:59:59.000Z" });
		expect(result).toEqual([]);
	});

	// ── 首行时间过滤优化 ─────────────────────────────────

	it("范围外的会话文件不调用 readJsonlFile 全文读取", async () => {
		const outOfRangeFile = "/sessions/20260510T100000_sess_old.jsonl";
		const inRangeFile = "/sessions/20260512T100000_sess_ok.jsonl";

		(getSessionFiles as Mock).mockResolvedValue([outOfRangeFile, inRangeFile]);
		(readJsonlFile as Mock).mockImplementation(async (file: string) => {
			if (file.includes("sess_ok")) {
				return [{ timestamp: "2026-05-12T10:00:00.000Z", sessionId: "sess_ok", type: "tool_use", content: { tool: "read" }, tokens: 100 }];
			}
			return [];
		});

		const result = await collectSessionActivities({ since: "2026-05-12T00:00:00.000Z", until: "2026-05-12T23:59:59.000Z" });

		expect(result.length).toBe(1);
		expect(result[0].sessionId).toBe("sess_ok");

		const calledFiles = (readJsonlFile as Mock).mock.calls.map((c: string[]) => c[0]);
		expect(calledFiles.some((f: string) => f.includes("sess_old"))).toBe(false);
	});
});
