/**
 * journal 扩展 — 会话活动采集
 *
 * 从 session 文件读取 JSONL 条目，按 session 聚合统计
 */

// 直接引用 session-analyzer/core（测试通过 vitest mock 路径 "../session-analyzer/core" 拦截）
import { getSessionFiles, readJsonlFile } from "pi-session-analyzer/core";

export interface SessionActivityResult {
	sessionId: string;
	title: string;
	toolCount: number;
	readCount: number;
	writeCount: number;
	totalTokens: number;
	duration: string;
	keyFiles: string[];
}

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
 * 采集时间范围内的会话活动统计
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
		files = await (getSessionFiles as any)();
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
			const entries: any[] = await (readJsonlFile as any)(file);
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
			const sid = entries.find((e: any) => e.sessionId)?.sessionId ?? sessionId;
			const toolUse = entries.filter((e: any) => e.type === "tool_use");
			const readCount = toolUse.filter((e: any) => e.content?.tool === "read").length;
			const writeCount = toolUse.filter((e: any) =>
				e.content?.tool === "write" || e.content?.tool === "edit",
			).length;
			const totalTokens = entries.reduce((sum: number, e: any) => sum + (e.tokens ?? 0), 0);
			const timestamps = entries
				.map((e: any) => new Date(e.timestamp).getTime())
				.filter((t: number) => !isNaN(t))
				.sort();
			const durationMs = timestamps.length > 1
				? timestamps[timestamps.length - 1] - timestamps[0]
				: 0;

			const filesSet = new Set<string>();
			for (const e of toolUse) {
				const p = e.content?.args?.path;
				if (p) filesSet.add(p);
			}

			results.push({
				sessionId: sid,
				title: sid,
				toolCount: toolUse.length,
				readCount,
				writeCount,
				totalTokens,
				duration: formatDuration(durationMs),
				keyFiles: [...filesSet],
			});
		} catch {
			// 单文件读取失败 → 跳过
		}
	}

	return results;
}
