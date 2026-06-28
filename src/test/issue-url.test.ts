import * as assert from 'assert';
import { buildNewIssueUrl, parseGitRemote } from '../core/issue-url';

suite('issue-url', () => {

	suite('parseGitRemote', () => {
		test('HTTPS con .git', () => {
			const parsed = parseGitRemote('https://github.com/owner/repo.git');
			assert.deepStrictEqual(parsed, { host: 'github.com', path: 'owner/repo' });
		});

		test('HTTPS sin .git', () => {
			const parsed = parseGitRemote('https://github.com/owner/repo');
			assert.deepStrictEqual(parsed, { host: 'github.com', path: 'owner/repo' });
		});

		test('SSH scp-like (git@host:path)', () => {
			const parsed = parseGitRemote('git@github.com:owner/repo.git');
			assert.deepStrictEqual(parsed, { host: 'github.com', path: 'owner/repo' });
		});

		test('SSH con protocolo y puerto (ssh://git@host:port/path)', () => {
			const parsed = parseGitRemote('ssh://git@github.com:2222/owner/repo.git');
			assert.deepStrictEqual(parsed, { host: 'github.com', path: 'owner/repo' });
		});

		test('URL irreconocible devuelve undefined', () => {
			assert.strictEqual(parseGitRemote('no-es-una-url'), undefined);
		});
	});

	suite('buildNewIssueUrl', () => {
		test('GitHub: owner/repo simple', () => {
			const result = buildNewIssueUrl('https://github.com/owner/repo.git', 'TODO: revisar', 'cuerpo');
			assert.ok('url' in result);
			if ('url' in result) {
				assert.ok(result.url.startsWith('https://github.com/owner/repo/issues/new?'));
				assert.ok(result.url.includes('title=TODO%3A%20revisar'));
			}
		});

		test('GitLab: preserva subgrupos anidados en el path completo', () => {
			const result = buildNewIssueUrl('https://gitlab.com/grupo/subgrupo/repo.git', 'FIXME: roto', 'cuerpo');
			assert.ok('url' in result);
			if ('url' in result) {
				assert.ok(result.url.startsWith('https://gitlab.com/grupo/subgrupo/repo/-/issues/new?'));
				assert.ok(result.url.includes('issue[title]=FIXME%3A%20roto'));
			}
		});

		test('GitLab self-hosted (host empieza con gitlab.)', () => {
			const result = buildNewIssueUrl('git@gitlab.example.com:owner/repo.git', 'NOTE: x', 'y');
			assert.ok('url' in result);
			if ('url' in result) {
				assert.ok(result.url.startsWith('https://gitlab.example.com/owner/repo/-/issues/new?'));
			}
		});

		test('host desconocido devuelve error en vez de una URL incorrecta', () => {
			const result = buildNewIssueUrl('https://bitbucket.org/owner/repo.git', 'TODO: x', 'y');
			assert.ok('error' in result);
		});

		test('remote irreconocible devuelve error', () => {
			const result = buildNewIssueUrl('no-es-una-url', 'TODO: x', 'y');
			assert.ok('error' in result);
		});
	});
});
