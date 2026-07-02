// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { PortfolioExplorerProvider } from './providers/portfolioExplorerProvider';
import { AssetNode } from './providers/assetNode';
import { PortfolioNode } from './providers/portfolioNode';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "vscode-portfolio-insight" is now active!');
	// Create the Portfolio Explorer provider
	const portfolioExplorerProvider = new PortfolioExplorerProvider(context);
	
	// Register the tree data provider
	const treeView = vscode.window.createTreeView('portfolioExplorer', {
		treeDataProvider: portfolioExplorerProvider,
		showCollapseAll: true
	});
	
	// Track the current selection for other commands
	let currentSelection: any = null;
	treeView.onDidChangeSelection(e => {
		if (e.selection && e.selection.length > 0) {
			currentSelection = e.selection[0];
		} else {
			currentSelection = null;
		}
	});
	context.subscriptions.push(treeView);
	// Register commands
	const disposableHelloWorld = vscode.commands.registerCommand('vscode-portfolio-insight.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from vscode-portfolio-insight!');
	});	
	const disposableRefresh = vscode.commands.registerCommand('vscode-portfolio-insight.refresh', () => {
		portfolioExplorerProvider.refresh();
		vscode.window.showInformationMessage('Portfolio Explorer refreshed!');
	});	// Register command to open Portfolio Update View
	const disposableUpdateAssets = vscode.commands.registerCommand('vscode-portfolio-insight.updateAssets', () => {
		portfolioExplorerProvider.openPortfolioUpdate();
	});

	// Register command to open Asset Page
	const disposableOpenAssetPage = vscode.commands.registerCommand(
		'vscode-portfolio-insight.openAssetPage',
		async (assetNode: AssetNode) => {
			if (assetNode && assetNode.nodeType === 'asset') {
				await assetNode.openAssetPage(context);
			}
		}
	);

	// Register command to open Portfolio Page
	const disposableOpenPortfolioPage = vscode.commands.registerCommand(
		'vscode-portfolio-insight.openPortfolioPage',
		async (portfolioNode: PortfolioNode) => {
			if (portfolioNode && portfolioNode.nodeType === 'portfolio') {
				await portfolioNode.openPortfolioPage(context);
			}
		}
	);
	context.subscriptions.push(disposableHelloWorld, disposableRefresh, disposableUpdateAssets, disposableOpenAssetPage, disposableOpenPortfolioPage);
	context.subscriptions.push(vscode.commands.registerCommand('vscode-portfolio-insight.editAssetDefinition', 
		() => {
			portfolioExplorerProvider.openAssetDefinitionEditor();
		}
	));

	context.subscriptions.push(vscode.commands.registerCommand('vscode-portfolio-insight.editAssetDefinitionFromHeader', () => {
		// Check if the current selection is an asset collection node
		if (currentSelection && currentSelection.contextValue === 'assets') {
			portfolioExplorerProvider.openAssetDefinitionEditor();
		} else {
			// Show a message that assets node should be selected
			vscode.window.showInformationMessage('Please select the Assets node to edit asset definitions.');
		}
	}));
}

// This method is called when your extension is deactivated
export function deactivate() {}
