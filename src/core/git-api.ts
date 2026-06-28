import * as vscode from 'vscode';

export interface GitRemote {
    name: string;
    fetchUrl?: string;
    pushUrl?: string;
}

export interface GitRepositoryState {
    remotes: GitRemote[];
    onDidChange: vscode.Event<void>;
}

export interface GitRepository {
    state: GitRepositoryState;
    blame(path: string): Promise<string>;
}

interface GitAPI {
    getRepository(uri: vscode.Uri): GitRepository | null;
}

interface GitExtensionExports {
    getAPI(version: 1): GitAPI;
}

export async function getRepositoryFor(file: vscode.Uri): Promise<GitRepository | undefined> {
    const extension = vscode.extensions.getExtension<GitExtensionExports>('vscode.git');
    if (!extension) {
        return undefined;
    }

    const exports = extension.isActive ? extension.exports : await extension.activate();
    return exports.getAPI(1).getRepository(file) ?? undefined;
}
