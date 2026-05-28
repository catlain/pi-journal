/**
 * journal 扩展 — 记忆变更采集
 *
 * 扫描 L1/L2 记忆目录，按时间范围过滤，判断 new/modified/unknown
 */

import { statSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface MemoryChangeResult {
	path: string;
	action: "new" | "modified" | "unknown";
	timestamp: string;
	description: string;
}

/** 记忆文件信息（带 stat 元数据） */
interface MemoryFileEntry {
	file: string;
	content: string;
	mtimeMs: number;
	birthtimeMs: number;
}

/** 扫描单个记忆目录，返回带 stat 元数据的文件列表 */
function scanMemoryDirWithStats(dir: string): MemoryFileEntry[] {
	if (!statSync(dir, { throwIfNoEntry: false })) return [];

	const results: MemoryFileEntry[] = [];
	const files = readdirSync(dir)
		.filter((f) => f.endsWith(".md") && f !== "MEMORY.md")
		.sort();

	for (const file of files) {
		const filePath = join(dir, file);
		try {
			const stat = statSync(filePath);
			const content = readFileSync(filePath, "utf-8");
			results.push({
				file,
				content,
				mtimeMs: stat.mtimeMs,
				birthtimeMs: stat.birthtimeMs ?? 0,
			});
		} catch {
			continue;
		}
	}
	return results;
}

/** 记忆目录映射 */
const MEMORY_DIRS: Array<{ dir: string; scope: "L1" | "L2" }> = [
	{ dir: join(homedir(), ".pi/agent/memory"), scope: "L1" },
	{ dir: ".pi/memory", scope: "L2" },
];

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

	const results: MemoryChangeResult[] = [];

	for (const { dir } of MEMORY_DIRS) {
		const entries = scanMemoryDirWithStats(dir);

		for (const mem of entries) {
			if (mem.mtimeMs < sinceMs || mem.mtimeMs >= untilMs) continue;

			let action: "new" | "modified" | "unknown" = "unknown";
			const birthMs = mem.birthtimeMs;
			if (birthMs === 0 || birthMs === mem.mtimeMs) {
				action = "unknown";
			} else if (birthMs >= sinceMs) {
				action = "new";
			} else {
				action = "modified";
			}

			results.push({
				path: mem.file,
				action,
				timestamp: new Date(mem.mtimeMs).toISOString(),
				description: extractDescription(mem.content),
			});
		}
	}

	return results;
}

/** 跳过标题行和关键词行，取后续内容（最多 8 行） */
function extractDescription(content: string): string {
	const lines = content.split("\n");
	return lines.slice(2, 10).join("\n");
}
