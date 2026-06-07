/**
 * journal 扩展 — 会话活动采集
 *
 * 从 session 文件读取 JSONL 条目，按 session 聚合统计
 * 可选依赖 pi-session-analyzer：如果安装了，额外采集语义语料
 */

// ---- 可选依赖：pi-session-analyzer ----
// 方案 C：不强制安装，有就用，没有就降级为纯统计
// 延迟加载：不在模块顶层 require，而是第一次调用时加载
// 这样 vitest 的 vi.mock 可以在 import 被测模块前注册 mock

let _saCore: typeof import("pi-session-analyzer/core") | null | undefined = undefined;
let _saAnalyze: typeof import("pi-session-analyzer/analyze") | null | undefined = undefined;
let _saTakeover: typeof import("pi-session-analyzer/takeover") | null | undefined = undefined;

/** 懒加载 saCore */
function getSaCore() {
	if (_saCore === undefined) {
		try { _saCore = require("pi-session-analyzer/core"); } catch { _saCore = null; }
	}
	return _saCore;
}

/** 懒加载 saAnalyze */
function getSaAnalyze() {
	if (_saAnalyze === undefined) {
		try { _saAnalyze = require("pi-session-analyzer/analyze"); } catch { _saAnalyze = null; }
	}
	return _saAnalyze;
}

/** 懒加载 saTakeover */
function getSaTakeover() {
	if (_saTakeover === undefined) {
		try { _saTakeover = require("pi-session-analyzer/takeover"); } catch { _saTakeover = null; }
	}
	return _saTakeover;
}

/** 是否有语义分析能力 */
export function hasSemanticSupport(): boolean {
	return getSaCore() !== null;
}

/** 测试用：强制注入模块（覆盖懒加载） */
export function _injectModules(modules: {
	core?: Record<string, unknown>;
	analyze?: Record<string, unknown>;
	takeover?: Record<string, unknown>;
}) {
	if (modules.core !== undefined) _saCore = modules.core as never;
	if (modules.analyze !== undefined) _saAnalyze = modules.analyze as never;
	if (modules.takeover !== undefined) _saTakeover = modules.takeover as never;
}

// ---- 类型定义 ----

export interface SessionActivityResult {
	sessionId: string;
	title: string;
	toolCount: number;
	readCount: number;
	writeCount: number;
	totalTokens: number;
	duration: string;
	keyFiles: string[];
	/** 语义语料（需要 pi-session-analyzer） */
	semantic?: SessionSemanticData;
}

export interface SessionSemanticData {
	/** 会话摘要 */
	summary: string;
	/** 对话序列（user/assistant 交互） */
	digest: string;
	/** 关键决策 */
	keyDecisions: string[];
	/** 用户意图 */
	userIntents: string[];
}

// ---- 辅助函数 ----

/** 从文件名提取 sessionId（如 _sess_001.jsonl → sess_001） */
function extractSessionId(filePath: string): string {
	const m = filePath.match(/_([^_/]+)\.jsonl$/);
	return m ? m[1] : filePath.replace(/\.jsonl$/, "");
}

/** 从文件名提取日期（如 20260512 → Date） */
function extractFileDate(filePath: string): Date | null {
	const m = filePath.match(/(\d{4})(\d{2})(\d{2})T/);
	if (!m) return null;
	return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
}

function formatDuration(ms: number): string {
	const minutes = Math.floor(ms / 60000);
	const hours = Math.floor(minutes / 60);
	const remainMin = minutes % 60;
	if (hours > 0) return `${hours}h ${remainMin}m`;
	if (remainMin > 0) return `${remainMin}m`;
	return "<1m";
}

/**
 * 提取单个会话的语义数据（需要 pi-session-analyzer）
 */
function extractSemanticData(entries: unknown[]): SessionSemanticData | undefined {
	const analyze = getSaAnalyze();
	const takeover = getSaTakeover();
	if (!analyze || !takeover) return undefined;

	try {
		const summary = analyze.doSummary(entries, "");
		const digest = analyze.doDigest(entries);
		const keyDecisions = takeover.extractKeyDecisions(entries);
		const userIntents = takeover.extractUserIntent(entries);

		return {
			summary: typeof summary === "string" ? summary : JSON.stringify(summary),
			digest: typeof digest === "string" ? digest : JSON.stringify(digest),
			keyDecisions,
			userIntents,
		};
	} catch {
		// 语义提取失败，不影响统计
		return undefined;
	}
}

/**
 * 采集时间范围内的会话活动统计 + 语义语料
 */
export async function collectSessionActivities(opts: {
	since: string;
	until: string;
}): Promise<SessionActivityResult[]> {
	const { since, until } = opts;
	const sinceDate = since.slice(0, 10); // YYYY-MM-DD
	const untilDate = until.slice(0, 10);

	let files: string[];
	try {
		const core = getSaCore();
		if (!core) return [];
		files = await core.getSessionFiles();
	} catch {
		return [];
	}

	if (!files?.length) return [];

	const results: SessionActivityResult[] = [];

	for (const file of files) {
		// 优化：基于文件名日期预过滤，跳过范围外的文件
		const fileDate = extractFileDate(file);
		if (fileDate) {
			const fd = fileDate.toISOString().slice(0, 10);
			if (fd < sinceDate || fd > untilDate) continue;
		}

		try {
			const entries = await getSaCore()!.readJsonlFile(file);
			const sessionId = extractSessionId(file);

			// 空文件 → 仍返回统计为 0 的条目
			if (!entries?.length) {
				results.push({
					sessionId,
					title: sessionId,
					toolCount: 0, readCount: 0, writeCount: 0,
					totalTokens: 0, duration: "<1m", keyFiles: [],
				});
				continue;
			}

			// 按 sessionId 聚合（取第一个有 sessionId 的条目）
			const sid = entries.find((e: Record<string, unknown>) => e.sessionId)?.sessionId ?? sessionId;
			const toolUse = entries.filter((e: Record<string, unknown>) => e.type === "tool_use");
			const readCount = toolUse.filter((e: Record<string, unknown>) => (e.content as Record<string, unknown>)?.tool === "read").length;
			const writeCount = toolUse.filter((e: Record<string, unknown>) => {
				const tool = (e.content as Record<string, unknown>)?.tool;
				return tool === "write" || tool === "edit";
			}).length;
			const totalTokens = entries.reduce((sum: number, e: Record<string, unknown>) => sum + ((e.tokens as number) ?? 0), 0);
			const timestamps = entries
				.map((e: Record<string, unknown>) => new Date(e.timestamp as string).getTime())
				.filter((t: number) => !isNaN(t))
				.sort();
			const durationMs = timestamps.length > 1
				? timestamps[timestamps.length - 1] - timestamps[0]
				: 0;

			const filesSet = new Set<string>();
			for (const e of toolUse) {
				const p = ((e.content as Record<string, unknown>)?.args as Record<string, unknown>)?.path as string | undefined;
				if (p) filesSet.add(p);
			}

			// 语义语料提取（可选）
			const semantic = extractSemanticData(entries);

			results.push({
				sessionId: sid,
				title: sid,
				toolCount: toolUse.length,
				readCount,
				writeCount,
				totalTokens,
				duration: formatDuration(durationMs),
				keyFiles: [...filesSet],
				semantic,
			});
		} catch {
			// 单文件读取失败 → 跳过
		}
	}

	return results;
}
