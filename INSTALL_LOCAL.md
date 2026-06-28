# Instalar la extensión localmente (modo "real", no debug)

Cuando lanzas con `F5` la extensión solo vive en la ventana de **Extension Development Host**. Para verla en **cualquier ventana de VSCode** (otro proyecto, otra carpeta) hay que empaquetarla e instalarla como una extensión normal.

## Cada vez que actualices el código

Ejecuta:

```bash
pnpm run install:local
```

Esto hace:

1. `vsce package` — compila (`vscode:prepublish` → `check-types` + `lint` + `esbuild --production`) y genera un nuevo `todo-ext-<version>.vsix`.
2. `code --install-extension <vsix> --force` — instala/reemplaza la extensión en tu VSCode.

Luego, en **cada ventana de VSCode donde quieras ver el cambio**:

> `Cmd+Shift+P` → **Developer: Reload Window**

(o cierra y vuelve a abrir VSCode).

## Notas

- El script está en [scripts/install-local.sh](scripts/install-local.sh).
- Si subes la versión en `package.json` (`version`), se genera un `.vsix` nuevo con ese número; `--force` igual sobreescribe la instalación anterior sin necesidad de subir versión.
- Los `.vsix` generados no se versionan (ver `.gitignore`/`.vscodeignore`).
- Si alguna vez quieres desinstalarla: `code --uninstall-extension todo-ext.todo-ext` (o usa el publisher real si lo defines en `package.json`).
