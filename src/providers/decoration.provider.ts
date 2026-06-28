import * as vscode from 'vscode';
import { buildTodoRegex, scanFile } from '../core/todo-scanner';
import { ResolvedTagConfig } from '../core/config';

export class DecorationProvider implements vscode.Disposable {
    private decorationTypes: Map<string, vscode.TextEditorDecorationType> = new Map();

    rebuildDecorationTypes(config: ResolvedTagConfig): void {
        this.disposeAll();
        for (const tag of config.tags) {
            const color = tag.color ?? '#FFA500';
            this.decorationTypes.set(tag.keyword, vscode.window.createTextEditorDecorationType({
                backgroundColor: `${color}33`,
                border: `1px solid ${color}`,
                color,
                fontWeight: 'bold',
                overviewRulerColor: color,
                overviewRulerLane: vscode.OverviewRulerLane.Right,
            }));
        }
    }

    async updateDecorations(editor: vscode.TextEditor | undefined, config: ResolvedTagConfig): Promise<void> {
        if (!editor) {
            return;
        }
        const regex = buildTodoRegex(config.tags);
        const matches = await scanFile(editor.document.uri, regex);

        for (const [keyword, decorationType] of this.decorationTypes) {
            const ranges = matches
                .filter(match => match.tag === keyword)
                .map(match => {
                    const endLine = Math.min(match.endLine, editor.document.lineCount - 1);
                    return new vscode.Range(match.line, match.startCol, endLine, editor.document.lineAt(endLine).text.length);
                });
            editor.setDecorations(decorationType, ranges);
        }
    }

    dispose(): void {
        this.disposeAll();
    }

    private disposeAll(): void {
        for (const decorationType of this.decorationTypes.values()) {
            decorationType.dispose();
        }
        this.decorationTypes.clear();
    }
}
