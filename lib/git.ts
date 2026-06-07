/**
 * journal 扩展 — Git 活动采集
 *
 * 对指定仓库列表执行 git 命令，统计提交数、文件变更等
 */

import { execSync } from "node:child_process";

export interface GitActivityResult {
	repo: string;
	commits: number;
	filesChanged: number;
	additions: number;
	deletions: number;
}

/**
 * 采集多个仓库在指定时间范围内的 Git 活动
 */
export function collectGitActivity(opts: {
	repoPaths: string[];
	since: string;
	until: string;
}): GitActivityResult[] {
	const { repoPaths, since, until } = opts;
	if (!repoPaths.length) return [];

	const results: GitActivityResult[] = [];

	for (const repo of repoPaths) {
		try {
			// 验证是 git 仓库
			execSync("git rev-list --count HEAD", { cwd: repo, encoding: "utf-8" });

			// 获取时间范围内的提交
			const log = execSync(
				`git log --after="${since}" --before="${until}" --oneline`,
				{ cwd: repo, encoding: "utf-8" },
			);
			const commits = log.trim().split("\n").filter(Boolean).length;

			// 获取变更统计
			let filesChanged = 0;
			let additions = 0;
			let deletions = 0;
			const stat = execSync("git diff --shortstat", { cwd: repo, encoding: "utf-8" }).trim();
			const filesMatch = stat.match(/(\d+) files? changed/);
			const addMatch = stat.match(/(\d+) insertion/);
			const delMatch = stat.match(/(\d+) deletion/);
			if (filesMatch) filesChanged = parseInt(filesMatch[1], 10);
			if (addMatch) additions = parseInt(addMatch[1], 10);
			if (delMatch) deletions = parseInt(delMatch[1], 10);

			results.push({ repo, commits, filesChanged, additions, deletions });
		} catch {
			// 非 git 目录或 git 命令失败 → 静默跳过
		}
	}

	return results;
}

/**
 * 采集多个仓库在时间范围内的 commit messages
 * 返回与 repoPaths 对应的二维数组
 */
export function collectCommitMessages(
	repoPaths: string[],
	since: string,
	until: string,
): string[][] {
	const results: string[][] = [];

	for (const repo of repoPaths) {
		try {
			const log = execSync(
				`git log --after="${since}" --before="${until}" --format="%s"`,
				{ cwd: repo, encoding: "utf-8" },
			);
			const msgs = log.trim().split("\n").filter(Boolean);
			results.push(msgs);
		} catch {
			results.push([]);
		}
	}

	return results;
}
