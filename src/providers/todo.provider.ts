import * as vscode from 'vscode';
import * as path from 'path';
import { buildTodoRegex, scanWorkspace, TodoMatch } from '../core/todo-scanner';
import { getTodoFinderConfig } from '../core/config';

export class TodoProvider implements vscode.TreeDataProvider<TodoItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TodoItem | undefined | void> = new vscode.EventEmitter<TodoItem | undefined | void>();
    readonly onDidChangeTreeData: vscode.Event<TodoItem | undefined | void> = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: TodoItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: TodoItem): Promise<TodoItem[]> {
        if (!vscode.workspace.workspaceFolders) {
            return [];
        }

        if (!element) {
            return this.searchTodosInWorkspace();
        }

        return [];
    }

    private async searchTodosInWorkspace(): Promise<TodoItem[]> {
        const config = getTodoFinderConfig();
        const regex = buildTodoRegex(config.tags);
        const matches = await scanWorkspace(regex);

        return matches.map(match => {
            const range = new vscode.Range(match.line, match.startCol, match.line, match.startCol + match.text.length);
            return new TodoItem(match, range);
        });
    }
}

class TodoItem extends vscode.TreeItem {
    constructor(
        public readonly match: TodoMatch,
        public readonly range: vscode.Range
    ) {
        super(`${match.tag}: ${match.text.trim()}`, vscode.TreeItemCollapsibleState.None);

        this.tooltip = `${match.file.fsPath}:${range.start.line + 1}`;
        this.description = path.basename(match.file.fsPath);

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
