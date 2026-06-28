import * as vscode from 'vscode';
import { TodoTag } from './todo-scanner';

export interface ResolvedTagConfig {
    tags: TodoTag[];
}

const DEFAULT_TAGS: TodoTag[] = [
    { keyword: 'TODO', color: '#145fb4', icon: '✅' },
    { keyword: 'FIXME', color: '#FF4D4D', icon: '⚠️' },
    { keyword: 'DEBUG', color: '#FFA500', icon: '🐞' },
    { keyword: 'HACK', color: '#FF69B4', icon: '🔧' },
    { keyword: 'NOTE', color: '#32CD32', icon: '📝' },
    { keyword: 'REVIEW', color: '#8A2BE2', icon: '👀' },
    { keyword: 'OPTIMIZE', color: '#FF8C00', icon: '🚀' },
    { keyword: 'BUG', color: '#FF0000', icon: '🐛' },
    { keyword: 'QUESTION', color: '#00CED1', icon: '❓' },
    { keyword: 'IDEA', color: '#FFD700', icon: '💡' },
    { keyword: 'WARNING', color: '#FFA500', icon: '⚠️' },
];

export function getTodoFinderConfig(): ResolvedTagConfig {
    const config = vscode.workspace.getConfiguration('todoFinder');
    const includeDefaultTags = config.get<boolean>('includeDefaultTags', true);
    const rawCustomTags = config.get<TodoTag[]>('customTags', []);

    const customTags = rawCustomTags.filter((tag): tag is TodoTag => {
        if (!tag || typeof tag.keyword !== 'string' || tag.keyword.trim() === '') {
            console.warn('todoFinder: se descartó una etiqueta personalizada sin "keyword" válido', tag);
            return false;
        }
        return true;
    });

    const byKeyword = new Map<string, TodoTag>();
    if (includeDefaultTags) {
        for (const tag of DEFAULT_TAGS) {
            byKeyword.set(tag.keyword.toUpperCase(), tag);
        }
    }
    for (const tag of customTags) {
        byKeyword.set(tag.keyword.toUpperCase(), { ...tag, keyword: tag.keyword.toUpperCase() });
    }

    return { tags: Array.from(byKeyword.values()) };
}
