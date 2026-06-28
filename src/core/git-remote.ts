import * as vscode from 'vscode';

interface GitRemote {
    name: string;
    fetchUrl?: string;
    pushUrl?: string;
}

interface GitRepositoryState {
    remotes: GitRemote[];
    onDidChange: vscode.Event<void>;
}

interface GitRepository {
    state: GitRepositoryState;
}

interface GitAPI {
    getRepository(uri: vscode.Uri): GitRepository | null;
}

interface GitExtensionExports {
    getAPI(version: 1): GitAPI;
}

export async function getRepositoryRemoteUrl(file: vscode.Uri): Promise<string | undefined> {
    const extension = vscode.extensions.getExtension<GitExtensionExports>('vscode.git');
    if (!extension) {
        return undefined;
    }

    const exports = extension.isActive ? extension.exports : await extension.activate();
    const repository = exports.getAPI(1).getRepository(file);
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
