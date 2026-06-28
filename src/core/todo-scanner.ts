import * as vscode from 'vscode';
import * as fs from 'fs';

export interface TodoTag {
    keyword: string;
    color?: string;
    icon?: string;
}

export interface TodoMatch {
    tag: string;
    text: string;
    line: number;
    startCol: number;
    file: vscode.Uri;
}

const FILES_GLOB = '**/*.{ts,js,py,md,txt,php}';
const EXCLUDE_GLOB = '**/{node_modules,vendor}/**';

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildTodoRegex(tags: TodoTag[]): RegExp {
    const keywords = tags.map(tag => escapeRegExp(tag.keyword));
    return new RegExp(`\\b(${keywords.join('|')}):(.*)`, 'i');
}

export async function scanFile(uri: vscode.Uri, regex: RegExp): Promise<TodoMatch[]> {
    const matches: TodoMatch[] = [];
    let content: string;
    try {
        content = fs.readFileSync(uri.fsPath, 'utf8');
    } catch {
        return matches;
    }

    const lines = content.split('\n');
    lines.forEach((line, index) => {
        const match = regex.exec(line);
        if (match) {
            matches.push({
                tag: match[1].toUpperCase(),
                text: match[2],
                line: index,
                startCol: match.index,
                file: uri,
            });
        }
    });
    return matches;
}

export async function scanWorkspace(regex: RegExp): Promise<TodoMatch[]> {
    if (!vscode.workspace.workspaceFolders) {
        return [];
    }
    const files = await vscode.workspace.findFiles(FILES_GLOB, EXCLUDE_GLOB);
    const results = await Promise.all(files.map(file => scanFile(file, regex)));
    return results.flat();
}
