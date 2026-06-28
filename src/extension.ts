import * as vscode from 'vscode';
import * as path from 'path';
import { TodoProvider, FilterState, FileItem, TodoItem } from './providers/todo.provider';
import { DecorationProvider } from './providers/decoration.provider';
import { FixtureCodeLensProvider } from './providers/codelens.provider';
import { getTodoFinderConfig } from './core/config';
import { FixtureStatus, STATUS_LABELS } from './core/fixture-status';
import { getRepositoryRemoteUrl } from './core/git-remote';
import { buildNewIssueUrl, buildExistingIssueUrl } from './core/issue-url';
import { TodoMatch, Priority } from './core/todo-scanner';

const FILTER_STATE_KEY = 'todoFinder.filterState';
const FIXTURE_STATUSES_KEY = 'todoFinder.fixtureStatuses';

type FixtureRef = { match: TodoMatch; range: vscode.Range };

interface PersistedFilterState {
	tags?: string[];
	text?: string;
	pathPattern?: string;
	status?: FixtureStatus;
	assignee?: string;
	priority?: Priority;
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
		assignee: raw.assignee,
		priority: raw.priority,
	};
}

export function activate(context: vscode.ExtensionContext) {

	const todoProvider = new TodoProvider();
	const decorationProvider = new DecorationProvider();
	const codeLensProvider = new FixtureCodeLensProvider();

	// Restaura el filtro y los estados persistidos antes de crear la vista, para que la primera carga ya los use
	todoProvider.setFilter(restoreFilter(context));
	todoProvider.loadStatuses(context.workspaceState.get<[string, FixtureStatus][]>(FIXTURE_STATUSES_KEY, []));

	const treeView = vscode.window.createTreeView('todoTree', { treeDataProvider: todoProvider });
	todoProvider.setTreeView(treeView);

	const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	statusBarItem.command = 'todoTree.focus';
	function updateStatusBar(count: number) {
		if (count > 0) {
			statusBarItem.text = `$(checklist) ${count}`;
			statusBarItem.tooltip = `${count} fixtures pendientes — click para abrir`;
			statusBarItem.show();
		} else {
			statusBarItem.hide();
		}
	}
	updateStatusBar(todoProvider.getPendingCount());

	// Persiste cada cambio de filtro/estado (después de restaurar, para no reescribir el mismo valor leído)
	context.subscriptions.push(
		treeView,
		statusBarItem,
		todoProvider.onDidChangeFilter(filter => {
			context.workspaceState.update(FILTER_STATE_KEY, {
				tags: filter.tags ? Array.from(filter.tags) : undefined,
				text: filter.text,
				pathPattern: filter.pathPattern,
				status: filter.status,
				assignee: filter.assignee,
				priority: filter.priority,
			});
		}),
		todoProvider.onDidChangeStatuses(() => {
			context.workspaceState.update(FIXTURE_STATUSES_KEY, todoProvider.getStatusEntries());
		}),
		todoProvider.onDidChangeBadge(updateStatusBar)
	);

	function refreshAll() {
		const config = getTodoFinderConfig();
		todoProvider.refresh();
		decorationProvider.updateDecorations(vscode.window.activeTextEditor, config);
		codeLensProvider.refresh();
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
			title: 'Filtrar por etiqueta (1/6) — Esc para no modificar',
			placeHolder: 'Selecciona las etiquetas a mostrar (ninguna o todas = sin filtro)'
		});
		const tags = pickedTags === undefined
			? current.tags
			: (pickedTags.length === 0 || pickedTags.length === tagItems.length ? undefined : new Set(pickedTags.map(item => item.keyword)));

		const text = await vscode.window.showInputBox({
			title: 'Filtrar por texto (2/6) — Esc para no modificar',
			placeHolder: 'Texto a buscar dentro del fixture (vacío = sin filtro)',
			value: current.text ?? ''
		});
		const textFilter = text === undefined
			? current.text
			: (text.trim() ? text.trim().toLowerCase() : undefined);

		const pathPattern = await vscode.window.showInputBox({
			title: 'Filtrar por archivo/carpeta (3/6) — Esc para no modificar',
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
			title: 'Filtrar por estado (4/6) — Esc para no modificar',
			placeHolder: 'Issue / Resuelto / Wontfix / En progreso'
		});
		const status = pickedStatus === undefined ? current.status : pickedStatus.value;

		const assignee = await vscode.window.showInputBox({
			title: 'Filtrar por asignado (5/6) — Esc para no modificar',
			placeHolder: 'Nombre de usuario, sin @ (vacío = sin filtro)',
			value: current.assignee ?? ''
		});
		const assigneeFilter = assignee === undefined
			? current.assignee
			: (assignee.trim() ? assignee.trim() : undefined);

		const priorityItems: { label: string; value: Priority | undefined }[] = [
			{ label: 'Cualquier prioridad (sin filtro)', value: undefined },
			{ label: 'Baja', value: 'baja' },
			{ label: 'Media', value: 'media' },
			{ label: 'Alta', value: 'alta' },
		];
		const pickedPriority = await vscode.window.showQuickPick(priorityItems, {
			title: 'Filtrar por prioridad (6/6) — Esc para no modificar',
			placeHolder: 'Baja / Media / Alta'
		});
		const priority = pickedPriority === undefined ? current.priority : pickedPriority.value;

		todoProvider.setFilter({ tags, text: textFilter, pathPattern: pathFilter, status, assignee: assigneeFilter, priority });
	}

	async function createIssueFromFixture(ref: FixtureRef) {
		const remoteUrl = await getRepositoryRemoteUrl(ref.match.file);
		const title = `${ref.match.tag}: ${ref.match.text.trim()}`;
		if (!remoteUrl) {
			vscode.window.showWarningMessage('No se encontró un remote de git para este archivo.');
			return;
		}

		const rel = vscode.workspace.asRelativePath(ref.match.file, true);
		const body = `Generado desde TODO Finder\n\nArchivo: ${rel}:${ref.range.start.line + 1}`;
		const result = buildNewIssueUrl(remoteUrl, title, body);
		if ('error' in result) {
			vscode.window.showWarningMessage(`${result.error} Título: "${title}"`);
			return;
		}

		await vscode.env.openExternal(vscode.Uri.parse(result.url));
		todoProvider.setStatus(ref.match, 'issue');
	}

	async function openLinkedIssue(ref: FixtureRef) {
		if (!ref.match.issueNumber) {
			vscode.window.showInformationMessage('Este fixture no tiene un issue vinculado. Agregá "#123" en el comentario, ej. TODO(#123): texto.');
			return;
		}

		const remoteUrl = await getRepositoryRemoteUrl(ref.match.file);
		if (!remoteUrl) {
			vscode.window.showWarningMessage('No se encontró un remote de git para este archivo.');
			return;
		}

		const result = buildExistingIssueUrl(remoteUrl, ref.match.issueNumber);
		if ('error' in result) {
			vscode.window.showWarningMessage(result.error);
			return;
		}

		await vscode.env.openExternal(vscode.Uri.parse(result.url));
	}

	async function showFixtureActions(ref: FixtureRef) {
		const actions: { label: string; run: () => void }[] = [
			{ label: '$(issues) Marcar como issue', run: () => todoProvider.setStatus(ref.match, 'issue') },
			{ label: '$(check) Marcar como resuelto', run: () => todoProvider.setStatus(ref.match, 'done') },
			{ label: '$(circle-slash) Marcar como wontfix', run: () => todoProvider.setStatus(ref.match, 'wontfix') },
			{ label: '$(sync) Marcar como en progreso', run: () => todoProvider.setStatus(ref.match, 'in-progress') },
			{ label: '$(close) Quitar estado', run: () => todoProvider.setStatus(ref.match, undefined) },
			{ label: '$(globe) Crear issue en GitHub/GitLab', run: () => createIssueFromFixture(ref) },
			{ label: '$(link) Abrir issue vinculado', run: () => openLinkedIssue(ref) },
			{ label: '$(filter) Filtrar por esta etiqueta', run: () => todoProvider.filterByTag(ref.match.tag) },
		];
		const picked = await vscode.window.showQuickPick(actions, { placeHolder: `${ref.match.tag}: ${ref.match.text.trim()}` });
		picked?.run();
	}

	async function exportMarkdown() {
		const fileItems = await todoProvider.getChildren() as FileItem[];
		const lines: string[] = ['# TODOs'];
		for (const fileItem of fileItems) {
			lines.push('', `## ${vscode.workspace.asRelativePath(fileItem.fileUri, true)}`);
			const todoItems = await todoProvider.getChildren(fileItem) as TodoItem[];
			for (const todoItem of todoItems) {
				const status = todoProvider.getStatus(todoItem.match);
				const checked = status === 'done' ? 'x' : ' ';
				const suffix = status && status !== 'done' ? ` _(${STATUS_LABELS[status]})_` : '';
				lines.push(`- [${checked}] **${todoItem.match.tag}**: ${todoItem.match.text.trim()} (línea ${todoItem.range.start.line + 1})${suffix}`);
			}
		}
		const doc = await vscode.workspace.openTextDocument({ content: lines.join('\n'), language: 'markdown' });
		await vscode.window.showTextDocument(doc);
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

	let codeLensDebounce: ReturnType<typeof setTimeout> | undefined;
	const codeLensChangeSubscription = vscode.workspace.onDidChangeTextDocument(() => {
		clearTimeout(codeLensDebounce);
		codeLensDebounce = setTimeout(() => codeLensProvider.refresh(), 300);
	});

	const refreshCommand = vscode.commands.registerCommand('todoFinder.refresh', refreshAll);
	const filterCommand = vscode.commands.registerCommand('todoFinder.filter', showFilterWizard);
	const clearFilterCommand = vscode.commands.registerCommand('todoFinder.clearFilter', () => todoProvider.clearFilter());
	const filterByTagCommand = vscode.commands.registerCommand('todoFinder.filterByTag', (item: TodoItem) => {
		todoProvider.filterByTag(item.match.tag);
	});
	const filterByFolderCommand = vscode.commands.registerCommand('todoFinder.filterByFolder', (item: FileItem) => {
		todoProvider.filterByFolder(relativeDirOf(item.fileUri));
	});
	const markIssueCommand = vscode.commands.registerCommand('todoFinder.markIssue', (ref: FixtureRef) => {
		todoProvider.setStatus(ref.match, 'issue');
	});
	const markDoneCommand = vscode.commands.registerCommand('todoFinder.markDone', (ref: FixtureRef) => {
		todoProvider.setStatus(ref.match, 'done');
	});
	const markWontfixCommand = vscode.commands.registerCommand('todoFinder.markWontfix', (ref: FixtureRef) => {
		todoProvider.setStatus(ref.match, 'wontfix');
	});
	const markInProgressCommand = vscode.commands.registerCommand('todoFinder.markInProgress', (ref: FixtureRef) => {
		todoProvider.setStatus(ref.match, 'in-progress');
	});
	const clearStatusCommand = vscode.commands.registerCommand('todoFinder.clearStatus', (ref: FixtureRef) => {
		todoProvider.setStatus(ref.match, undefined);
	});
	const createIssueCommand = vscode.commands.registerCommand('todoFinder.createIssue', createIssueFromFixture);
	const openLinkedIssueCommand = vscode.commands.registerCommand('todoFinder.openLinkedIssue', openLinkedIssue);
	const fixtureActionsCommand = vscode.commands.registerCommand('todoFinder.fixtureActions', showFixtureActions);
	const exportMarkdownCommand = vscode.commands.registerCommand('todoFinder.exportMarkdown', exportMarkdown);

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
		openLinkedIssueCommand,
		fixtureActionsCommand,
		exportMarkdownCommand,
		decorationProvider,
		vscode.languages.registerCodeLensProvider({ scheme: 'file' }, codeLensProvider),
		codeLensChangeSubscription,
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
