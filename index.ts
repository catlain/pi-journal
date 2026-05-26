import type { ExtensionFactory } from '@earendil-works/pi-coding-agent';
import { parseTimeRange } from './lib/time';
import { collectGitActivity } from './lib/git';
import { collectMemoryChanges } from './lib/memory';
import { collectSessionActivities } from './lib/sessions';
import { renderReport } from './lib/render';

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
 * 生成日志报告
 *
 * @param opts.timeRange - 时间范围描述（"today", "yesterday", "this_week", "1d", "2026-05-12" 等）
 * @returns Markdown 格式的报告，无效输入返回 null
 */
export async function doJournalReport(opts: { timeRange: string }): Promise<string | null> {
	const { timeRange } = opts;
	if (!timeRange) return null;

	// 判断日报/周报类型
	const isWeekly = timeRange === "this_week";
	const type = isWeekly ? "weekly" as const : "daily" as const;

	// 解析时间范围
	const range = parseTimeRange(timeRange);
	if (!range) return null;

	const { since, until } = range;

	// 计算期间描述
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

	// 三条管道并行采集（单条失败不阻塞其他）
	const [gitActivity, memoryChanges, sessionActivities] = await Promise.all([
		safeCollect(
			() => collectGitActivity({ repoPaths: [], since, until }),
			[],
		),
		safeCollect(
			() => collectMemoryChanges({ since, until }),
			[],
		),
		safeCollect(
			() => collectSessionActivities({ since, until }),
			[],
		),
	]);

	// 构建摘要
	const summary = {
		totalCommits: gitActivity.reduce(
			(sum: number, g: any) => sum + (g.commits || 0), 0,
		),
		totalSessions: sessionActivities.length,
		totalEdits: sessionActivities.reduce(
			(sum: number, s: any) => sum + (s.writeCount || 0), 0,
		),
		peakHours: "",
		mainTopics: [] as string[],
	};

	return renderReport({
		type,
		period,
		gitActivity,
		memoryChanges,
		sessionActivities,
		summary,
	});
}

const factory: ExtensionFactory = () => ({
	name: 'journal',
	tools: [],
	commands: [],
});
export default factory;
