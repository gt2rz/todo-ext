# Contribuir a TODO Finder

## Desarrollo local

```bash
pnpm install
pnpm run watch
```

Lanzar `F5` desde VS Code abre un Extension Development Host con la extensión cargada.

```bash
pnpm run check-types   # type-check (tsc --noEmit)
pnpm run lint           # eslint
pnpm run compile-tests  # compila los tests a out/
pnpm test               # corre toda la suite (vscode-test)
```

`pnpm test` ejecuta dos perfiles definidos en [.vscode-test.mjs](.vscode-test.mjs):

- **unit**: sin workspace abierto (`src/test/*.test.ts`), para lógica pura (`todo-scanner`, `issue-url`, `filter-wizard-logic`).
- **integration**: abre [src/test/fixtures/sample-workspace](src/test/fixtures/sample-workspace) como workspace real (`src/test/integration/**/*.test.ts`), para ejercitar `TodoProvider` de punta a punta (árbol, filtros, estados, badge).

Para instalar el `.vsix` empaquetado en tu VS Code local: `pnpm run install:local`.

## Convenciones del código

- Lógica de escaneo/filtrado pura va en `src/core/*.ts` (sin `vscode.TreeItem` ni dependencias de UI) para que sea testeable sin simular el editor. La orquestación (comandos, diálogos, árbol) vive en `src/extension.ts` y `src/providers/*.ts`.
- Cada setting nuevo bajo `todoFinder.*` se lee on-demand con `vscode.workspace.getConfiguration('todoFinder').get(key, default)` en el punto de uso, salvo los que ya forman parte de `getTodoFinderConfig()` (tags/include/exclude).
- Los archivos de `src/test/fixtures/**` son datos de prueba, no código de la extensión — están excluidos de `tsconfig.json` y `eslint.config.mjs` a propósito.

## CI

Cada push/PR a `main` corre en GitHub Actions ([.github/workflows/ci.yml](.github/workflows/ci.yml)): instalación con `pnpm`, type-check, lint y la suite de tests completa (vía `xvfb-run`, necesario para `vscode-test` en runners de Linux sin display).

## Checklist antes de publicar al Marketplace

`package.json` tiene placeholders que **hay que reemplazar antes de publicar**:

- [ ] `publisher`: hoy es `TU_PUBLISHER_ID_AQUI`. Crear un publisher en https://marketplace.visualstudio.com/manage y poner su ID real.
- [ ] `repository.url`, `bugs.url`, `homepage`: hoy apuntan a `https://github.com/TU_USUARIO/todo-ext`. Reemplazar `TU_USUARIO` por el usuario/organización real (o quitar estos campos si el repo no es público).
- [ ] `LICENSE`: el copyright holder es `[Tu nombre]`. Reemplazar por el nombre real.
- [ ] Ícono PNG: solo existe `media/icon.svg`. El Marketplace requiere un ícono **PNG** (idealmente 256×256). Exportarlo desde el SVG existente (Figma, Inkscape, o un conversor online) y agregar `"icon": "media/icon.png"` a `package.json`.
- [ ] Revisar que `CHANGELOG.md` tenga una entrada para la versión que se va a publicar.
- [ ] `vsce publish` (o `pnpm run package` + subir el `.vsix` manualmente desde el panel del Marketplace).
