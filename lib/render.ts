/**
 * journal 扩展 — Markdown 报告渲染
 *
 * 纯函数：将采集数据渲染为日报/周报 Markdown
 * 输出结构化语料 + AI 写作引导提示
 */

import type { GitActivityResult } from "./git";
import type { MemoryChangeResult } from "./memory";
import type { SessionActivityResult, SessionSemanticData } from "./sessions";

export interface RenderInput {
	type: "daily" | "weekly";
	period: string;
	gitActivity: GitActivityResult[];
	gitCommitMessages: string[][];
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

/** AI 写作引导提示 — 告诉 AI 如何基于语料写日记 */
const AI_WRITING_GUIDE = `## ✍️ 日记内容（请基于以下语料，用自然语言补写）

> 以下是通过工具自动采集的结构化语料。请通读所有内容后，用自己的理解写一篇完整的日记。
> 
> **日记应包含以下 section（按需，没有内容的可以跳过）：**
> 
> ### 功能增减
> - 今天新增了什么功能？实现了什么？
> - 删除/废弃了什么？为什么？
> 
> ### 决策变更
> - 做了什么技术决策？为什么这样决定？
> - 方案是否有调整？从 A 改为 B 的原因是什么？
> - 重要的架构/设计决策
> 
> ### 踩坑记录
> - 遇到了什么问题？根因是什么？
> - 是否有重复踩坑（之前也遇到过类似问题）？
> - 有什么值得记录的经验教训？
> 
> **写作要求：**
> 1. 用简体中文，自然流畅，不要列数据表格
> 2. 每个功能/决策/踩坑要有上下文（在哪个项目、为什么做）
> 3. 踩坑记录要注明根因和解决方案，方便以后查阅
> 4. 不需要面面俱到，只记录有价值的、值得记忆的内容`;

/**
 * 渲染语义语料 section
 */
function renderSemanticCorpus(sessionActivities: SessionActivityResult[]): string[] {
	const lines: string[] = [];

	for (const s of sessionActivities) {
		if (!s.semantic) continue;

		lines.push(`### 📋 会话: ${s.sessionId}`);
		lines.push("");

		if (s.semantic.userIntents.length > 0) {
			lines.push("**用户意图：**");
			for (const intent of s.semantic.userIntents) {
				lines.push(`- ${intent}`);
			}
			lines.push("");
		}

		if (s.semantic.keyDecisions.length > 0) {
			lines.push("**关键决策：**");
			for (const d of s.semantic.keyDecisions) {
				lines.push(`- ${d}`);
			}
			lines.push("");
		}

		if (s.semantic.summary) {
			lines.push("**会话摘要：**");
			lines.push(s.semantic.summary);
			lines.push("");
		}

		if (s.semantic.digest) {
			lines.push("<details>");
			lines.push("<summary>对话序列（点击展开）</summary>");
			lines.push("");
			lines.push("```");
			lines.push(s.semantic.digest);
			lines.push("```");
			lines.push("");
			lines.push("</details>");
			lines.push("");
		}
	}

	return lines;
}

/**
 * 渲染完整报告 Markdown
 */
export function renderReport(input: RenderInput): string {
	const { type, period, gitActivity, gitCommitMessages, memoryChanges, sessionActivities, summary } = input;

	const title = type === "weekly" ? "周报" : "日报";
	const lines: string[] = [];

	// 标题
	lines.push(`# ${title}`);
	lines.push(`**${period}**`);
	lines.push("");

	// ── 语料 Section 1: Git 提交记录 ──
	lines.push("## 📦 Git 提交记录");
	if (gitActivity.length > 0) {
		for (let i = 0; i < gitActivity.length; i++) {
			const g = gitActivity[i];
			const msgs = gitCommitMessages[i] ?? [];
			lines.push(`### ${g.repo} (${g.commits} commits, +${g.additions}/-${g.deletions})`);
			if (msgs.length > 0) {
				for (const msg of msgs) {
					lines.push(`- ${msg}`);
				}
			} else {
				lines.push("_无提交信息_");
			}
			lines.push("");
		}
	} else {
		lines.push("无 Git 活动");
		lines.push("");
	}

	// ── 语料 Section 2: 会话语料 ──
	const semanticLines = renderSemanticCorpus(sessionActivities);
	if (semanticLines.length > 0) {
		lines.push("## 📝 会话语料");
		lines.push("");
		lines.push(...semanticLines);
	}

	// ── 统计数据（折叠，供参考） ──
	lines.push("<details>");
	lines.push("<summary>📊 统计数据（点击展开）</summary>");
	lines.push("");

	// 记忆变更
	lines.push("### 记忆变更");
	if (memoryChanges.length > 0) {
		for (const m of memoryChanges) {
			lines.push(`- [${m.action}] ${m.path}`);
		}
	} else {
		lines.push("无变更");
	}
	lines.push("");

	// 会话统计
	lines.push("### 会话统计");
	for (const s of sessionActivities) {
		lines.push(`- **${s.sessionId}** (${s.duration}): 工具 ${s.toolCount}, 读 ${s.readCount}, 写 ${s.writeCount}, tokens ${s.totalTokens}`);
		if (s.keyFiles.length > 0) {
			lines.push(`  - 文件: ${s.keyFiles.join(", ")}`);
		}
	}
	lines.push("");

	// 摘要
	lines.push("### 汇总");
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
	lines.push("</details>");
	lines.push("");

	// ── AI 写作引导 ──
	lines.push(AI_WRITING_GUIDE);

	return lines.join("\n");
}
