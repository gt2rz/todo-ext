export function parseGitRemote(remoteUrl: string): { host: string; path: string } | undefined {
    const cleaned = remoteUrl.trim().replace(/\.git$/, '');

    let match = cleaned.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+)$/);
    if (!match) {
        match = cleaned.match(/^[^@]+@([^:]+):(.+)$/);
    }
    if (!match) {
        return undefined;
    }

    const [, host, rawPath] = match;
    return { host, path: rawPath.replace(/^\/+|\/+$/g, '') };
}

export function buildNewIssueUrl(remoteUrl: string, title: string, body: string): { url: string } | { error: string } {
    const parsed = parseGitRemote(remoteUrl);
    if (!parsed) {
        return { error: 'No se pudo interpretar la URL del remote.' };
    }

    const { host, path } = parsed;
    const qs = (params: Record<string, string>) =>
        Object.entries(params).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');

    if (host === 'github.com') {
        const segments = path.split('/');
        if (segments.length < 2) {
            return { error: 'No se pudo determinar owner/repo de GitHub.' };
        }
        const [owner, repo] = segments.slice(-2);
        return { url: `https://${host}/${owner}/${repo}/issues/new?${qs({ title, body })}` };
    }

    if (host === 'gitlab.com' || host.startsWith('gitlab.')) {
        // GitLab soporta subgrupos anidados: se usa el path completo, no se separa owner/repo.
        return { url: `https://${host}/${path}/-/issues/new?${qs({ 'issue[title]': title, 'issue[description]': body })}` };
    }

    return { error: `No se reconoce el proveedor del remote (${host}).` };
}
