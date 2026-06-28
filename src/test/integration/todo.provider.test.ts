import * as assert from 'assert';
import * as vscode from 'vscode';
import { FileItem, TodoItem, TodoProvider } from '../../providers/todo.provider';
import { TodoMatch } from '../../core/todo-scanner';

async function getActivatedTodoProvider(): Promise<{ todoProvider: TodoProvider; treeView: vscode.TreeView<unknown> }> {
	const ext = vscode.extensions.all.find(e => e.packageJSON?.name === 'todo-ext');
	assert.ok(ext, 'No se encontró la extensión todo-ext activa en el test host');
	const exports = ext!.isActive ? ext!.exports : await ext!.activate();
	return exports;
}

function fakeMatch(overrides: Partial<TodoMatch>): TodoMatch {
	return {
		tag: 'TODO',
		text: ' fixture inexistente',
		line: 0,
		endLine: 0,
		startCol: 0,
		file: vscode.Uri.file('/no/existe/en/el/workspace.ts'),
		...overrides,
	};
}

suite('todo.provider (integración, con workspace)', () => {
	let todoProvider: TodoProvider;
	let treeView: vscode.TreeView<unknown>;

	suiteSetup(async () => {
		const activated = await getActivatedTodoProvider();
		todoProvider = activated.todoProvider;
		treeView = activated.treeView;
	});

	teardown(() => {
		todoProvider.clearFilter();
	});

	test('hay un workspace abierto (fixture sample-workspace)', () => {
		assert.ok(vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0);
	});

	suite('estado de filtro', () => {
		test('setFilter/getFilter/clearFilter', () => {
			todoProvider.setFilter({ text: 'algo' });
			assert.strictEqual(todoProvider.getFilter().text, 'algo');
			todoProvider.clearFilter();
			assert.deepStrictEqual(todoProvider.getFilter(), {});
		});

		test('hasActiveFilter cubre las 6 dimensiones', () => {
			assert.strictEqual(todoProvider.hasActiveFilter(), false);
			todoProvider.setFilter({ tags: new Set(['TODO']) });
			assert.strictEqual(todoProvider.hasActiveFilter(), true);
			todoProvider.setFilter({ assignee: 'user' });
			assert.strictEqual(todoProvider.hasActiveFilter(), true);
			todoProvider.setFilter({ priority: 'alta' });
			assert.strictEqual(todoProvider.hasActiveFilter(), true);
			todoProvider.setFilter({ status: 'done' });
			assert.strictEqual(todoProvider.hasActiveFilter(), true);
		});

		test('filterByTag y filterByFolder', () => {
			todoProvider.filterByTag('FIXME');
			assert.deepStrictEqual(todoProvider.getFilter().tags, new Set(['FIXME']));
			todoProvider.filterByFolder('src');
			assert.strictEqual(todoProvider.getFilter().pathPattern, 'src');
		});

		test('mensaje de "sin resultados" cuando el filtro no matchea nada', async () => {
			todoProvider.setFilter({ tags: new Set(['NO_EXISTE_ESTE_TAG']) });
			await todoProvider.getChildren();
			assert.ok(treeView.message);
			todoProvider.clearFilter();
			await todoProvider.getChildren();
			assert.strictEqual(treeView.message, undefined);
		});
	});

	suite('árbol archivo → fixture', () => {
		test('getChildren() raíz devuelve un FileItem por archivo con fixtures', async () => {
			const fileItems = await todoProvider.getChildren() as FileItem[];
			assert.ok(fileItems.length >= 2);
			const names = fileItems.map(item => item.fileUri.fsPath.split('/').pop());
			assert.ok(names.includes('a.ts'));
			assert.ok(names.includes('b.py'));
		});

		test('getChildren(fileItem) devuelve los fixtures con su metadata', async () => {
			const fileItems = await todoProvider.getChildren() as FileItem[];
			const aFile = fileItems.find(item => item.fileUri.fsPath.endsWith('a.ts'));
			assert.ok(aFile);

			const todoItems = await todoProvider.getChildren(aFile) as TodoItem[];
			assert.strictEqual(todoItems.length, 1);
			assert.strictEqual(todoItems[0].match.assignee, 'user');
			assert.strictEqual(todoItems[0].match.priority, 'alta');
			assert.strictEqual(todoItems[0].match.issueNumber, 1);
		});
	});

	suite('estados locales', () => {
		test('setStatus/getStatus/loadStatuses/getStatusEntries', () => {
			const match = fakeMatch({});
			assert.strictEqual(todoProvider.getStatus(match), undefined);
			todoProvider.setStatus(match, 'done');
			assert.strictEqual(todoProvider.getStatus(match), 'done');

			const entries = todoProvider.getStatusEntries();
			assert.ok(entries.length > 0);

			todoProvider.loadStatuses([]);
			assert.strictEqual(todoProvider.getStatus(match), undefined);
		});

		test('pruneStatuses (vía refresh) elimina estados de fixtures que ya no existen', async () => {
			const ghost = fakeMatch({ text: ' este fixture no existe en el workspace' });
			todoProvider.setStatus(ghost, 'issue');
			assert.strictEqual(todoProvider.getStatus(ghost), 'issue');

			todoProvider.refresh();
			await todoProvider.getChildren();

			assert.strictEqual(todoProvider.getStatus(ghost), undefined);
		});

		test('getPendingCount baja al marcar un fixture real como done', async () => {
			const fileItems = await todoProvider.getChildren() as FileItem[];
			const aFile = fileItems.find(item => item.fileUri.fsPath.endsWith('a.ts'))!;
			const [todoItem] = await todoProvider.getChildren(aFile) as TodoItem[];

			const before = todoProvider.getPendingCount();
			todoProvider.setStatus(todoItem.match, 'done');
			const after = todoProvider.getPendingCount();

			assert.strictEqual(after, before - 1);

			todoProvider.setStatus(todoItem.match, undefined);
		});
	});
});
