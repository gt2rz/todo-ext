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

export interface MatchFilter {
    tags?: Set<string>;
    text?: string;
    pathPattern?: string;
}

export const DEFAULT_FILES_GLOB = '**/*.{ts,js,py,md,txt,php}';
export const DEFAULT_EXCLUDE_GLOB = '**/{node_modules,vendor}/**';

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
        content = await fs.promises.readFile(uri.fsPath, 'utf8');
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

export async function scanWorkspace(regex: RegExp, include: string, exclude: string): Promise<TodoMatch[]> {
    if (!vscode.workspace.workspaceFolders) {
        return [];
    }
    const files = await vscode.workspace.findFiles(include, exclude);
    const results = await Promise.all(files.map(file => scanFile(file, regex)));
    return results.flat();
}

export function matchesFilter(match: TodoMatch, filter: MatchFilter): boolean {
    if (filter.tags && !filter.tags.has(match.tag)) {
        return false;
    }
    if (filter.text && !match.text.toLowerCase().includes(filter.text)) {
        return false;
    }
    if (filter.pathPattern) {
        const rel = vscode.workspace.asRelativePath(match.file, true).toLowerCase();
        if (!rel.includes(filter.pathPattern)) {
            return false;
        }
    }
    return true;
}

export function groupMatchesByFile(matches: TodoMatch[]): { uri: vscode.Uri; matches: TodoMatch[] }[] {
    const byFile = new Map<string, { uri: vscode.Uri; matches: TodoMatch[] }>();

    for (const match of matches) {
        const key = match.file.toString();
        const bucket = byFile.get(key);
        if (bucket) {
            bucket.matches.push(match);
        } else {
            byFile.set(key, { uri: match.file, matches: [match] });
        }
    }

    return Array.from(byFile.values()).sort((a, b) => a.uri.fsPath.localeCompare(b.uri.fsPath));
}
