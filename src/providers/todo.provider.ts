import * as vscode from 'vscode';
import * as path from 'path';
import { buildTodoRegex, scanWorkspace, matchesFilter, groupMatchesByFile, TodoMatch, MatchFilter } from '../core/todo-scanner';
import { getTodoFinderConfig } from '../core/config';
import { FixtureStatus, fixtureKey, STATUS_ICONS, STATUS_LABELS } from '../core/fixture-status';
import { getBlameForLine } from '../core/git-blame';

type TreeNode = FileItem | TodoItem;

const PRIORITY_RANK: Record<string, number> = { alta: 0, media: 1, baja: 2 };

export type FilterState = MatchFilter & { status?: FixtureStatus };

export class TodoProvider implements vscode.TreeDataProvider<TreeNode> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeNode | undefined | void> = new vscode.EventEmitter<TreeNode | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeNode | undefined | void> = this._onDidChangeTreeData.event;

    private _onDidChangeFilter: vscode.EventEmitter<FilterState> = new vscode.EventEmitter<FilterState>();
    readonly onDidChangeFilter: vscode.Event<FilterState> = this._onDidChangeFilter.event;

    private _onDidChangeStatuses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    readonly onDidChangeStatuses: vscode.Event<void> = this._onDidChangeStatuses.event;

    private _onDidChangeBadge: vscode.EventEmitter<number> = new vscode.EventEmitter<number>();
    readonly onDidChangeBadge: vscode.Event<number> = this._onDidChangeBadge.event;

    private filter: FilterState = {};
    private rawMatches: TodoMatch[] | null = null;
    private treeView: vscode.TreeView<TreeNode> | undefined;
    private statuses: Map<string, FixtureStatus> = new Map();
    private pendingCount = 0;

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
        return !!(this.filter.tags || this.filter.text || this.filter.pathPattern || this.filter.status
            || this.filter.assignee || this.filter.priority);
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
        this.updateBadge();
        this._onDidChangeTreeData.fire();
    }

    loadStatuses(entries: [string, FixtureStatus][]): void {
        this.statuses = new Map(entries);
    }

    getStatusEntries(): [string, FixtureStatus][] {
        return Array.from(this.statuses.entries());
    }

    getPendingCount(): number {
        return this.pendingCount;
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

    private updateBadge(): void {
        this.pendingCount = (this.rawMatches ?? []).filter(match => {
            const status = this.getStatus(match);
            return status !== 'done' && status !== 'wontfix';
        }).length;

        if (this.treeView) {
            this.treeView.badge = this.pendingCount > 0
                ? { value: this.pendingCount, tooltip: `${this.pendingCount} fixtures pendientes` }
                : undefined;
        }
        this._onDidChangeBadge.fire(this.pendingCount);
    }

    getTreeItem(element: TreeNode): vscode.TreeItem {
        return element;
    }

    async resolveTreeItem(item: vscode.TreeItem, element: TreeNode): Promise<vscode.TreeItem> {
        const blameEnabled = vscode.workspace.getConfiguration('todoFinder').get<boolean>('gitBlame.enabled', true);
        if (element.kind === 'todo' && blameEnabled) {
            const blame = await getBlameForLine(element.match.file, element.match.line);
            if (blame) {
                item.tooltip = `${item.tooltip}\n${blame.author} · ${blame.date}`;
            }
        }
        return item;
    }

    async getChildren(element?: TreeNode): Promise<TreeNode[]> {
        if (!vscode.workspace.workspaceFolders) {
            return [];
        }

        if (!element) {
            return this.searchTodosInWorkspace();
        }

        if (element.kind === 'file') {
            return this.sortMatches(element.matches).map(match => new TodoItem(match, this.getStatus(match)));
        }

        return [];
    }

    private sortMatches(matches: TodoMatch[]): TodoMatch[] {
        const sortOrder = vscode.workspace.getConfiguration('todoFinder').get<string>('treeView.sortOrder', 'path');
        if (sortOrder !== 'priority') {
            return matches;
        }
        return [...matches].sort((a, b) => {
            const rankA = a.priority ? PRIORITY_RANK[a.priority] : 3;
            const rankB = b.priority ? PRIORITY_RANK[b.priority] : 3;
            return rankA - rankB;
        });
    }

    private async getRawMatches(): Promise<TodoMatch[]> {
        if (!this.rawMatches) {
            const config = getTodoFinderConfig();
            const regex = buildTodoRegex(config.tags);
            this.rawMatches = await scanWorkspace(regex, config.include, config.exclude);
            this.pruneStatuses(this.rawMatches);
            this.updateBadge();
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
    public readonly range: vscode.Range;

    constructor(
        public readonly match: TodoMatch,
        status?: FixtureStatus
    ) {
        super(`${match.tag}: ${match.text.trim()}`, vscode.TreeItemCollapsibleState.None);

        this.range = new vscode.Range(match.line, match.startCol, match.line, match.startCol + match.tag.length);

        const metaParts = [];
        if (match.assignee) { metaParts.push(`@${match.assignee}`); }
        if (match.priority) { metaParts.push(match.priority); }
        this.description = metaParts.length
            ? `${path.basename(match.file.fsPath)} · ${metaParts.join(' · ')}`
            : path.basename(match.file.fsPath);

        this.tooltip = `${match.file.fsPath}:${match.line + 1}`;
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
                { selection: this.range }
            ]
        };
    }
}
