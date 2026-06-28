import { defineConfig } from '@vscode/test-cli';

export default defineConfig([
	{
		label: 'unit',
		files: 'out/test/*.test.js',
	},
	{
		label: 'integration',
		files: 'out/test/integration/**/*.test.js',
		workspaceFolder: 'src/test/fixtures/sample-workspace',
	},
]);
