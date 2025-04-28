import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {AIService, AIConfig,} from './services/aiService';
import {TestService, TestResult} from './services/testService';
import {TddConversationPrompt} from "./services/promptService";
import {generateRequirementCommentBlockSnippet} from "./services/commentBlockService";


export class TDDViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'aiTddView';
    public _view?: vscode.WebviewView;
    private disposables: vscode.Disposable[] = [];
    private readonly maxIterations: number;
    private outputChannel: vscode.OutputChannel;

    private paused: boolean = false;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly aiService: AIService,
        private readonly testService: TestService,
    ) {
        this.maxIterations = vscode.workspace.getConfiguration('aiTdd').get<number>('maxIterations') || 5;
        this.outputChannel = vscode.window.createOutputChannel('AI TDD - extension');
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
            localResourceRoots: [this._extensionUri],
        };

        // Set the webview's HTML content
        webviewView.webview.html = this.getWebviewContent(webviewView.webview);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(async (data) => {
            console.log('Received message in extension:', data);
            await this.handleWebviewMessage(data);
        });

        vscode.window.onDidChangeActiveColorTheme((theme) => {
            this._view?.webview.postMessage({
                type: 'themeChanged',
                theme: theme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light'
            });
        });

        console.log('Webview view resolved successfully');
    }

    public onPause(value: boolean) {
        this._view?.webview.postMessage({
            type: 'updatePauseToggle',
            value: value
        });
        this.paused = value;
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
                await this.runTDDProcess(message.testFile, message.implementationFile);
                break;
            case 'setPause':
                console.log('Setting pause...');
                this.onPause(message.pause);
                break;
            case 'requestTheme':
                const theme = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark ? 'dark' : 'light';
                this._view?.webview.postMessage({
                    type: 'themeChanged',
                    theme: theme
                });
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
        const files = await vscode.workspace.findFiles('**/*.ts', 'node_modules');
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
    ): Promise<void> {
        try {
            const language = this.getLanguageFromFile(testFile);
            const testRunner = this.getTestRunnerFromLanguage(language);

            const session = new Date().toISOString().replace(/[:.]/g, '-');

            const conversation = new TddConversationPrompt(language, testRunner, session);

            this.log("Starting TDD process");

            // Open the implementation file and the test file side by side
            const doc = await vscode.workspace.openTextDocument(implementationFile);
            await vscode.window.showTextDocument(doc, {preview: false, viewColumn: vscode.ViewColumn.Two});

            const testDoc = await vscode.workspace.openTextDocument(testFile);
            const editor = await vscode.window.showTextDocument(testDoc, {
                preview: false,
                viewColumn: vscode.ViewColumn.One
            });

            // Find the position of the last import
            const lines = testDoc.getText().split('\n');
            const lastImportIndex = lines.reduceRight((lastIndex, line, index) => {
                if (lastIndex === -1 && line.startsWith('import ')) {
                    return index;
                }
                return lastIndex;
            }, -1);


            // Insert the comment block below the last import in editor
            const commentBlock = generateRequirementCommentBlockSnippet();
            editor.insertSnippet(commentBlock, new vscode.Position(lastImportIndex + 1, 0));


            const d = vscode.workspace.onDidSaveTextDocument(async (event) => {
                // Check if the changed document is the test file you're interested in
                const filePath = event.fileName;
                this.log('File changed:', filePath);

                if (filePath === testFile && !this.paused) {
                    // Verify implementation file exists and is writable
                    try {
                        await vscode.workspace.fs.stat(vscode.Uri.file(implementationFile));
                    } catch (error) {
                        throw new Error(`Implementation file ${implementationFile} does not exist or is not accessible`);
                    }
                    const testContent = await vscode.workspace.fs.readFile(vscode.Uri.file(testFile));
                    const testCode = new TextDecoder().decode(testContent);
                    conversation.addTestFileMessage(testCode);

                    let testResult: TestResult | undefined;
                    let iteration = 0;

                    while (testResult?.success !== true && iteration < this.maxIterations) {
                        iteration++;

                        this.log(`Iteration ${iteration} of TDD process`);

                        const implementation = await this.runCodeGeneration(conversation, implementationFile);
                        conversation.addImplementationMessage(implementation);

                        testResult = await this.runTests(testFile, implementationFile);
                        conversation.addTestRunResult(testResult);
                    }
                    conversation.saveConversation();
                }
            });

            this.disposables.push(d);


        } catch (error) {
            this.log('Error in TDD process', error);
            throw error;
        }
    }


    private async runTests(testFile: string, implementationFile: string) {
        try {
            this._view?.webview.postMessage({
                type: 'testStarted',
            });

            const result = await this.testService.runTests(testFile, implementationFile);
            this.log(`Test result: ${result.success ? 'Passed' : 'Failed'}`);
            if (result.success) {
                this._view?.webview.postMessage({
                    type: 'testPassed',
                });
            } else {
                this._view?.webview.postMessage({
                    type: 'testFailed',
                    output: result.output,
                    error: result.error
                });
            }

            return result;
        } catch (e) {
            this._view?.webview.postMessage({
                type: 'testFailed',
                error: (e as Error).message,
            });
            throw e;
        }
    }

    private async runCodeGeneration(conversation: TddConversationPrompt, implementationFile: string) {
        this._view?.webview.postMessage({
            type: 'codeGenerationRunning',
        });

        try {
            // Generate implementation
            const implementation = await this.aiService.generateImplementation(
                conversation.getMessages()
            );

            // Write implementation to the selected file
            await vscode.workspace.fs.writeFile(
                vscode.Uri.file(implementationFile),
                new TextEncoder().encode(implementation)
            );
            this._view?.webview.postMessage({
                type: 'codeGenerationCompleted',
                code: implementation,
            });

            return implementation;
        } catch (e) {
            this._view?.webview.postMessage({
                type: 'codeGenerationFailed',
                error: (e as Error).message,
            });
            throw e;
        }
    }

    private getLanguageFromFile(filePath: string): 'TypeScript' {
        const extension = path.extname(filePath).toLowerCase();
        switch (extension) {
            // case '.js':
            // case '.jsx':
            //     return 'JavaScript';
            case '.ts':
            case '.tsx':
                return 'TypeScript';
            // case '.py':
            //     return 'Python';
            default:
                throw new Error(`Unknown language for file: ${filePath}`);
        }
    }

    private getTestRunnerFromLanguage(language: string): 'vitest' {
        switch (language) {
            case 'TypeScript':
                return 'vitest';
            default:
                throw new Error(`Unknown test runner for language: ${language}`);
        }
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

    dispose() {
        this.disposables.forEach(disposable => disposable.dispose());
        this.outputChannel.dispose();
    }
}

let provider: TDDViewProvider;

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
    provider = new TDDViewProvider(
        context.extensionUri,
        new AIService(aiConfig),
        new TestService(workspaceRoot)
    );

    // Register the view provider
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(TDDViewProvider.viewType, provider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true,
                }
            })
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

    // Dispose of all disposables
    if (provider) {
        provider.dispose();
    }

    console.log('AI TDD extension deactivated successfully');
}