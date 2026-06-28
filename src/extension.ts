import * as vscode from 'vscode';
import { TodoProvider } from './providers/todo.provider';
import { DecorationProvider } from './providers/decoration.provider';
import { getTodoFinderConfig } from './core/config';

export function activate(context: vscode.ExtensionContext) {

	const todoProvider = new TodoProvider();
	const decorationProvider = new DecorationProvider();

	// Registra el proveedor en la vista 'todoTree'
	vscode.window.registerTreeDataProvider('todoTree', todoProvider);

	function refreshAll() {
		const config = getTodoFinderConfig();
		todoProvider.refresh();
		decorationProvider.updateDecorations(vscode.window.activeTextEditor, config);
	}

	decorationProvider.rebuildDecorationTypes(getTodoFinderConfig());
	decorationProvider.updateDecorations(vscode.window.activeTextEditor, getTodoFinderConfig());

	// Registra un comando para refrescar manualmente el árbol y las decoraciones
	const refreshCommand = vscode.commands.registerCommand('todoFinder.refresh', refreshAll);

	context.subscriptions.push(
		refreshCommand,
		decorationProvider,
		// Refrescar automáticamente cuando se guarda un archivo
		vscode.workspace.onDidSaveTextDocument(() => refreshAll()),
		// Decorar el editor recién enfocado sin esperar a un guardado
		vscode.window.onDidChangeActiveTextEditor(editor => {
			decorationProvider.updateDecorations(editor, getTodoFinderConfig());
		}),
		// Reconstruir decoraciones y refrescar todo cuando cambian los ajustes de todoFinder
		vscode.workspace.onDidChangeConfiguration(event => {
			if (event.affectsConfiguration('todoFinder')) {
				decorationProvider.rebuildDecorationTypes(getTodoFinderConfig());
				refreshAll();
			}
		})
	);
}

// This method is called when your extension is deactivated
export function deactivate() {}
