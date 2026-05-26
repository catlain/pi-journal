/**
 * journal lib/time — 单元测试
 *
 * 测试 parseTimeRange 纯函数：正常时间范围、边界值、无效输入
 */

import { describe, it, expect } from "vitest";
import { parseTimeRange } from "../lib/time";

// ── 正常路径 ─────────────────────────────────────────────

describe("parseTimeRange", () => {
	it("自然语言 'today' 生成当天 00:00~23:59", () => {
		const result = parseTimeRange("today");
		expect(result).toBeDefined();
		expect(result.since).toBeDefined();
		expect(result.until).toBeDefined();

		const since = new Date(result.since);
		const until = new Date(result.until);
		const now = new Date();

		expect(since.getFullYear()).toBe(now.getFullYear());
		expect(since.getMonth()).toBe(now.getMonth());
		expect(since.getDate()).toBe(now.getDate());
		expect(since.getHours()).toBe(0);
		expect(since.getMinutes()).toBe(0);
		expect(since.getSeconds()).toBe(0);

		expect(until.getFullYear()).toBe(now.getFullYear());
		expect(until.getMonth()).toBe(now.getMonth());
		expect(until.getDate()).toBe(now.getDate());
		expect(until.getHours()).toBe(23);
		expect(until.getMinutes()).toBe(59);
		expect(until.getSeconds()).toBe(59);
	});

	it("自然语言 'yesterday' 生成昨天的 00:00~23:59", () => {
		const result = parseTimeRange("yesterday");
		expect(result).toBeDefined();

		const since = new Date(result.since);
		const until = new Date(result.until);
		const yesterday = new Date();
		yesterday.setDate(yesterday.getDate() - 1);

		expect(since.getFullYear()).toBe(yesterday.getFullYear());
		expect(since.getMonth()).toBe(yesterday.getMonth());
		expect(since.getDate()).toBe(yesterday.getDate());
		expect(since.getHours()).toBe(0);

		expect(until.getFullYear()).toBe(yesterday.getFullYear());
		expect(until.getMonth()).toBe(yesterday.getMonth());
		expect(until.getDate()).toBe(yesterday.getDate());
		expect(until.getHours()).toBe(23);
	});

	it("自然语言 'this_week' 生成周一 00:00 ~ 周日 23:59", () => {
		const result = parseTimeRange("this_week");
		expect(result).toBeDefined();

		const since = new Date(result.since);
		const until = new Date(result.until);
		const now = new Date();
		const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon...
		const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
		const expectedMonday = new Date(now);
		expectedMonday.setDate(now.getDate() + mondayOffset);

		expect(since.getFullYear()).toBe(expectedMonday.getFullYear());
		expect(since.getMonth()).toBe(expectedMonday.getMonth());
		expect(since.getDate()).toBe(expectedMonday.getDate());

		// until 应比 since 晚 ~7 天（周一 00:00 ~ 周日 23:59:59）
		const diffDays = (until.getTime() - since.getTime()) / 86400000;
		expect(Math.round(diffDays)).toBe(7);
	});

	it("ISO 日期格式 '2026-05-12' 生成当天的范围", () => {
		const result = parseTimeRange("2026-05-12");
		expect(result.since).toMatch(/^2026-05-12T00:00:00/);
		expect(result.until).toMatch(/^2026-05-12T23:59:59/);
	});

	it("ISO 带时间 '2026-05-12T14:30:00' 解析为精确时间点", () => {
		const result = parseTimeRange("2026-05-12T14:30:00");
		expect(result.since).toMatch(/^2026-05-12T14:30:00/);
		// until 与 since 相同，表示精确时间点
		expect(result.until).toBe(result.since);
	});

	it("ISO 带时区偏移 '2026-05-12T14:30:00+08:00' 正确处理", () => {
		const result = parseTimeRange("2026-05-12T14:30:00+08:00");
		// toLocalISO 输出本地时间，+08:00 时区下与输入一致
		expect(result.since).toMatch(/^2026-05-12T14:30:00/);
	});

	it("相对时间 '1h' 生成 1 小时前的范围", () => {
		const before = Date.now();
		const result = parseTimeRange("1h");
		const after = Date.now();

		const sinceMs = new Date(result.since).getTime();
		// 1 小时 = 3600000 毫秒
		expect(sinceMs).toBeGreaterThanOrEqual(before - 3600000 - 1000); // 允许 1s 误差
		expect(sinceMs).toBeLessThanOrEqual(after - 3600000 + 1000);
	});

	it("相对时间 '2d' 生成 2 天前的范围", () => {
		const before = Date.now();
		const result = parseTimeRange("2d");
		const after = Date.now();

		const sinceMs = new Date(result.since).getTime();
		const twoDaysMs = 2 * 24 * 3600000;
		expect(sinceMs).toBeGreaterThanOrEqual(before - twoDaysMs - 1000);
		expect(sinceMs).toBeLessThanOrEqual(after - twoDaysMs + 1000);
	});

	it("相对时间 '30m' 生成 30 分钟前的范围", () => {
		const before = Date.now();
		const result = parseTimeRange("30m");
		const after = Date.now();

		const sinceMs = new Date(result.since).getTime();
		const thirtyMinMs = 30 * 60000;
		expect(sinceMs).toBeGreaterThanOrEqual(before - thirtyMinMs - 1000);
		expect(sinceMs).toBeLessThanOrEqual(after - thirtyMinMs + 1000);
	});

	// ── 边界值 ─────────────────────────────────────────

	it("相对时间 '0h' 生成当前时间点", () => {
		const before = Date.now();
		const result = parseTimeRange("0h");
		const after = Date.now();

		const sinceMs = new Date(result.since).getTime();
		expect(sinceMs).toBeGreaterThanOrEqual(before - 1000);
		expect(sinceMs).toBeLessThanOrEqual(after + 1000);
	});

	it("相对时间 '7d' 生成 7 天前范围", () => {
		const before = Date.now();
		const result = parseTimeRange("7d");
		const sinceMs = new Date(result.since).getTime();
		expect(sinceMs).toBeGreaterThan(before - 8 * 86400000);
		expect(sinceMs).toBeLessThan(before - 6 * 86400000);
	});

	// ── 错误路径 ─────────────────────────────────────────

	it("无效自然语言返回 null", () => {
		const result = parseTimeRange("invalid_keyword");
		expect(result).toBeNull();
	});

	it("空字符串返回 null", () => {
		const result = parseTimeRange("");
		expect(result).toBeNull();
	});

	it("无效 ISO 格式返回 null", () => {
		const result = parseTimeRange("not-a-date");
		expect(result).toBeNull();
	});

	it("无效相对时间后缀返回 null", () => {
		const result = parseTimeRange("5x"); // x is invalid
		expect(result).toBeNull();
	});

	it("负数值相对时间返回 null", () => {
		const result = parseTimeRange("-1h");
		expect(result).toBeNull();
	});

	it("纯数字字符串返回 null", () => {
		const result = parseTimeRange("12345");
		expect(result).toBeNull();
	});

	it("特殊字符返回 null", () => {
		const result = parseTimeRange("!@#$%");
		expect(result).toBeNull();
	});

	// ── 默认值 ─────────────────────────────────────────
	it("无参数时默认返回 '1d' 对应的时间范围", () => {
		const before = Date.now();
		const result = parseTimeRange();
		const after = Date.now();

		expect(result).toBeDefined();

		const sinceMs = new Date(result!.since).getTime();
		const oneDayMs = 24 * 3600000;

		// since 应在 (now - 1d) 附近
		expect(sinceMs).toBeGreaterThanOrEqual(before - oneDayMs - 1000);
		expect(sinceMs).toBeLessThanOrEqual(after - oneDayMs + 1000);
	});
});
