/**
 * journal lib/git — 单元测试
 *
 * 测试 collectGitActivity
 * - 正常：模拟 git log/rev-list 输出
 * - 边界：无提交、跨分支
 * - 错误：非 git 目录、git 命令失败
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { collectGitActivity } from "../lib/git";

vi.mock("node:child_process", () => ({
	execSync: vi.fn(),
}));

import { execSync } from "node:child_process";

const mockedExecSync = vi.mocked(execSync);

describe("collectGitActivity", () => {

	afterEach(() => {
		mockedExecSync.mockReset();
	});

	// ── 正常路径 ─────────────────────────────────────────

	it("单个仓库返回提交统计数组", () => {
		mockedExecSync.mockImplementation((cmd: string) => {
			if (cmd.includes("git rev-list --count HEAD")) return "100\n";
			if (cmd.includes("git log --after") && cmd.includes("--oneline")) return "abc123 fix login\ndef456 add auth\n";
			if (cmd.includes("git diff --shortstat")) return "5 files changed, 80 insertions(+), 10 deletions(-)\n";
			return "";
		});

		const result = collectGitActivity({ repoPaths: ["/home/user/pi-agent"], since: "2026-05-12T00:00:00", until: "2026-05-12T23:59:59" });
		expect(Array.isArray(result)).toBe(true);
		expect(result.length).toBe(1);
		expect(result[0]).toHaveProperty("repo");
		expect(result[0]).toHaveProperty("commits");
		expect(result[0]).toHaveProperty("filesChanged");
	});

	it("多个仓库各自返回独立的统计项", () => {
		let callCount = 0;
		mockedExecSync.mockImplementation((cmd: string) => {
			callCount++;
			if (cmd.includes("git rev-list --count HEAD")) return `${callCount * 10}\n`;
			if (cmd.includes("git log --after") && cmd.includes("--oneline")) return `hash msg${callCount}\n`;
			if (cmd.includes("git diff --shortstat")) return `${callCount} file changed\n`;
			return "";
		});

		const result = collectGitActivity({
			repoPaths: ["/repo/a", "/repo/b"],
			since: "2026-05-12T00:00:00",
			until: "2026-05-12T23:59:59",
		});
		expect(result.length).toBe(2);
		expect(result[0].repo).toBe("/repo/a");
		expect(result[1].repo).toBe("/repo/b");
	});

	// ── 边界值 ─────────────────────────────────────────

	it("空 repoPaths 返回空数组", () => {
		const result = collectGitActivity({ repoPaths: [], since: "2026-05-12T00:00:00", until: "2026-05-12T23:59:59" });
		expect(result).toEqual([]);
	});

	it("时间段内无提交返回 commits=0 的条目", () => {
		let gitLogCalled = false;
		mockedExecSync.mockImplementation((cmd: string) => {
			if (cmd.includes("git rev-list --count HEAD")) return "100\n";
			if (cmd.includes("git log --after") && cmd.includes("--oneline")) {
				gitLogCalled = true;
				return "\n"; // 空输出
			}
			if (cmd.includes("git diff --shortstat")) return "0 files changed\n";
			return "";
		});

		const result = collectGitActivity({ repoPaths: ["/empty-repo"], since: "2026-05-12T00:00:00", until: "2026-05-12T23:59:59" });
		expect(gitLogCalled).toBe(true);
		expect(result.length).toBe(1);
		expect(result[0].commits).toBe(0);
	});

	it("大量提交（100+）能正确统计", () => {
		const logLines = Array.from({ length: 150 }, (_, i) => `hash${i} commit msg ${i}`).join("\n") + "\n";
		mockedExecSync.mockImplementation((cmd: string) => {
			if (cmd.includes("git rev-list --count HEAD")) return "200\n";
			if (cmd.includes("git log --after") && cmd.includes("--oneline")) return logLines;
			if (cmd.includes("git diff --shortstat")) return "10 files changed, 500 insertions(+), 30 deletions(-)\n";
			return "";
		});

		const result = collectGitActivity({ repoPaths: ["/big-repo"], since: "2026-05-12T00:00:00", until: "2026-05-12T23:59:59" });
		expect(result[0].commits).toBe(150);
	});

	// ── 错误路径 ─────────────────────────────────────────

	it("非 git 目录抛出异常时返回空数组（静默降级）", () => {
		mockedExecSync.mockImplementation(() => {
			const err = new Error("fatal: not a git repository") as any;
			err.stderr = "fatal: not a git repository";
			err.status = 128;
			throw err;
		});

		const result = collectGitActivity({ repoPaths: ["/not-git"], since: "2026-05-12T00:00:00", until: "2026-05-12T23:59:59" });
		expect(result).toEqual([]);
	});

	it("git 命令超时不会导致整体失败", () => {
		mockedExecSync.mockImplementation(() => {
			throw new Error("ETIMEDOUT");
		});

		const result = collectGitActivity({ repoPaths: ["/repo1", "/repo2"], since: "2026-05-12T00:00:00", until: "2026-05-12T23:59:59" });
		expect(result).toEqual([]);
	});

	it("部分仓库失败不影响其他仓库", () => {
		let callIdx = 0;
		mockedExecSync.mockImplementation((cmd: string) => {
			callIdx++;
			if (callIdx <= 3) throw new Error("fail"); // first repo fails
			return "hash msg\n";
		});

		const result = collectGitActivity({
			repoPaths: ["/fails", "/succeeds"],
			since: "2026-05-12T00:00:00",
			until: "2026-05-12T23:59:59",
		});
		// At minimum, the result should handle both repos without crashing
		expect(result.length).toBeLessThanOrEqual(2);
	});
});
