/**
 * journal factory — 测试 ExtensionFactory 注册命令和工具
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";

vi.mock("../lib/git", () => ({ collectGitActivity: vi.fn() }));
vi.mock("../lib/memory", () => ({ collectMemoryChanges: vi.fn() }));
vi.mock("../lib/sessions", () => ({ collectSessionActivities: vi.fn() }));
vi.mock("../lib/render", () => ({ renderReport: vi.fn() }));

import { collectGitActivity } from "../lib/git";
import { collectMemoryChanges } from "../lib/memory";
import { collectSessionActivities } from "../lib/sessions";
import defaultFactory from "../index";
import { renderReport } from "../lib/render";

/** 默认返回空数组让 generateReport 的 reduce 不报错 */
function setupDefaults() {
	(collectGitActivity as Mock).mockResolvedValue([]);
	(collectMemoryChanges as Mock).mockResolvedValue([]);
	(collectSessionActivities as Mock).mockResolvedValue([]);
}

describe("ExtensionFactory", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setupDefaults();
	});

	it("注册 journal 命令", () => {
		const pi = { registerCommand: vi.fn(), registerTool: vi.fn(), appendEntry: vi.fn() };
		defaultFactory(pi as any);
		expect(pi.registerCommand).toHaveBeenCalledWith("journal", expect.objectContaining({
			description: expect.stringContaining("日报/周报"),
		}));
	});

	it("注册 journal 工具", () => {
		const pi = { registerCommand: vi.fn(), registerTool: vi.fn(), appendEntry: vi.fn() };
		defaultFactory(pi as any);
		expect(pi.registerTool).toHaveBeenCalledWith(expect.objectContaining({ name: "journal" }));
	});

	it("命令 handler：有效时间范围调用 appendEntry", async () => {
		const appendEntry = vi.fn();
		const notify = vi.fn();
		let handler: any;
		const pi = {
			registerCommand: vi.fn((_name: string, opts: any) => { handler = opts.handler; }),
			registerTool: vi.fn(),
			appendEntry,
		};
		(renderReport as Mock).mockReturnValue("# 日报");
		defaultFactory(pi as any);
		await handler("today", { ui: { notify } });
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("📓"), "info");
		expect(appendEntry).toHaveBeenCalledWith("assistant", expect.stringContaining("#"));
	});

	it("命令 handler：无效时间范围发警告", async () => {
		const notify = vi.fn();
		let handler: any;
		const pi = {
			registerCommand: vi.fn((_name: string, opts: any) => { handler = opts.handler; }),
			registerTool: vi.fn(),
			appendEntry: vi.fn(),
		};
		(renderReport as Mock).mockReturnValue(undefined as any);
		defaultFactory(pi as any);
		await handler("invalid", { ui: { notify } });
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("无效的时间范围"), "warning");
	});

	it("命令 handler：异常时发错误通知", async () => {
		let handler: any;
		const pi = {
			registerCommand: vi.fn((_name: string, opts: any) => { handler = opts.handler; }),
			registerTool: vi.fn(),
			appendEntry: vi.fn(),
		};
		(renderReport as Mock).mockImplementation(() => { throw new Error("boom"); });
		defaultFactory(pi as any);
		await handler("today", { ui: { notify: vi.fn() } });
	});

	it("工具 execute：有效范围返回文本内容", async () => {
		let execute: any;
		const pi = {
			registerCommand: vi.fn(),
			registerTool: vi.fn((opts: any) => { execute = opts.execute; }),
			appendEntry: vi.fn(),
		};
		(renderReport as Mock).mockReturnValue("# 日报\n内容");
		defaultFactory(pi as any);
		const result = await execute("call-1", { timeRange: "yesterday" });
		expect(result).toHaveProperty("content");
		expect(result.content[0].text).toContain("# 日报");
	});

	it("工具 execute：无效范围返回错误文本", async () => {
		let execute: any;
		const pi = {
			registerCommand: vi.fn(),
			registerTool: vi.fn((opts: any) => { execute = opts.execute; }),
			appendEntry: vi.fn(),
		};
		(renderReport as Mock).mockReturnValue(undefined as any);
		defaultFactory(pi as any);
		const result = await execute("call-2", { timeRange: "invalid" });
		expect(result.content[0].text).toContain("无效的时间范围");
	});

	it("工具 execute：异常时返回错误信息", async () => {
		let execute: any;
		const pi = {
			registerCommand: vi.fn(),
			registerTool: vi.fn((opts: any) => { execute = opts.execute; }),
			appendEntry: vi.fn(),
		};
		(renderReport as Mock).mockImplementation(() => { throw new Error("crash"); });
		defaultFactory(pi as any);
		const result = await execute("call-3", { timeRange: "today" });
		expect(result.content[0].text).toContain("生成报告失败");
		expect(result.content[0].text).toContain("crash");
	});

	it("工具 execute：默认 timeRange 为 today", async () => {
		let execute: any;
		const pi = {
			registerCommand: vi.fn(),
			registerTool: vi.fn((opts: any) => { execute = opts.execute; }),
			appendEntry: vi.fn(),
		};
		(renderReport as Mock).mockReturnValue("# 日报\n默认");
		defaultFactory(pi as any);
		const result = await execute("call-4", {});
		expect(result.content[0].text).toContain("# 日报");
	});
});
