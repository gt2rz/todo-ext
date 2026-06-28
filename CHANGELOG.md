# Change Log

Todos los cambios notables de "TODO Finder" se documentan en este archivo.

Formato basado en [Keep a Changelog](http://keepachangelog.com/).

## [0.1.0]

### Agregado

- Árbol "Tareas Pendientes" en la Activity Bar, organizado archivo → fixture.
- Etiquetas configurables (`TODO`, `FIXME`, `DEBUG`, `HACK`, `NOTE`, `REVIEW`, `OPTIMIZE`, `BUG`, `QUESTION`, `IDEA`, `WARNING` + personalizadas), con resaltado inline en el editor.
- Sintaxis de metadata estructurada (`TAG(@asignado, prioridad, #issue): texto`) y soporte de comentarios multilínea.
- Wizard de filtro combinable por etiqueta, texto, archivo/carpeta, estado, asignado y prioridad, persistido entre sesiones. Accesos directos de filtro rápido desde el menú contextual.
- Estados locales por fixture (Issue pendiente / Resuelto / Wontfix / En progreso), persistidos entre sesiones.
- Creación de issues en GitHub/GitLab a partir de un fixture (detecta el remote vía la extensión de Git de VS Code), y vinculación a un issue ya existente mediante `#123` en el comentario.
- CodeLens de acciones rápidas sobre cada fixture.
- Badge en la Activity Bar y barra de estado con la cantidad de fixtures pendientes.
- Git blame perezoso (autor/fecha) en el tooltip de cada fixture.
- Exportación a Markdown del árbol filtrado.
- Settings para activar/desactivar decoraciones, git blame, barra de estado, CodeLens, y para configurar el orden de los fixtures dentro de cada archivo.
- Comandos de navegación "ir al siguiente/anterior fixture" en el editor activo.
