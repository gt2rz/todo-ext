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
		endLine: 0,
		startCol: 0,
		file: vscode.Uri.file('/repo/src/example.ts'),
		...overrides,
	};
}

async function withTempFile<T>(ext: string, content: string, fn: (uri: vscode.Uri) => Promise<T>): Promise<T> {
	const tmpFile = path.join(os.tmpdir(), `todo-scanner-test-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
	await fs.promises.writeFile(tmpFile, content, 'utf8');
	try {
		return await fn(vscode.Uri.file(tmpFile));
	} finally {
		await fs.promises.unlink(tmpFile);
	}
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

		test('filtra por assignee, exacto e insensible a mayúsculas', () => {
			const match = makeMatch({ assignee: 'maria' });
			assert.ok(matchesFilter(match, { assignee: 'Maria' }));
			assert.ok(!matchesFilter(match, { assignee: 'juan' }));
		});

		test('filtra por priority', () => {
			const match = makeMatch({ priority: 'alta' });
			assert.ok(matchesFilter(match, { priority: 'alta' }));
			assert.ok(!matchesFilter(match, { priority: 'baja' }));
		});
	});

	suite('scanFile', () => {
		test('detecta los tags configurados en un archivo real', async () => {
			await withTempFile('ts', [
				'const x = 1;',
				'// TODO: revisar esto',
				'// FIXME: roto',
				'const y = 2;',
			].join('\n'), async uri => {
				const regex = buildTodoRegex([{ keyword: 'TODO' }, { keyword: 'FIXME' }]);
				const matches = await scanFile(uri, regex);

				assert.strictEqual(matches.length, 2);
				assert.strictEqual(matches[0].tag, 'TODO');
				assert.strictEqual(matches[0].line, 1);
				assert.strictEqual(matches[1].tag, 'FIXME');
				assert.strictEqual(matches[1].line, 2);
			});
		});

		test('devuelve [] si el archivo no existe', async () => {
			const regex = buildTodoRegex([{ keyword: 'TODO' }]);
			const matches = await scanFile(vscode.Uri.file('/no/existe/archivo.ts'), regex);
			assert.deepStrictEqual(matches, []);
		});

		test('parsea metadata completa: @asignado, prioridad, #issue', async () => {
			await withTempFile('ts', '// TODO(@maria, alta, #123): revisar esto\n', async uri => {
				const regex = buildTodoRegex([{ keyword: 'TODO' }]);
				const [match] = await scanFile(uri, regex);

				assert.strictEqual(match.assignee, 'maria');
				assert.strictEqual(match.priority, 'alta');
				assert.strictEqual(match.issueNumber, 123);
				assert.strictEqual(match.text.trim(), 'revisar esto');
			});
		});

		test('paréntesis sin metadata reconocida preserva el texto original', async () => {
			await withTempFile('ts', '// TODO(ver discusión): algo\n', async uri => {
				const regex = buildTodoRegex([{ keyword: 'TODO' }]);
				const [match] = await scanFile(uri, regex);

				assert.strictEqual(match.assignee, undefined);
				assert.strictEqual(match.priority, undefined);
				assert.strictEqual(match.issueNumber, undefined);
				assert.strictEqual(match.text.trim(), '(ver discusión): algo');
			});
		});

		test('multilínea: continúa mientras las líneas siguientes sean comentario', async () => {
			await withTempFile('ts', [
				'// TODO: primera línea',
				'// segunda línea',
				'// tercera línea',
				'const x = 1;',
			].join('\n'), async uri => {
				const regex = buildTodoRegex([{ keyword: 'TODO' }]);
				const [match] = await scanFile(uri, regex);

				assert.strictEqual(match.line, 0);
				assert.strictEqual(match.endLine, 2);
				assert.ok(match.text.includes('primera línea'));
				assert.ok(match.text.includes('segunda línea'));
				assert.ok(match.text.includes('tercera línea'));
			});
		});

		test('multilínea: corta en una línea vacía', async () => {
			await withTempFile('ts', [
				'// TODO: primera línea',
				'',
				'// esto ya no es continuación',
			].join('\n'), async uri => {
				const regex = buildTodoRegex([{ keyword: 'TODO' }]);
				const [match] = await scanFile(uri, regex);

				assert.strictEqual(match.endLine, 0);
			});
		});

		test('multilínea: corta al encontrar otro tag', async () => {
			await withTempFile('ts', [
				'// TODO: primera línea',
				'// FIXME: esto es otro fixture',
			].join('\n'), async uri => {
				const regex = buildTodoRegex([{ keyword: 'TODO' }, { keyword: 'FIXME' }]);
				const matches = await scanFile(uri, regex);

				assert.strictEqual(matches.length, 2);
				assert.strictEqual(matches[0].endLine, 0);
				assert.strictEqual(matches[1].line, 1);
			});
		});

		test('sin continuación para extensiones sin prefijo de comentario conocido (.md)', async () => {
			await withTempFile('md', [
				'TODO: primera línea',
				'segunda línea sin prefijo de comentario',
			].join('\n'), async uri => {
				const regex = buildTodoRegex([{ keyword: 'TODO' }]);
				const [match] = await scanFile(uri, regex);

				assert.strictEqual(match.endLine, 0);
				assert.ok(!match.text.includes('segunda línea'));
			});
		});

		test('normaliza CRLF: no deja \\r en el texto', async () => {
			await withTempFile('ts', '// TODO: revisar esto\r\n// sigue acá\r\nconst x = 1;\r\n', async uri => {
				const regex = buildTodoRegex([{ keyword: 'TODO' }]);
				const [match] = await scanFile(uri, regex);

				assert.ok(!match.text.includes('\r'));
			});
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
