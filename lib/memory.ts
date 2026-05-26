/**
 * journal 扩展 — 记忆变更采集
 *
 * 扫描 L1/L2 记忆目录，按时间范围过滤，判断 new/modified/unknown
 */

import { scanMemoryDir } from "@pi-atelier/shared-utils";

export interface MemoryChangeResult {
	path: string;
	action: "new" | "modified" | "unknown";
	timestamp: string;
	description: string;
}

/**
 * 采集时间范围内的记忆文件变更
 */
export async function collectMemoryChanges(opts: {
	since: string;
	until: string;
}): Promise<MemoryChangeResult[]> {
	const { since, until } = opts;
	const sinceMs = new Date(since).getTime();
	const untilMs = new Date(until).getTime();

	try {
		const memories = await (scanMemoryDir as any)();
		if (!Array.isArray(memories)) return [];

		const results: MemoryChangeResult[] = [];
		for (const mem of memories) {
			if (mem.mtimeMs < sinceMs || mem.mtimeMs >= untilMs) continue;

			let action: "new" | "modified" | "unknown" = "unknown";
			const birthMs = mem.birthtimeMs ?? 0;
			if (birthMs === 0 || birthMs === mem.mtimeMs) {
				// birthtime 无效（epoch）或等于 mtime（无法区分新建 vs 未修改）
				action = "unknown";
			} else if (birthMs >= sinceMs) {
				action = "new"; // 文件在时间范围内创建
			} else {
				action = "modified"; // 文件在时间范围外创建但范围内修改
			}

			results.push({
				path: mem.path,
				action,
				timestamp: new Date(mem.mtimeMs).toISOString(),
				description: extractDescription(mem.content ?? ""),
			});
		}
		return results;
	} catch {
		// ENOENT 或权限错误 → 静默降级
		return [];
	}
}

/** 跳过标题行和关键词行，取后续内容（最多 8 行） */
function extractDescription(content: string): string {
	const lines = content.split("\n");
	return lines.slice(2, 10).join("\n");
}
