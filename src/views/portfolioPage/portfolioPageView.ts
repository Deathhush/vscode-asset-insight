import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Portfolio } from '../../data/portfolio';
import { PortfolioNode } from '../../providers/portfolioNode';

export class PortfolioPageView {
    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];
    private _onDisposeEmitter = new vscode.EventEmitter<void>();
    public readonly onDispose = this._onDisposeEmitter.event;

    constructor(
        extensionUri: vscode.Uri,
        private portfolioNode: PortfolioNode
    ) {
        this._extensionUri = extensionUri;

        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // Create a new panel
        this._panel = vscode.window.createWebviewPanel(
            'portfolioPageView',
            'Portfolio',
            column || vscode.ViewColumn.One,
            {
                // Enable javascript in the webview
                enableScripts: true,
                // Restrict the webview to only loading content from our extension's directory
                localResourceRoots: [extensionUri],
                retainContextWhenHidden: true,
                // Enable modals for better user interaction
                enableForms: true
            }
        );

        // Set the webview's initial html content
        this._update();

        // Listen for when the panel is disposed
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            message => {
                console.log('Received message from portfolio webview:', message.type, message.data);

                switch (message.type) {
                    case 'REFRESH_DATA':
                        this.refreshData();
                        return;
                    case 'error':
                        vscode.window.showErrorMessage(message.message);
                        return;
                }
            },
            null,
            this._disposables
        );

        // Listen for theme changes
        vscode.window.onDidChangeActiveColorTheme(() => {
            this._update(); // Refresh webview with new theme
        }, null, this._disposables);

        // Load and send initial data
        this.sendPortfolioData();
    }

    // Convenience getters for type-safe access
    private get provider() {
        return this.portfolioNode.provider;
    }

    private get portfolio(): Portfolio {
        return new Portfolio(this.provider.dataAccess);
    }

    // Data synchronization
    private async refreshData(): Promise<void> {
        try {
            // Make sure we read the freshest data from disk
            this.provider.dataAccess.invalidateAllCaches();

            // Send fresh data to webview
            await this.sendPortfolioData();

            console.log('Refreshed portfolio data');
        } catch (error) {
            console.error('Error refreshing portfolio data:', error);
            vscode.window.showErrorMessage(`Failed to refresh portfolio data: ${error}`);
        }
    }

    private async sendPortfolioData(): Promise<void> {
        try {
            const summary = await this.portfolio.generateSummary();

            const message = {
                type: 'PORTFOLIO_DATA',
                data: summary
            };

            this._panel.webview.postMessage(message);
            console.log('Portfolio data sent to webview');
        } catch (error) {
            console.error('Error sending portfolio data:', error);

            // Send error state to webview
            const errorMessage = {
                type: 'ERROR',
                data: {
                    message: `Failed to load portfolio data: ${error}`
                }
            };

            this._panel.webview.postMessage(errorMessage);
        }
    }

    public reveal(): void {
        this._panel.reveal();
    }

    public dispose(): void {
        // Emit dispose event before cleaning up
        this._onDisposeEmitter.fire();
        this._onDisposeEmitter.dispose();

        // Clean up our resources
        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private _update(): void {
        const webview = this._panel.webview;
        this._panel.title = 'Portfolio';
        this._panel.webview.html = this._getHtmlForWebview(webview);
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        try {
            // Try to load HTML from file
            const htmlPath = path.join(this._extensionUri.fsPath, 'src', 'views', 'portfolioPage', 'portfolioPage.html');

            if (fs.existsSync(htmlPath)) {
                let htmlContent = fs.readFileSync(htmlPath, 'utf8');

                // Replace resource URIs
                htmlContent = htmlContent.replace(
                    /src="([^"]+)"/g,
                    (match, src) => {
                        const resourceUri = webview.asWebviewUri(
                            vscode.Uri.joinPath(this._extensionUri, 'src', 'views', 'portfolioPage', src)
                        );
                        return `src="${resourceUri}"`;
                    }
                );

                htmlContent = htmlContent.replace(
                    /href="([^"]+\.css)"/g,
                    (match, href) => {
                        const resourceUri = webview.asWebviewUri(
                            vscode.Uri.joinPath(this._extensionUri, 'src', 'views', 'portfolioPage', href)
                        );
                        return `href="${resourceUri}"`;
                    }
                );

                // Inject theme class
                const themeKind = vscode.window.activeColorTheme.kind;
                const themeClass = themeKind === vscode.ColorThemeKind.Dark ? 'vscode-dark' :
                                 themeKind === vscode.ColorThemeKind.Light ? 'vscode-light' : 'vscode-high-contrast';

                htmlContent = htmlContent.replace(
                    /<body[^>]*>/,
                    `<body class="${themeClass}">`
                );

                return htmlContent;
            } else {
                throw new Error(`Portfolio page HTML file not found at ${htmlPath}`);
            }
        } catch (error) {
            console.error('Error loading portfolio page HTML:', error);
            // Return a basic error page instead of undefined
            return `
                <!DOCTYPE html>
                <html>
                <head><title>Error</title></head>
                <body>
                    <h1>Error loading portfolio page</h1>
                    <p>${error}</p>
                </body>
                </html>
            `;
        }
    }
}
