import * as vscode from 'vscode';
import { getRepositoryFor } from './git-api';

export interface BlameInfo {
    author: string;
    date: string;
}

const BLAME_LINE_RE = /^([0-9a-f]+)\s+\((.+?)\s+(\d{4}-\d{2}-\d{2})\s+[\d:]+\s+[+-]\d{4}\s+(\d+)\)/;

export async function getBlameForLine(file: vscode.Uri, line0: number): Promise<BlameInfo | undefined> {
    try {
        const repository = await getRepositoryFor(file);
        if (!repository) {
            return undefined;
        }

        const raw = await repository.blame(file.fsPath);
        const targetLine = line0 + 1;
        for (const rawLine of raw.split('\n')) {
            const match = BLAME_LINE_RE.exec(rawLine);
            if (match && Number(match[4]) === targetLine) {
                return { author: match[2], date: match[3] };
            }
        }
        return undefined;
    } catch {
        // Best-effort: el formato de salida de `git blame` es texto pensado para humanos,
        // no es un contrato estable. Si no podemos parsearlo, simplemente no mostramos blame.
        return undefined;
    }
}
