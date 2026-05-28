/**
 * lib 边缘分支测试 — memory.ts / time.ts
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// --- node:os mock 用于 memory 测试 ---
vi.mock("node:os", () => ({ homedir: () => "/tmp/fake-mem-home" }));

// --- node:fs mock: 精确控制 statSync/readdirSync/readFileSync ---
const mockFs = vi.hoisted(() => ({
	statSync: vi.fn(),
	readdirSync: vi.fn(),
	readFileSync: vi.fn(),
}));
vi.mock("node:fs", () => ({
	statSync: mockFs.statSync,
	readdirSync: mockFs.readdirSync,
	readFileSync: mockFs.readFileSync,
}));

import { collectMemoryChanges } from "../lib/memory";
import { parseTimeRange } from "../lib/time";

describe("lib/memory — scanMemoryDirWithStats inner catch", () => {
	beforeEach(() => vi.clearAllMocks());

	it("statSync(filePath) 异常时跳过该文件", async () => {
		// 奇数次调用 → dir 检查返回 truthy，偶数次 → file stat 抛出异常
		let cnt = 0;
		mockFs.statSync.mockImplementation(() => {
			cnt++;
			if (cnt % 2 === 1) return {};
			throw new Error("ENOENT");
		});
		mockFs.readdirSync.mockReturnValue(["test.md"]);

		await collectMemoryChanges({ since: "2000-01-01", until: "2099-12-31" });
		// 内层 catch 正常捕获，不抛异常
	});

	it("readFileSync 异常时跳过该文件", async () => {
		mockFs.statSync.mockReturnValue({});
		mockFs.readdirSync.mockReturnValue(["test.md"]);
		mockFs.readFileSync.mockImplementation(() => {
			throw new Error("permission denied");
		});

		await collectMemoryChanges({ since: "2000-01-01", until: "2099-12-31" });
	});
});

describe("lib/time — parseTimeRange switch case w 和 default", () => {
	it('"1w" 触发 case w 分支', () => {
		const result = parseTimeRange("1w");
		expect(result).toBeTruthy();
		expect(result!.since).toBeDefined();
		expect(result!.until).toBeDefined();
	});

	it('无效单位触发 default 返回 null', () => {
		expect(parseTimeRange("1x")).toBeNull();
	});
});
