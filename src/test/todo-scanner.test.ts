import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import {
	buildTodoRegex,
	groupMatchesByFile,
	matchesFilter,
	scanFile,
	scanWorkspace,
	TodoMatch,
} from '../core/todo-scanner';

function makeMatch(overrides: Partial<TodoMatch>): TodoMatch {
	return {
		tag: 'TODO',
		text: ' algo pendiente',
		line: 0,
		startCol: 0,
		file: vscode.Uri.file('/repo/src/example.ts'),
		...overrides,
	};
}

suite('todo-scanner', () => {

	suite('buildTodoRegex', () => {
		test('matchea tags conocidos sin importar mayúsculas/minúsculas', () => {
			const regex = buildTodoRegex([{ keyword: 'TODO' }, { keyword: 'FIXME' }]);
			assert.ok(regex.test('// todo: revisar esto'));
			assert.ok(regex.test('// FIXME: roto'));
		});

		test('no matchea palabras que no son tags configurados', () => {
			const regex = buildTodoRegex([{ keyword: 'TODO' }]);
			assert.ok(!regex.test('// NOTE: esto no debería matchear'));
		});
	});

	suite('groupMatchesByFile', () => {
		test('agrupa coincidencias del mismo archivo', () => {
			const fileA = vscode.Uri.file('/repo/src/a.ts');
			const matches = [
				makeMatch({ file: fileA, line: 0 }),
				makeMatch({ file: fileA, line: 5 }),
			];

			const groups = groupMatchesByFile(matches);

			assert.strictEqual(groups.length, 1);
			assert.strictEqual(groups[0].matches.length, 2);
		});

		test('ordena los grupos alfabéticamente por fsPath', () => {
			const groups = groupMatchesByFile([
				makeMatch({ file: vscode.Uri.file('/repo/src/z.ts') }),
				makeMatch({ file: vscode.Uri.file('/repo/src/a.ts') }),
			]);

			assert.deepStrictEqual(
				groups.map(group => group.uri.fsPath),
				['/repo/src/a.ts', '/repo/src/z.ts']
			);
		});
	});

	suite('matchesFilter', () => {
		test('filtra por tag', () => {
			const match = makeMatch({ tag: 'FIXME' });
			assert.ok(matchesFilter(match, { tags: new Set(['FIXME']) }));
			assert.ok(!matchesFilter(match, { tags: new Set(['TODO']) }));
		});

		test('filtra por texto, case-insensitive', () => {
			const match = makeMatch({ text: ' Revisar Login' });
			assert.ok(matchesFilter(match, { text: 'login' }));
			assert.ok(!matchesFilter(match, { text: 'logout' }));
		});

		test('filtra por pathPattern usando el path absoluto cuando no hay workspace abierto', () => {
			const match = makeMatch({ file: vscode.Uri.file('/repo/src/providers/todo.provider.ts') });
			assert.ok(matchesFilter(match, { pathPattern: 'providers' }));
			assert.ok(!matchesFilter(match, { pathPattern: 'core' }));
		});

		test('combina criterios con AND', () => {
			const match = makeMatch({ tag: 'TODO', text: ' revisar login' });
			assert.ok(matchesFilter(match, { tags: new Set(['TODO']), text: 'login' }));
			assert.ok(!matchesFilter(match, { tags: new Set(['FIXME']), text: 'login' }));
		});

		test('sin filtro activo, todo matchea', () => {
			assert.ok(matchesFilter(makeMatch({}), {}));
		});
	});

	suite('scanFile', () => {
		test('detecta los tags configurados en un archivo real', async () => {
			const tmpFile = path.join(os.tmpdir(), `todo-scanner-test-${Date.now()}.ts`);
			await fs.promises.writeFile(tmpFile, [
				'const x = 1;',
				'// TODO: revisar esto',
				'// FIXME: roto',
				'const y = 2;',
			].join('\n'), 'utf8');

			try {
				const regex = buildTodoRegex([{ keyword: 'TODO' }, { keyword: 'FIXME' }]);
				const matches = await scanFile(vscode.Uri.file(tmpFile), regex);

				assert.strictEqual(matches.length, 2);
				assert.strictEqual(matches[0].tag, 'TODO');
				assert.strictEqual(matches[0].line, 1);
				assert.strictEqual(matches[1].tag, 'FIXME');
				assert.strictEqual(matches[1].line, 2);
			} finally {
				await fs.promises.unlink(tmpFile);
			}
		});

		test('devuelve [] si el archivo no existe', async () => {
			const regex = buildTodoRegex([{ keyword: 'TODO' }]);
			const matches = await scanFile(vscode.Uri.file('/no/existe/archivo.ts'), regex);
			assert.deepStrictEqual(matches, []);
		});
	});

	suite('scanWorkspace', () => {
		test('devuelve [] cuando no hay carpeta de workspace abierta', async () => {
			if (vscode.workspace.workspaceFolders) {
				return;
			}
			const regex = buildTodoRegex([{ keyword: 'TODO' }]);
			const matches = await scanWorkspace(regex, '**/*.ts', '**/node_modules/**');
			assert.deepStrictEqual(matches, []);
		});
	});
});
