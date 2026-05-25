/**
 * journal 扩展 — 类型定义
 */

export interface GitCommit {
	hash: string;
	date: string;
	message: string;
	files: string[];
}

export interface GitActivity {
	commits: GitCommit[];
	modules: Record<string, { commits: number; files: number }>;
	totalFiles: number;
}

export type MemoryAction = "new" | "modified" | "unknown";

export interface MemoryChange {
	path: string;
	scope: "L1" | "L2";
	action: MemoryAction;
	description: string;
}

export interface SessionActivity {
	sessionId: string;
	model: string;
	messageCount: number;
	toolCount: number;
	totalTokens: number;
	filesEdited: string[];
}

export interface JournalReport {
	date: string;
	since: string;
	until: string;
	git: GitActivity;
	memory: MemoryChange[];
	sessions: SessionActivity[];
}
