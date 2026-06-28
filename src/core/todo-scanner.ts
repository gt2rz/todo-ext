import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface TodoTag {
    keyword: string;
    color?: string;
    icon?: string;
}

export type Priority = 'baja' | 'media' | 'alta';

export interface TodoMatch {
    tag: string;
    text: string;
    line: number;
    endLine: number;
    startCol: number;
    file: vscode.Uri;
    assignee?: string;
    priority?: Priority;
    issueNumber?: number;
}

export interface MatchFilter {
    tags?: Set<string>;
    text?: string;
    pathPattern?: string;
    assignee?: string;
    priority?: Priority;
}

export const DEFAULT_FILES_GLOB = '**/*.{ts,js,py,md,txt,php}';
export const DEFAULT_EXCLUDE_GLOB = '**/{node_modules,vendor}/**';

const LINE_COMMENT_BY_EXT: Record<string, string> = {
    ts: '//',
    js: '//',
    php: '//',
    py: '#',
};

const PRIORITY_ALIASES: Record<string, Priority> = {
    baja: 'baja', low: 'baja',
    media: 'media', medium: 'media', med: 'media',
    alta: 'alta', high: 'alta',
};

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildTodoRegex(tags: TodoTag[]): RegExp {
    const keywords = tags.map(tag => escapeRegExp(tag.keyword));
    return new RegExp(`\\b(${keywords.join('|')})(?:\\(([^)]*)\\))?:(.*)`, 'i');
}

function commentPrefixFor(uri: vscode.Uri): string | undefined {
    const ext = path.extname(uri.fsPath).slice(1).toLowerCase();
    return LINE_COMMENT_BY_EXT[ext];
}

interface Metadata {
    assignee?: string;
    priority?: Priority;
    issueNumber?: number;
}

function parseMetadata(raw: string | undefined): Metadata {
    const result: Metadata = {};
    if (!raw) {
        return result;
    }
    for (const rawToken of raw.split(',')) {
        const token = rawToken.trim();
        if (token.startsWith('@') && token.length > 1) {
            result.assignee = token.slice(1);
            continue;
        }
        const issueMatch = token.match(/^#(\d+)$/);
        if (issueMatch) {
            result.issueNumber = Number(issueMatch[1]);
            continue;
        }
        const priority = PRIORITY_ALIASES[token.toLowerCase()];
        if (priority) {
            result.priority = priority;
        }
        // Tokens no reconocidos se ignoran en silencio: esto corre por cada línea de cada
        // archivo en cada scan, no vale la pena advertir por consola.
    }
    return result;
}

export async function scanFile(uri: vscode.Uri, regex: RegExp): Promise<TodoMatch[]> {
    const matches: TodoMatch[] = [];
    let content: string;
    try {
        content = await fs.promises.readFile(uri.fsPath, 'utf8');
    } catch {
        return matches;
    }

    const lines = content.replace(/\r\n/g, '\n').split('\n');
    const prefix = commentPrefixFor(uri);

    for (let index = 0; index < lines.length; index++) {
        const match = regex.exec(lines[index]);
        if (!match) {
            continue;
        }

        const metaRaw = match[2];
        const meta = parseMetadata(metaRaw);
        const recognized = meta.assignee !== undefined || meta.priority !== undefined || meta.issueNumber !== undefined;
        let text = (metaRaw !== undefined && !recognized) ? `(${metaRaw}):${match[3]}` : match[3];

        let endLine = index;
        if (prefix) {
            let next = index + 1;
            while (next < lines.length) {
                const trimmed = lines[next].trim();
                if (!trimmed.startsWith(prefix)) {
                    break;
                }
                const continuation = trimmed.slice(prefix.length).trim();
                if (continuation === '' || regex.test(lines[next])) {
                    break;
                }
                text += ' ' + continuation;
                endLine = next;
                next++;
            }
        }

        matches.push({
            tag: match[1].toUpperCase(),
            text,
            line: index,
            endLine,
            startCol: match.index,
            file: uri,
            ...meta,
        });
    }
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
    if (filter.assignee && (match.assignee ?? '').toLowerCase() !== filter.assignee.toLowerCase()) {
        return false;
    }
    if (filter.priority && match.priority !== filter.priority) {
        return false;
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
