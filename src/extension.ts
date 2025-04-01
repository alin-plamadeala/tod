import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { AIService, AIConfig, AIPromptParams } from './services/aiService';
import { TestService, TestResult, TestHistory } from './services/testService';

interface TDDConfig {
    language: string;
    testFile: string;
}

export class TDDViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'aiTddView';
    public _view?: vscode.WebviewView;
    private disposables: vscode.Disposable[] = [];
    private readonly maxIterations: number;
    private outputChannel: vscode.OutputChannel;
    private readonly workspaceRoot: string;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly aiService: AIService,
        private readonly testService: TestService
    ) {
        this.maxIterations = vscode.workspace.getConfiguration('aiTdd').get<number>('maxIterations') || 5;
        this.outputChannel = vscode.window.createOutputChannel('AI TDD - extension');
        this.workspaceRoot = vscode.workspace.workspaceFolders![0].uri.fsPath;
    }

    private log(message: string, error?: any) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${message}`;
        this.outputChannel.appendLine(logMessage);
        if (error) {
            this.outputChannel.appendLine(`Error details: ${JSON.stringify(error, null, 2)}`);
        }
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        console.log('Resolving webview view...');
        this._view = webviewView;

        // Set webview options
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        // Set the webview's HTML content
        webviewView.webview.html = this.getWebviewContent(webviewView.webview);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(async (data) => {
            console.log('Received message in extension:', data);
            await this.handleWebviewMessage(data);
        });

        console.log('Webview view resolved successfully');
    }

    private async handleWebviewMessage(message: any) {
        console.log('Handling message:', message);
        switch (message.type) {
            case 'selectTestFile':
                console.log('Selecting test file...');
                await this.selectTestFile();
                break;
            case 'selectImplementationFile':
                console.log('Selecting implementation file...');
                await this.selectImplementationFile();
                break;
            case 'runTDD':
                console.log('Running TDD process...');
                await this.runTDDProcess(message.testFile, message.implementationFile, message.customPrompt);
                break;
            case 'showTestHistory':
                console.log('Showing test history...');
                this.showTestHistory();
                break;
            default:
                console.log('Unknown message type:', message.type);
        }
    }

    private async selectTestFile() {
        console.log('Finding test files...');
        const files = await vscode.workspace.findFiles('**/*.test.*');
        console.log('Found test files:', files);
        const fileItems = files.map(file => ({
            label: vscode.workspace.asRelativePath(file),
            description: file.fsPath,
            fsPath: file.fsPath
        }));

        const selected = await vscode.window.showQuickPick(fileItems, {
            placeHolder: 'Select a test file'
        });

        if (selected) {
            console.log('Selected test file:', selected.fsPath);
            this._view?.webview.postMessage({
                type: 'testFileSelected',
                path: selected.fsPath
            });
        }
    }

    private async selectImplementationFile() {
        console.log('Finding implementation files...');
        const files = await vscode.workspace.findFiles('**/*.{js,ts,py}');
        console.log('Found implementation files:', files);
        const fileItems = files.map(file => ({
            label: vscode.workspace.asRelativePath(file),
            description: file.fsPath,
            fsPath: file.fsPath
        }));

        const selected = await vscode.window.showQuickPick(fileItems, {
            placeHolder: 'Select an implementation file'
        });

        if (selected) {
            console.log('Selected implementation file:', selected.fsPath);
            this._view?.webview.postMessage({
                type: 'implementationFileSelected',
                path: selected.fsPath
            });
        }
    }

    private async runTDDProcess(
        testFile: string,
        implementationFile: string,
        initialFeedback?: string
    ): Promise<void> {
        try {
            const language = this.getLanguageFromFile(testFile);
            const testContent = await vscode.workspace.fs.readFile(vscode.Uri.file(testFile));
            const testCode = new TextDecoder().decode(testContent);

            // Verify implementation file exists and is writable
            try {
                await vscode.workspace.fs.stat(vscode.Uri.file(implementationFile));
            } catch (error) {
                throw new Error(`Implementation file ${implementationFile} does not exist or is not accessible`);
            }

            // Open the implementation file
            const doc = await vscode.workspace.openTextDocument(implementationFile);
            await vscode.window.showTextDocument(doc, { preview: true });

            let iteration = 0;
            let previousImplementation = '';
            let previousReasoning = '';
            let userFeedback = initialFeedback || '';

            while (iteration < this.maxIterations) {
                this.log(`Starting iteration ${iteration + 1} of ${this.maxIterations}`);

                // Generate implementation
                const implementation = await this.aiService.generateImplementation(
                    testCode,
                    language,
                    userFeedback,
                    previousImplementation,
                    previousReasoning
                );

                // Write implementation to the selected file
                await vscode.workspace.fs.writeFile(
                    vscode.Uri.file(implementationFile),
                    new TextEncoder().encode(implementation)
                );

                // Run tests against the selected implementation file
                const testResult = await this.testService.runTests(testFile, implementationFile);
                this.log(`Test result: ${testResult.success ? 'Passed' : 'Failed'}`);

                if (testResult.success) {
                    this.log('Tests passed!');
                    previousImplementation = implementation;
                } else {
                    // Generate reasoning for failure
                    const reasoning = await this.aiService.generateReasoning({
                        language,
                        testFile: testCode,
                        code: implementation,
                        error: testResult.error || '',
                        previousImplementation,
                        previousReasoning
                    });

                    previousImplementation = implementation;
                    previousReasoning = reasoning;
                }

                // Always show feedback section and wait for user input
                const newFeedback = await this.showFeedbackAndWait(testResult, previousReasoning, iteration);

                // After feedback, check if we should continue
                if (testResult.success && !newFeedback) {
                    break;
                }

                userFeedback += `* ${newFeedback}\n`;

                iteration++;
            }

            if (iteration >= this.maxIterations) {
                this.log('Reached maximum iterations');
            }
        } catch (error) {
            this.log('Error in TDD process', error);
            throw error;
        }
    }

    private async showFeedbackAndWait(
        testResult: TestResult, 
        previousReasoning: string,
        iteration: number
    ): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            const disposable = this._view?.webview.onDidReceiveMessage(
                async (message) => {
                    switch (message.type) {
                        case 'continueTDD':
                            this.log('User provided feedback, continuing TDD process');
                            resolve(message.feedback || '');
                            break;
                        case 'stopTDD':
                            this.log('User stopped TDD process');
                            reject(new Error('User stopped TDD process'));
                            break;
                    }
                }
            );

            if (disposable) {
                this.disposables.push(disposable);
            }

            // Send message to webview to show feedback section
            this._view?.webview.postMessage({
                type: 'iterationComplete',
                success: testResult.success,
                testResult: testResult,
                reasoning: previousReasoning,
                iteration: iteration + 1,
                maxIterations: this.maxIterations
            });
        });
    }

    private getLanguageFromFile(filePath: string): string {
        const extension = path.extname(filePath).toLowerCase();
        switch (extension) {
            case '.js':
            case '.jsx':
                return 'JavaScript';
            case '.ts':
            case '.tsx':
                return 'TypeScript';
            case '.py':
                return 'Python';
            default:
                return 'JavaScript';
        }
    }

    private async showTestHistory() {
        const history = this.testService.getHistory();
        this._view?.webview.postMessage({
            type: 'testHistory',
            history
        });
    }

    private async updateAIConfig(model: string, apiKey: string) {
        const config: AIConfig = {
            model,
            temperature: 0.3, // Default temperature
            apiKey
        };
        this.aiService.updateConfig(config);
        vscode.workspace.getConfiguration('aiTdd').update('model', model);
        vscode.workspace.getConfiguration('aiTdd').update('apiKey', apiKey);
    }

    private getWebviewContent(webview: vscode.Webview): string {
        // Get the HTML content
        const htmlPath = path.join(this._extensionUri.fsPath, 'src', 'webview', 'html', 'index.html');
        let htmlContent = fs.readFileSync(htmlPath, 'utf8');

        // Get the CSS content
        const cssPath = path.join(this._extensionUri.fsPath, 'src', 'webview', 'css', 'styles.css');
        const cssContent = fs.readFileSync(cssPath, 'utf8');

        // Get the JavaScript content
        const jsPath = path.join(this._extensionUri.fsPath, 'src', 'webview', 'js', 'app.js');
        const jsContent = fs.readFileSync(jsPath, 'utf8');

        // Replace the CSS and JS references with their content
        htmlContent = htmlContent.replace(
            '<link rel="stylesheet" href="css/styles.css">',
            `<style>${cssContent}</style>`
        );
        htmlContent = htmlContent.replace(
            '<script src="js/app.js"></script>',
            `<script>${jsContent}</script>`
        );

        // Add a script to ensure the app is initialized
        htmlContent = htmlContent.replace(
            '</body>',
            `<script>
                window.addEventListener('DOMContentLoaded', () => {
                    console.log('DOM Content Loaded');
                    window.tddApp = new TDDApp();
                });
            </script>
            </body>`
        );

        return htmlContent;
    }
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Activating AI TDD extension...');
    
    // Get AI configuration
    const config = vscode.workspace.getConfiguration('aiTdd');
    const aiConfig: AIConfig = {
        model: config.get<string>('model') || 'gpt-4',
        temperature: config.get<number>('temperature') || 0.3,
        apiKey: config.get<string>('apiKey') || ''
    };

    const workspaceRoot = vscode.workspace.workspaceFolders![0].uri.fsPath;
    const provider = new TDDViewProvider(
        context.extensionUri,
        new AIService(aiConfig),
        new TestService(workspaceRoot)
    );
    
    // Register the view provider
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(TDDViewProvider.viewType, provider)
    );

    // Register the command to open the view
    let disposable = vscode.commands.registerCommand('test-only-development.openTDDView', () => {
        console.log('Opening AI TDD view...');
        vscode.commands.executeCommand('workbench.view.extension.ai-tdd-explorer');
	});

	context.subscriptions.push(disposable);
    
    console.log('AI TDD extension activated successfully');
}

export function deactivate() {
    console.log('Deactivating AI TDD extension...');
}
