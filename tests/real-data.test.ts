/**
 * 集成测试：用真实数据测试 journal 核心逻辑
 * 不 mock，直接读取本地 git/memory/session
 */
import { describe, it, expect } from "vitest";
import { parseTimeRange } from "../lib/time";
import { collectGitActivity } from "../lib/git";
import { collectMemoryChanges } from "../lib/memory";
import { collectSessionActivities } from "../lib/sessions";
import { renderReport } from "../lib/render";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

/** 发现本地 git 仓库 */
function discoverGitRepos(): string[] {
	const gitBase = join(homedir(), ".pi/agent/git");
	try {
		const hosts = readdirSync(gitBase);
		const repos: string[] = [];
		for (const host of hosts) {
			const hostPath = join(gitBase, host);
			if (!statSync(hostPath).isDirectory()) continue;
			const owners = readdirSync(hostPath);
			for (const owner of owners) {
				const ownerPath = join(hostPath, owner);
				if (!statSync(ownerPath).isDirectory()) continue;
				const projects = readdirSync(ownerPath);
				for (const proj of projects) {
					const projPath = join(ownerPath, proj);
					try {
						if (statSync(projPath).isDirectory() && statSync(join(projPath, ".git")).isDirectory()) {
							repos.push(projPath);
						}
					} catch { /* not a git repo */ }
				}
			}
		}
		return repos;
	} catch {
		return [];
	}
}

describe("真实数据集成测试", () => {
	it("today: 完整流程生成报告", async () => {
		const range = parseTimeRange("today");
		expect(range).toBeTruthy();
		console.log("时间范围:", range);

		const repoPaths = discoverGitRepos();
		console.log("发现仓库:", repoPaths.length, "个");

		const [git, mem, sess] = await Promise.all([
			collectGitActivity({ repoPaths, since: range!.since, until: range!.until }),
			collectMemoryChanges({ since: range!.since, until: range!.until }),
			collectSessionActivities({ since: range!.since, until: range!.until }),
		]);

		console.log("Git:", git.length, "个项目");
		console.log("Memory:", mem.length, "条变更");
		console.log("Session:", sess.length, "个会话");

		const report = renderReport({
			type: "daily",
			period: range!.since.slice(0, 10),
			gitActivity: git,
			memoryChanges: mem,
			sessionActivities: sess,
			summary: {
				totalCommits: git.reduce((s: number, g: any) => s + (g.commits || 0), 0),
				totalSessions: sess.length,
				totalEdits: sess.reduce((s: number, x: any) => s + (x.writeCount || 0), 0),
				peakHours: "",
				mainTopics: [],
			},
		});

		console.log("\n========== 生成报告 ==========\n");
		console.log(report);

		expect(report).toBeTruthy();
		expect(report).toContain("# 日报");
	});
});
