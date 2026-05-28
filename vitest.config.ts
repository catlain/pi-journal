import { createConfig } from "../vitest.config.base";

export default createConfig({
	test: {
		coverage: {
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
