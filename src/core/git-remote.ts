import * as vscode from 'vscode';
import { getRepositoryFor } from './git-api';

export async function getRepositoryRemoteUrl(file: vscode.Uri): Promise<string | undefined> {
    const repository = await getRepositoryFor(file);
    if (!repository) {
        return undefined;
    }

    let remotes = repository.state.remotes;
    if (remotes.length === 0) {
        // Los remotes pueden tardar en poblarse justo después de abrir el repo.
        await new Promise<void>(resolve => {
            const sub = repository.state.onDidChange(() => {
                sub.dispose();
                resolve();
            });
            setTimeout(() => {
                sub.dispose();
                resolve();
            }, 2000);
        });
        remotes = repository.state.remotes;
    }

    const remote = remotes.find(r => r.name === 'origin') ?? remotes[0];
    return remote?.fetchUrl ?? remote?.pushUrl;
}
