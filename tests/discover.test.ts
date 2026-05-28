/**
 * discoverGitRepos — 内部函数测试
 * 扫描 ~/.pi/agent/git/ 下的 git 仓库
 *
 * 本文件 mock node:fs/node:os，与其他测试文件隔离。
 * discoverGitRepos 在 index.ts 导出供测试。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// mock node:os — homedir 返回可控路径
vi.mock("node:os", () => ({ homedir: () => "/home/testuser" }));

// mock node:fs — 控制目录结构和文件元数据
const mockFs = vi.hoisted(() => ({
	readdirSync: vi.fn(),
	statSync: vi.fn(),
	readFileSync: vi.fn(),
}));
vi.mock("node:fs", () => mockFs);

// mock lib 模块 — 避免真实 git/fs 操作
vi.mock("../lib/git", () => ({ collectGitActivity: vi.fn() }));
vi.mock("../lib/memory", () => ({ collectMemoryChanges: vi.fn() }));
vi.mock("../lib/sessions", () => ({ collectSessionActivities: vi.fn() }));
vi.mock("../lib/render", () => ({ renderReport: vi.fn() }));

import { discoverGitRepos } from "../index";

describe("discoverGitRepos", () => {
	beforeEach(() => vi.clearAllMocks());

	it("正常路径：发现 git 仓库", () => {
		mockFs.readdirSync
			.mockReturnValueOnce(["github.com"])
			.mockReturnValueOnce(["catlain"])
			.mockReturnValueOnce(["pi-shared-utils", "pi-journal", "non-git-dir"]);
		mockFs.statSync
			// check host dir
			.mockReturnValueOnce({ isDirectory: () => true })
			// check owner dir
			.mockReturnValueOnce({ isDirectory: () => true })
			// pi-shared-utils
			.mockReturnValueOnce({ isDirectory: () => true })
			.mockReturnValueOnce({ isDirectory: () => true })
			// pi-journal
			.mockReturnValueOnce({ isDirectory: () => true })
			.mockReturnValueOnce({ isDirectory: () => true })
			// non-git-dir — try catches the inner statSync for .git
			.mockReturnValueOnce({ isDirectory: () => true })
			.mockImplementationOnce(() => { throw new Error("ENOENT"); });

		const repos = discoverGitRepos();
		expect(repos).toHaveLength(2);
		expect(repos[0]).toContain("pi-shared-utils");
		expect(repos[1]).toContain("pi-journal");
	});

	it("gitBase 不存在时返回空数组", () => {
		mockFs.readdirSync.mockImplementationOnce(() => { throw new Error("ENOENT"); });
		expect(discoverGitRepos()).toEqual([]);
	});

	it("跳过非目录的 host/owner 条目", () => {
		mockFs.readdirSync
			.mockReturnValueOnce(["file.txt", "github.com"])
			.mockReturnValueOnce(["catlain"])
			.mockReturnValueOnce(["repo1"]);
		mockFs.statSync
			.mockReturnValueOnce({ isDirectory: () => false })  // file.txt → skip
			.mockReturnValueOnce({ isDirectory: () => true })   // github.com → proceed
			.mockReturnValueOnce({ isDirectory: () => true })   // catlain → proceed
			.mockReturnValueOnce({ isDirectory: () => true })   // repo1 → proceed
			.mockReturnValueOnce({ isDirectory: () => true });  // repo1/.git → is directory

		const repos = discoverGitRepos();
		expect(repos).toHaveLength(1);
		expect(repos[0]).toContain("repo1");
	});

	it("非目录的 project 条目被正确跳过", () => {
		mockFs.readdirSync
			.mockReturnValueOnce(["github.com"])
			.mockReturnValueOnce(["catlain"])
			.mockReturnValueOnce(["a-file.ts"]);
		mockFs.statSync
			.mockReturnValueOnce({ isDirectory: () => true })
			.mockReturnValueOnce({ isDirectory: () => true })
			.mockReturnValueOnce({ isDirectory: () => false });  // a-file.ts → skip

		const repos = discoverGitRepos();
		expect(repos).toEqual([]);
	});

	it("没有 .git 子目录的条目被跳过", () => {
		mockFs.readdirSync
			.mockReturnValueOnce(["github.com"])
			.mockReturnValueOnce(["catlain"])
			.mockReturnValueOnce(["no-git"]);
		mockFs.statSync
			.mockReturnValueOnce({ isDirectory: () => true })
			.mockReturnValueOnce({ isDirectory: () => true })
			.mockReturnValueOnce({ isDirectory: () => true })   // no-git dir
			.mockImplementationOnce(() => { throw new Error("ENOENT"); });  // no-git/.git → throw

		const repos = discoverGitRepos();
		expect(repos).toEqual([]);
	});

	it("host 下有多个 owner 和多个项目", () => {
		mockFs.readdirSync
			.mockReturnValueOnce(["github.com", "gitlab.com"])
			.mockReturnValueOnce(["catlain"])
			.mockReturnValueOnce(["pi-shared-utils", "pi-context"])
			.mockReturnValueOnce(["user1"])
			.mockReturnValueOnce(["proj-a"]);

		const isDirCalls = [
			true,  // github.com
			true,  // catlain
			true,  // pi-shared-utils
			true,  // pi-shared-utils/.git
			true,  // pi-context
			true,  // pi-context/.git
			true,  // gitlab.com
			true,  // user1
			true,  // proj-a
			true,  // proj-a/.git
		];
		let idx = 0;
		mockFs.statSync.mockImplementation(() => ({
			isDirectory: () => isDirCalls[idx++],
		}));

		const repos = discoverGitRepos();
		expect(repos).toHaveLength(3);
	});
});
