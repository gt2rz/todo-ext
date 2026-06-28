import * as vscode from 'vscode';
import * as path from 'path';
import { TodoProvider, FilterState, FileItem, TodoItem } from './providers/todo.provider';
import { DecorationProvider } from './providers/decoration.provider';
import { getTodoFinderConfig } from './core/config';
import { FixtureStatus, STATUS_LABELS } from './core/fixture-status';
import { getRepositoryRemoteUrl } from './core/git-remote';
import { buildNewIssueUrl } from './core/issue-url';

const FILTER_STATE_KEY = 'todoFinder.filterState';
const FIXTURE_STATUSES_KEY = 'todoFinder.fixtureStatuses';

interface PersistedFilterState {
	tags?: string[];
	text?: string;
	pathPattern?: string;
	status?: FixtureStatus;
}

function restoreFilter(context: vscode.ExtensionContext): FilterState {
	const raw = context.workspaceState.get<PersistedFilterState>(FILTER_STATE_KEY);
	if (!raw) {
		return {};
	}
	return {
		tags: raw.tags && raw.tags.length ? new Set(raw.tags) : undefined,
		text: raw.text,
		pathPattern: raw.pathPattern,
		status: raw.status,
	};
}

export function activate(context: vscode.ExtensionContext) {

	const todoProvider = new TodoProvider();
	const decorationProvider = new DecorationProvider();

	// Restaura el filtro y los estados persistidos antes de crear la vista, para que la primera carga ya los use
	todoProvider.setFilter(restoreFilter(context));
	todoProvider.loadStatuses(context.workspaceState.get<[string, FixtureStatus][]>(FIXTURE_STATUSES_KEY, []));

	const treeView = vscode.window.createTreeView('todoTree', { treeDataProvider: todoProvider });
	todoProvider.setTreeView(treeView);

	// Persiste cada cambio de filtro/estado (después de restaurar, para no reescribir el mismo valor leído)
	context.subscriptions.push(
		treeView,
		todoProvider.onDidChangeFilter(filter => {
			context.workspaceState.update(FILTER_STATE_KEY, {
				tags: filter.tags ? Array.from(filter.tags) : undefined,
				text: filter.text,
				pathPattern: filter.pathPattern,
				status: filter.status,
			});
		}),
		todoProvider.onDidChangeStatuses(() => {
			context.workspaceState.update(FIXTURE_STATUSES_KEY, todoProvider.getStatusEntries());
		})
	);

	function refreshAll() {
		const config = getTodoFinderConfig();
		todoProvider.refresh();
		decorationProvider.updateDecorations(vscode.window.activeTextEditor, config);
	}

	async function showFilterWizard() {
		const config = getTodoFinderConfig();
		const current = todoProvider.getFilter();

		const tagItems = config.tags.map(tag => ({
			label: `${tag.icon ?? ''} ${tag.keyword}`.trim(),
			keyword: tag.keyword,
			picked: !current.tags || current.tags.has(tag.keyword)
		}));
		const pickedTags = await vscode.window.showQuickPick(tagItems, {
			canPickMany: true,
			title: 'Filtrar por etiqueta (1/3) — Esc para no modificar',
			placeHolder: 'Selecciona las etiquetas a mostrar (ninguna o todas = sin filtro)'
		});
		const tags = pickedTags === undefined
			? current.tags
			: (pickedTags.length === 0 || pickedTags.length === tagItems.length ? undefined : new Set(pickedTags.map(item => item.keyword)));

		const text = await vscode.window.showInputBox({
			title: 'Filtrar por texto (2/3) — Esc para no modificar',
			placeHolder: 'Texto a buscar dentro del fixture (vacío = sin filtro)',
			value: current.text ?? ''
		});
		const textFilter = text === undefined
			? current.text
			: (text.trim() ? text.trim().toLowerCase() : undefined);

		const pathPattern = await vscode.window.showInputBox({
			title: 'Filtrar por archivo/carpeta (3/3) — Esc para no modificar',
			placeHolder: 'Subcadena de la ruta relativa a buscar (vacío = sin filtro)',
			value: current.pathPattern ?? ''
		});
		const pathFilter = pathPattern === undefined
			? current.pathPattern
			: (pathPattern.trim() ? pathPattern.trim().toLowerCase() : undefined);

		const statusItems: { label: string; value: FixtureStatus | undefined }[] = [
			{ label: 'Cualquier estado (sin filtro)', value: undefined },
			...Object.entries(STATUS_LABELS).map(([value, label]) => ({ label, value: value as FixtureStatus })),
		];
		const pickedStatus = await vscode.window.showQuickPick(statusItems, {
			title: 'Filtrar por estado (4/4) — Esc para no modificar',
			placeHolder: 'Issue / Resuelto / Wontfix / En progreso'
		});
		const status = pickedStatus === undefined ? current.status : pickedStatus.value;

		todoProvider.setFilter({ tags, text: textFilter, pathPattern: pathFilter, status });
	}

	async function createIssueFromFixture(item: TodoItem) {
		const remoteUrl = await getRepositoryRemoteUrl(item.match.file);
		const title = `${item.match.tag}: ${item.match.text.trim()}`;
		if (!remoteUrl) {
			vscode.window.showWarningMessage('No se encontró un remote de git para este archivo.');
			return;
		}

		const rel = vscode.workspace.asRelativePath(item.match.file, true);
		const body = `Generado desde TODO Finder\n\nArchivo: ${rel}:${item.range.start.line + 1}`;
		const result = buildNewIssueUrl(remoteUrl, title, body);
		if ('error' in result) {
			vscode.window.showWarningMessage(`${result.error} Título: "${title}"`);
			return;
		}

		vscode.env.openExternal(vscode.Uri.parse(result.url));
	}

	function relativeDirOf(fileUri: vscode.Uri): string {
		const rel = vscode.workspace.asRelativePath(fileUri, true);
		const dir = path.dirname(rel);
		return dir === '.' ? '' : dir;
	}

	decorationProvider.rebuildDecorationTypes(getTodoFinderConfig());
	decorationProvider.updateDecorations(vscode.window.activeTextEditor, getTodoFinderConfig());

	// Vigila cambios en disco que no pasan por onDidSaveTextDocument (git pull/checkout, otros procesos)
	let fileWatcher = vscode.workspace.createFileSystemWatcher(getTodoFinderConfig().include);
	function rebuildFileWatcher() {
		fileWatcher.dispose();
		fileWatcher = vscode.workspace.createFileSystemWatcher(getTodoFinderConfig().include);
		fileWatcher.onDidCreate(() => refreshAll());
		fileWatcher.onDidChange(() => refreshAll());
		fileWatcher.onDidDelete(() => refreshAll());
	}
	rebuildFileWatcher();

	const refreshCommand = vscode.commands.registerCommand('todoFinder.refresh', refreshAll);
	const filterCommand = vscode.commands.registerCommand('todoFinder.filter', showFilterWizard);
	const clearFilterCommand = vscode.commands.registerCommand('todoFinder.clearFilter', () => todoProvider.clearFilter());
	const filterByTagCommand = vscode.commands.registerCommand('todoFinder.filterByTag', (item: TodoItem) => {
		todoProvider.filterByTag(item.match.tag);
	});
	const filterByFolderCommand = vscode.commands.registerCommand('todoFinder.filterByFolder', (item: FileItem) => {
		todoProvider.filterByFolder(relativeDirOf(item.fileUri));
	});
	const markIssueCommand = vscode.commands.registerCommand('todoFinder.markIssue', (item: TodoItem) => {
		todoProvider.setStatus(item.match, 'issue');
	});
	const markDoneCommand = vscode.commands.registerCommand('todoFinder.markDone', (item: TodoItem) => {
		todoProvider.setStatus(item.match, 'done');
	});
	const markWontfixCommand = vscode.commands.registerCommand('todoFinder.markWontfix', (item: TodoItem) => {
		todoProvider.setStatus(item.match, 'wontfix');
	});
	const markInProgressCommand = vscode.commands.registerCommand('todoFinder.markInProgress', (item: TodoItem) => {
		todoProvider.setStatus(item.match, 'in-progress');
	});
	const clearStatusCommand = vscode.commands.registerCommand('todoFinder.clearStatus', (item: TodoItem) => {
		todoProvider.setStatus(item.match, undefined);
	});
	const createIssueCommand = vscode.commands.registerCommand('todoFinder.createIssue', createIssueFromFixture);

	context.subscriptions.push(
		refreshCommand,
		filterCommand,
		clearFilterCommand,
		filterByTagCommand,
		filterByFolderCommand,
		markIssueCommand,
		markDoneCommand,
		markWontfixCommand,
		markInProgressCommand,
		clearStatusCommand,
		createIssueCommand,
		decorationProvider,
		{ dispose: () => fileWatcher.dispose() },
		// Refrescar automáticamente cuando se guarda un archivo
		vscode.workspace.onDidSaveTextDocument(() => refreshAll()),
		// Decorar el editor recién enfocado sin esperar a un guardado
		vscode.window.onDidChangeActiveTextEditor(editor => {
			decorationProvider.updateDecorations(editor, getTodoFinderConfig());
		}),
		// Reconstruir decoraciones, watcher y refrescar todo cuando cambian los ajustes de todoFinder
		vscode.workspace.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration('todoFinder')) {
				decorationProvider.rebuildDecorationTypes(getTodoFinderConfig());
				rebuildFileWatcher();
				refreshAll();
			}
		})
	);
}

// This method is called when your extension is deactivated
export function deactivate() {}
