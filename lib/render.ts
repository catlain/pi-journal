/**
 * journal 扩展 — Markdown 报告渲染
 *
 * 纯函数：将采集数据渲染为日报/周报 Markdown
 */

import type { GitActivityResult } from "./git";
import type { MemoryChangeResult } from "./memory";
import type { SessionActivityResult } from "./sessions";

export interface RenderInput {
	type: "daily" | "weekly";
	period: string;
	gitActivity: GitActivityResult[];
	memoryChanges: MemoryChangeResult[];
	sessionActivities: SessionActivityResult[];
	summary: {
		totalCommits: number;
		totalSessions: number;
		totalEdits: number;
		peakHours: string;
		mainTopics: string[];
	};
}

const AI_SUMMARY_SECTION = `## AI 总结
> 本节内容将在报告生成后由 AI 补写。`;

/**
 * 渲染完整报告 Markdown
 */
export function renderReport(input: RenderInput): string {
	const { type, period, gitActivity, memoryChanges, sessionActivities, summary } = input;

	const title = type === "weekly" ? "周报" : "日报";
	const lines: string[] = [];

	// 标题
	lines.push(`# ${title}`);
	lines.push(`**${period}**`);
	lines.push("");

	// Git 活动
	lines.push("## Git 活动");
	if (gitActivity.length > 0) {
		lines.push("| 仓库 | 提交数 | 文件变更 | 增/删 |");
		lines.push("|------|--------|----------|-------|");
		for (const g of gitActivity) {
			lines.push(`| ${g.repo} | ${g.commits} | ${g.filesChanged} | +${g.additions}/-${g.deletions} |`);
		}
	}
	lines.push("");

	// 记忆变更
	lines.push("## 记忆变更");
	if (memoryChanges.length > 0) {
		for (const m of memoryChanges) {
			lines.push(`- [${m.action}] ${m.path}`);
		}
	} else {
		lines.push("无变更");
	}
	lines.push("");

	// 会话活动
	lines.push("## 会话活动");
	if (sessionActivities.length > 0) {
		for (const s of sessionActivities) {
			lines.push(`- **${s.sessionId}** (${s.duration})`);
			lines.push(`  - 工具调用: ${s.toolCount}, 读: ${s.readCount}, 写: ${s.writeCount}`);
			lines.push(`  - Tokens: ${s.totalTokens}`);
			if (s.keyFiles.length > 0) {
				lines.push(`  - 涉及文件: ${s.keyFiles.join(", ")}`);
			}
		}
	}
	lines.push("");

	// 摘要
	lines.push("## 摘要");
	lines.push(`- 总提交: ${summary.totalCommits}`);
	lines.push(`- 总会话: ${summary.totalSessions}`);
	lines.push(`- 总编辑: ${summary.totalEdits}`);
	if (summary.peakHours) {
		lines.push(`- 活跃时段: ${summary.peakHours}`);
	}
	if (summary.mainTopics.length > 0) {
		lines.push(`- 主要话题: ${summary.mainTopics.join(", ")}`);
	}
	lines.push("");

	// AI 总结骨架
	lines.push(AI_SUMMARY_SECTION);

	return lines.join("\n");
}
