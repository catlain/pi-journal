import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["tests/**/*.test.ts"],
		environment: "node",
		testTimeout: 10000,
		coverage: {
			provider: "v8" as const,
			reporter: ["text", "html"],
			exclude: [
				"lib/types.ts",
				"vitest.config.ts",
				"tests/setup.ts",
				"**/node_modules/**",
				"**/*.test.ts",
			],
		},
	},
});
