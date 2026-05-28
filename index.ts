import type { ExtensionFactory } from '@earendil-works/pi-coding-agent';
import { parseTimeRange } from './lib/time';
import { collectGitActivity } from './lib/git';
import type { GitActivityResult } from './lib/git';
import { collectMemoryChanges } from './lib/memory';
import { collectSessionActivities } from './lib/sessions';
import type { SessionActivityResult } from './lib/sessions';
import { renderReport } from './lib/render';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

/** 自动发现 ~/.pi/agent/git/ 下的 git 仓库 */
function discoverGitRepos(): string[] {
	const gitBase = join(homedir(), '.pi/agent/git');
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
						if (statSync(projPath).isDirectory() && statSync(join(projPath, '.git')).isDirectory()) {
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

/**
 * 安全执行采集管道，异常时返回 fallback 值
 */
async function safeCollect<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
	try {
		return await fn();
	} catch {
		return fallback;
	}
}

/**
 * 生成日志报告（内部实现）
 */
async function generateReport(timeRange: string): Promise<string | null> {
	const isWeekly = timeRange === "this_week";
	const type = isWeekly ? "weekly" as const : "daily" as const;

	const range = parseTimeRange(timeRange);
	if (!range) return null;

	const { since, until } = range;

	let period: string;
	if (isWeekly) {
		const s = new Date(since);
		const e = new Date(until);
		const fmt = (d: Date) =>
			`${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
		period = `${fmt(s)} ~ ${fmt(e)}`;
	} else {
		period = since.slice(0, 10);
	}

	const [gitActivity, memoryChanges, sessionActivities] = await Promise.all([
		safeCollect(() => collectGitActivity({ repoPaths: discoverGitRepos(), since, until }), []),
		safeCollect(() => collectMemoryChanges({ since, until }), []),
		safeCollect(() => collectSessionActivities({ since, until }), []),
	]);

	const summary = {
		totalCommits: gitActivity.reduce((sum, g: GitActivityResult) => sum + g.commits, 0),
		totalSessions: sessionActivities.length,
		totalEdits: sessionActivities.reduce((sum, s: SessionActivityResult) => sum + s.writeCount, 0),
		peakHours: "",
		mainTopics: [] as string[],
	};

	return renderReport({ type, period, gitActivity, memoryChanges, sessionActivities, summary });
}

const factory: ExtensionFactory = (pi) => {
	// --- 命令: /journal ---
	pi.registerCommand('journal', {
		description: '生成开发日报/周报。用法: /journal [today|yesterday|this_week|1d|3d|YYYY-MM-DD]，默认 today',
		handler: async (args: string, ctx) => {
			const timeRange = args.trim() || 'today';
			ctx.ui.notify('📓 正在采集数据，生成报告中...', 'info');

			try {
				const report = await generateReport(timeRange);
				if (!report) {
					ctx.ui.notify(`无效的时间范围: "${timeRange}"\n\n支持格式: today, yesterday, this_week, 1d, 3d, 1w, YYYY-MM-DD`, 'warning');
					return;
				}
				pi.appendEntry('assistant', report);
			} catch (err: unknown) {
				ctx.ui.notify(`生成报告失败: ${err instanceof Error ? err.message : String(err)}`, 'error');
			}
		},
	});

	// --- 工具: journal ---
	pi.registerTool({
		name: 'journal',
		label: 'Journal',
		description: '生成开发日报/周报。采集 git 活动、记忆变更、会话活动，生成 Markdown 报告。用户说"写日记"、"写日报"、"写周报"、"今天做了什么"时使用此工具。',
		promptSnippet: '生成开发日记/日报/周报',
		parameters: {
			type: 'object',
			properties: {
				timeRange: {
					type: 'string',
					description: '时间范围: today, yesterday, this_week, 1d, 3d, 1w, YYYY-MM-DD。默认 today',
				},
			},
			required: [],
		},
		async execute(_toolCallId: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
			const timeRange = (params.timeRange as string) || 'today';
			try {
				const report = await generateReport(timeRange);
				if (!report) {
					return { content: [{ type: 'text', text: `无效的时间范围: "${timeRange}"\n\n支持格式: today, yesterday, this_week, 1d, 3d, 1w, YYYY-MM-DD` }] };
				}
				return { content: [{ type: 'text', text: report }] };
			} catch (err: unknown) {
				return { content: [{ type: 'text', text: `生成报告失败: ${err instanceof Error ? err.message : String(err)}` }] };
			}
		},
	});
};

export default factory;

export { generateReport as doJournalReport };
export { discoverGitRepos, safeCollect };
