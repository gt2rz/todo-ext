import * as vscode from 'vscode';
import { TodoMatch } from './todo-scanner';

export type FixtureStatus = 'issue' | 'done' | 'wontfix' | 'in-progress';

export function fixtureKey(match: TodoMatch): string {
    const rel = vscode.workspace.asRelativePath(match.file, true);
    return `${rel}::${match.tag}::${match.text.trim()}`;
}

export const STATUS_ICONS: Record<FixtureStatus, string> = {
    issue: 'issues',
    done: 'check',
    wontfix: 'circle-slash',
    'in-progress': 'sync',
};

export const STATUS_LABELS: Record<FixtureStatus, string> = {
    issue: 'Issue pendiente',
    done: 'Resuelto',
    wontfix: 'Wontfix',
    'in-progress': 'En progreso',
};
