import * as vscode from 'vscode';
import { buildTodoRegex, scanFile } from '../core/todo-scanner';
import { getTodoFinderConfig } from '../core/config';

export class FixtureCodeLensProvider implements vscode.CodeLensProvider {
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

    refresh(): void {
        this._onDidChangeCodeLenses.fire();
    }

    async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
        if (!vscode.workspace.getConfiguration('todoFinder').get<boolean>('codeLens.enabled', true)) {
            return [];
        }

        const config = getTodoFinderConfig();
        const regex = buildTodoRegex(config.tags);
        const matches = await scanFile(document.uri, regex);

        return matches.map(match => {
            const range = new vscode.Range(match.line, match.startCol, match.line, match.startCol + match.tag.length);
            return new vscode.CodeLens(new vscode.Range(match.line, 0, match.line, 0), {
                title: '$(list-unordered) Acciones',
                command: 'todoFinder.fixtureActions',
                arguments: [{ match, range }]
            });
        });
    }
}
