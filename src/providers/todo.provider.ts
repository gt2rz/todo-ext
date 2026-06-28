import * as vscode from 'vscode';
import * as path from 'path';
import { buildTodoRegex, scanWorkspace, matchesFilter, groupMatchesByFile, TodoMatch, MatchFilter } from '../core/todo-scanner';
import { getTodoFinderConfig } from '../core/config';
import { FixtureStatus, fixtureKey, STATUS_ICONS, STATUS_LABELS } from '../core/fixture-status';

type TreeNode = FileItem | TodoItem;

export type FilterState = MatchFilter & { status?: FixtureStatus };

export class TodoProvider implements vscode.TreeDataProvider<TreeNode> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeNode | undefined | void> = new vscode.EventEmitter<TreeNode | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeNode | undefined | void> = this._onDidChangeTreeData.event;

    private _onDidChangeFilter: vscode.EventEmitter<FilterState> = new vscode.EventEmitter<FilterState>();
    readonly onDidChangeFilter: vscode.Event<FilterState> = this._onDidChangeFilter.event;

    private _onDidChangeStatuses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    readonly onDidChangeStatuses: vscode.Event<void> = this._onDidChangeStatuses.event;

    private filter: FilterState = {};
    private rawMatches: TodoMatch[] | null = null;
    private treeView: vscode.TreeView<TreeNode> | undefined;
    private statuses: Map<string, FixtureStatus> = new Map();

    setTreeView(view: vscode.TreeView<TreeNode>): void {
        this.treeView = view;
    }

    refresh(): void {
        this.rawMatches = null;
        this._onDidChangeTreeData.fire();
    }

    getFilter(): FilterState {
        return this.filter;
    }

    hasActiveFilter(): boolean {
        return !!(this.filter.tags || this.filter.text || this.filter.pathPattern || this.filter.status);
    }

    setFilter(next: FilterState): void {
        this.filter = next;
        vscode.commands.executeCommand('setContext', 'todoFinder.filterActive', this.hasActiveFilter());
        this._onDidChangeFilter.fire(next);
        this._onDidChangeTreeData.fire();
    }

    clearFilter(): void {
        this.setFilter({});
    }

    filterByTag(tag: string): void {
        this.setFilter({ ...this.filter, tags: new Set([tag]) });
    }

    filterByFolder(relDir: string): void {
        this.setFilter({ ...this.filter, pathPattern: relDir.toLowerCase() });
    }

    getStatus(match: TodoMatch): FixtureStatus | undefined {
        return this.statuses.get(fixtureKey(match));
    }

    setStatus(match: TodoMatch, status: FixtureStatus | undefined): void {
        const key = fixtureKey(match);
        if (status) {
            this.statuses.set(key, status);
        } else {
            this.statuses.delete(key);
        }
        this._onDidChangeStatuses.fire();
        this._onDidChangeTreeData.fire();
    }

    loadStatuses(entries: [string, FixtureStatus][]): void {
        this.statuses = new Map(entries);
    }

    getStatusEntries(): [string, FixtureStatus][] {
        return Array.from(this.statuses.entries());
    }

    private pruneStatuses(matches: TodoMatch[]): void {
        const validKeys = new Set(matches.map(fixtureKey));
        let changed = false;
        for (const key of this.statuses.keys()) {
            if (!validKeys.has(key)) {
                this.statuses.delete(key);
                changed = true;
            }
        }
        if (changed) {
            this._onDidChangeStatuses.fire();
        }
    }

    getTreeItem(element: TreeNode): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: TreeNode): Promise<TreeNode[]> {
        if (!vscode.workspace.workspaceFolders) {
            return [];
        }

        if (!element) {
            return this.searchTodosInWorkspace();
        }

        if (element.kind === 'file') {
            return element.matches.map(match => {
                const range = new vscode.Range(match.line, match.startCol, match.line, match.startCol + match.text.length);
                return new TodoItem(match, range, this.getStatus(match));
            });
        }

        return [];
    }

    private async getRawMatches(): Promise<TodoMatch[]> {
        if (!this.rawMatches) {
            const config = getTodoFinderConfig();
            const regex = buildTodoRegex(config.tags);
            this.rawMatches = await scanWorkspace(regex, config.include, config.exclude);
            this.pruneStatuses(this.rawMatches);
        }
        return this.rawMatches;
    }

    private async searchTodosInWorkspace(): Promise<FileItem[]> {
        const matches = await this.getRawMatches();
        const filtered = matches
            .filter(match => matchesFilter(match, this.filter))
            .filter(match => !this.filter.status || this.getStatus(match) === this.filter.status);
        const fileItems = this.groupByFile(filtered);

        if (this.treeView) {
            this.treeView.message = (fileItems.length === 0 && this.hasActiveFilter())
                ? 'No hay fixtures que coincidan con el filtro actual.'
                : undefined;
        }

        return fileItems;
    }

    private groupByFile(matches: TodoMatch[]): FileItem[] {
        return groupMatchesByFile(matches).map(bucket => new FileItem(bucket.uri, bucket.matches));
    }
}

export class FileItem extends vscode.TreeItem {
    readonly kind = 'file' as const;

    constructor(
        public readonly fileUri: vscode.Uri,
        public readonly matches: TodoMatch[]
    ) {
        super(path.basename(fileUri.fsPath), vscode.TreeItemCollapsibleState.Expanded);

        this.resourceUri = fileUri;
        this.iconPath = vscode.ThemeIcon.File;
        this.contextValue = 'todoFile';

        const rel = vscode.workspace.asRelativePath(fileUri, true);
        const dir = path.dirname(rel);
        const dirLabel = dir === '.' ? '' : dir;
        this.description = dirLabel ? `${dirLabel} · ${matches.length}` : `${matches.length}`;
        this.tooltip = fileUri.fsPath;
    }
}

export class TodoItem extends vscode.TreeItem {
    readonly kind = 'todo' as const;

    constructor(
        public readonly match: TodoMatch,
        public readonly range: vscode.Range,
        status?: FixtureStatus
    ) {
        super(`${match.tag}: ${match.text.trim()}`, vscode.TreeItemCollapsibleState.None);

        this.tooltip = `${match.file.fsPath}:${range.start.line + 1}`;
        this.description = path.basename(match.file.fsPath);
        this.contextValue = 'todoFixture';

        if (status) {
            this.iconPath = new vscode.ThemeIcon(STATUS_ICONS[status]);
            this.tooltip = `${this.tooltip} · ${STATUS_LABELS[status]}`;
        }

        this.command = {
            command: 'vscode.open',
            title: "Abrir Archivo",
            arguments: [
                match.file,
                { selection: range }
            ]
        };
    }
}
