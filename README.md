# TODO Finder

Extensión de VS Code que encuentra los comentarios `TODO`, `FIXME` y otras etiquetas pendientes en tu proyecto, y los organiza en un árbol navegable (archivo → fixture) en la Activity Bar — con filtros, estados locales (issue/resuelto/wontfix/en progreso), creación de issues en GitHub/GitLab, CodeLens, git blame y export a Markdown.

## Tabla de contenidos

- [Features](#features)
- [Sintaxis soportada](#sintaxis-soportada)
- [Comandos](#comandos)
- [Configuración](#configuración)
- [Requisitos](#requisitos)
- [Desarrollo](#desarrollo)
- [Limitaciones conocidas](#limitaciones-conocidas)
- [Release Notes](#release-notes)

## Features

### Árbol de fixtures

Vista "Tareas Pendientes" en su propio contenedor de la Activity Bar (`TODO Finder`), organizada en dos niveles: **archivo → fixture**. Cada archivo muestra la cantidad de fixtures que contiene; cada fixture muestra su etiqueta, texto, y metadata opcional (asignado/prioridad).

### Etiquetas configurables

Por defecto detecta `TODO`, `FIXME`, `DEBUG`, `HACK`, `NOTE`, `REVIEW`, `OPTIMIZE`, `BUG`, `QUESTION`, `IDEA` y `WARNING`, cada una con su color e ícono. Podés agregar etiquetas propias o reemplazar las predeterminadas (ver [Configuración](#configuración)). Las etiquetas también se resaltan inline en el editor mientras escribís.

### Filtros combinables

Un wizard guiado (botón de filtro en la barra del árbol) permite filtrar por **etiqueta, texto libre, archivo/carpeta, estado, asignado y prioridad**, todos combinables entre sí (AND). El filtro persiste entre sesiones de VS Code. También hay accesos directos desde el menú contextual ("Filtrar por esta etiqueta", "Filtrar por esta carpeta") para no pasar por el wizard completo.

### Estados locales por fixture

Cada fixture puede marcarse como **Issue pendiente**, **Resuelto**, **Wontfix** o **En progreso** desde el menú contextual o el CodeLens — se ve con un ícono distinto en el árbol y persiste entre sesiones. Estos estados son anotaciones locales (no modifican el código ni se suben a ningún lado).

### Crear y vincular issues de GitHub/GitLab

"Crear issue en GitHub/GitLab" abre el navegador con un nuevo issue prellenado (título y referencia al archivo:línea), detectando el remote del repo automáticamente vía la extensión de Git de VS Code — y marca el fixture como **Issue pendiente** al volver. Si ya tenés un issue creado, podés referenciarlo en el propio comentario (`#123`) y usar "Abrir issue vinculado" para ir directo a él.

### CodeLens de acciones rápidas

Cada línea con un fixture muestra un CodeLens ("Acciones") con las mismas acciones del menú contextual (marcar estado, crear/abrir issue, filtrar), sin necesitar el árbol abierto. Se puede desactivar con `todoFinder.codeLens.enabled`.

### Badge y barra de estado

La Activity Bar y la barra de estado muestran la cantidad de fixtures pendientes (todo lo que no esté marcado como Resuelto o Wontfix) en todo momento; un click enfoca el árbol.

### Git blame integrado

Al pasar el mouse sobre un fixture, el tooltip muestra (de forma perezosa, solo cuando se necesita) quién lo escribió y cuándo, usando el historial de git del archivo.

### Exportar a Markdown

Exporta exactamente lo que estás viendo en el árbol (respetando el filtro activo) a un documento Markdown con checklist, listo para pegar en un PR, issue o reporte de standup.

### Metadata estructurada y comentarios multilínea

Los fixtures soportan metadata opcional entre paréntesis y continuación en líneas siguientes — ver [Sintaxis soportada](#sintaxis-soportada).

## Sintaxis soportada

```ts
// TODO: forma simple
// FIXME(@maria): con asignado
// TODO(alta): con prioridad (baja | media | alta)
// BUG(#123): referencia a un issue ya existente
// TODO(@maria, alta, #123): los tres combinados, en cualquier orden
```

**Comentarios multilínea**: si las líneas siguientes a un fixture siguen siendo comentario (mismo prefijo: `//` en `.ts`/`.js`/`.php`, `#` en `.py`), se consideran parte del mismo fixture hasta encontrar una línea vacía, código, o un nuevo tag:

```ts
// TODO: este texto
// continúa acá
// y termina acá
const x = 1; // esta línea ya no forma parte del fixture
```

> `.md`/`.txt` no tienen un prefijo de comentario definido, así que ahí cada fixture es siempre de una sola línea.

## Comandos

| Comando | Descripción |
| --- | --- |
| `todoFinder.refresh` | Refresca el árbol y las decoraciones del editor. |
| `todoFinder.filter` | Abre el wizard de filtro (etiqueta / texto / carpeta / estado / asignado / prioridad). |
| `todoFinder.clearFilter` | Limpia todos los filtros activos. |
| `todoFinder.filterByTag` | Filtra por la etiqueta del fixture seleccionado. |
| `todoFinder.filterByFolder` | Filtra por la carpeta del archivo seleccionado. |
| `todoFinder.markIssue` / `markDone` / `markWontfix` / `markInProgress` | Marca el estado local del fixture. |
| `todoFinder.clearStatus` | Quita el estado local del fixture. |
| `todoFinder.createIssue` | Crea un nuevo issue en GitHub/GitLab a partir del fixture. |
| `todoFinder.openLinkedIssue` | Abre el issue referenciado con `#123` en el comentario. |
| `todoFinder.exportMarkdown` | Exporta el árbol (filtrado) a un documento Markdown. |

Todos disponibles desde el menú contextual del árbol y/o el CodeLens; los de filtro y refresco también tienen botón en la barra del panel.

## Configuración

| Setting | Tipo | Default | Descripción |
| --- | --- | --- | --- |
| `todoFinder.includeDefaultTags` | `boolean` | `true` | Incluye las etiquetas predeterminadas además de las personalizadas. |
| `todoFinder.customTags` | `array` | `[]` | Etiquetas propias: `{ keyword, color?, icon? }`. |
| `todoFinder.include` | `string` | `**/*.{ts,js,py,md,txt,php}` | Glob de archivos a escanear. |
| `todoFinder.exclude` | `string` | `**/{node_modules,vendor}/**` | Glob de archivos/carpetas a excluir. |
| `todoFinder.codeLens.enabled` | `boolean` | `true` | Muestra el CodeLens de acciones rápidas sobre cada fixture. |

Ejemplo de etiqueta personalizada:

```jsonc
"todoFinder.customTags": [
  { "keyword": "REVIEW", "color": "#8A2BE2", "icon": "👀" }
]
```

## Requisitos

- VS Code `^1.125.0`.
- La extensión de Git incluida en VS Code (`vscode.git`) — se activa automáticamente como dependencia, la usan "Crear issue", "Abrir issue vinculado" y el git blame del tooltip. Sin un repositorio git con remote configurado, esas acciones muestran un aviso en vez de fallar.

## Desarrollo

```bash
pnpm install
pnpm run watch
```

Lanzar con `F5` para abrir un Extension Development Host.

```bash
pnpm run check-types   # type-check
pnpm run lint           # eslint
pnpm test               # suite de tests (vscode-test)
```

## Limitaciones conocidas

- El estado local de un fixture se identifica por `archivo + etiqueta + texto`; si editás el texto del comentario, el fixture "pierde" su estado anterior (se ve como uno nuevo). Dos comentarios idénticos en el mismo archivo comparten el mismo estado.
- Una línea de continuación multilínea que empiece justo con una etiqueta configurada seguida de `:` corta el bloque ahí, en vez de seguir.
- "Crear/abrir issue" reconoce remotes de `github.com` y `gitlab.com` (o subdominios `gitlab.*`); otros proveedores (Bitbucket, Azure DevOps, GitHub Enterprise en dominio propio) muestran un aviso para copiar los datos manualmente.
- El git blame del tooltip depende del formato de salida humano de `git blame`; si no se puede interpretar, simplemente no se muestra (no rompe el árbol).

## Release Notes

### 0.0.1

Versión inicial: árbol de fixtures, etiquetas configurables, filtros, estados locales, integración con Git (remote/blame), CodeLens, badge/status bar y export a Markdown.
