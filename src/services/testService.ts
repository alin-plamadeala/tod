import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import {spawn} from 'child_process';

export interface TestResult {
    success: boolean;
    output: string;
    error?: string;
}

export interface TestHistory {
    runCount: number;
    results: TestResult[];
}

export class TestService {
    private history: TestHistory = {
        runCount: 0,
        results: []
    };
    private readonly dataDir: string;
    private outputChannel: vscode.OutputChannel;
    private readonly testTimeout: number = 30000; // 30 seconds timeout

    constructor(private readonly workspaceRoot: string) {
        this.outputChannel = vscode.window.createOutputChannel('AI TDD Tests');
        this.dataDir = path.join(workspaceRoot, '.vscode', 'ai-tdd');
        this.log('Initializing Test Service...');
        this.log(`Workspace root: ${workspaceRoot}`);
        this.log(`Data directory: ${this.dataDir}`);
        this.ensureDataDir();
        this.loadHistory();
    }

    private log(message: string, error?: any) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${message}`;
        this.outputChannel.appendLine(logMessage);
        if (error) {
            this.outputChannel.appendLine(`Error details: ${JSON.stringify(error, null, 2)}`);
        }
    }

    private ensureDataDir() {
        try {
            if (!fs.existsSync(this.dataDir)) {
                this.log(`Creating data directory: ${this.dataDir}`);
                fs.mkdirSync(this.dataDir, {recursive: true});
            }
        } catch (error) {
            this.log('Error creating data directory', error);
            throw error;
        }
    }

    private loadHistory() {
        const historyFile = path.join(this.dataDir, 'history.json');
        this.log(`Loading test history from: ${historyFile}`);
        try {
            if (fs.existsSync(historyFile)) {
                const data = fs.readFileSync(historyFile, 'utf8');
                this.history = JSON.parse(data);
                this.log(`Loaded history with ${this.history.results.length} results`);
            } else {
                this.log('No existing history file found, starting fresh');
            }
        } catch (error) {
            this.log('Error loading history', error);
            throw error;
        }
    }

    private saveHistory(result: TestResult) {
        this.log(`Saving test result to history: ${result.success ? 'Success' : 'Failed'}`);
        this.history.runCount++;
        this.history.results.push(result);
        this.log(`Test run ${this.history.runCount} completed. Success: ${result.success}`);

        // Save to file
        const historyPath = path.join(this.dataDir, 'test-history.json');
        fs.writeFileSync(historyPath, JSON.stringify(this.history, null, 2));
        this.log(`History saved to ${historyPath}`);
    }

    public async runTests(testFile: string, implementationFile: string): Promise<TestResult> {
        this.log(`Running tests for ${testFile} with implementation ${implementationFile}`);

        // Verify implementation file exists
        try {
            await vscode.workspace.fs.stat(vscode.Uri.file(implementationFile));
        } catch (error) {
            throw new Error(`Implementation file ${implementationFile} does not exist or is not accessible`);
        }

        const fileExtension = path.extname(testFile).toLowerCase();
        this.log(`Detected file extension: ${fileExtension}`);

        let result: TestResult;
        if (fileExtension === '.js' || fileExtension === '.ts') {
            this.log('Using Vitest runner');
            result = await this.runTest(testFile);
        } else {
            throw new Error(`Unsupported file extension: ${fileExtension}`);
        }

        // Save test result to history
        this.saveHistory(result);

        return result;
    }

    private async runTest(testFile: string): Promise<TestResult> {
        this.log(`Running Vitest for file: ${testFile}`);
        try {
            const startTime = Date.now();
            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                controller.abort();
                this.log('Vitest execution timed out after ' + this.testTimeout + 'ms');
            }, this.testTimeout);

            try {
                // Get Node.js path from configuration or use default
                const config = vscode.workspace.getConfiguration('aiTdd');
                const nodePath = config.get<string>('nodePath') || process.execPath;
                this.log(`Using Node.js at: ${nodePath}`);

                // Get vitest entrypoint
                const vitestEntry = path.join(this.workspaceRoot, 'node_modules', 'vitest', 'vitest.mjs');

                if (!fs.existsSync(vitestEntry)) {
                    throw new Error(`Vitest not found at ${vitestEntry}`);
                }

                this.log(`Executing command: ${nodePath} ${vitestEntry} --run ${testFile}`);

                const vitestProcess = spawn(nodePath, [vitestEntry, '--run', testFile], {
                    signal: controller.signal,
                    env: {
                        ...process.env,
                        NODE_PATH: path.join(this.workspaceRoot, 'node_modules'),
                    },
                    cwd: this.workspaceRoot,
                });

                let output = '';
                let errorOutput = '';

                // Collect output
                vitestProcess.stdout.on('data', (data) => {
                    output += data.toString();
                    this.log(`Vitest output: ${data.toString()}`);
                });
    

  
                vitestProcess.stderr.on('data', (data) => {
                    errorOutput += data.toString();
                    this.log(`Vitest error: ${data.toString()}`);
                });

                // Wait for process to complete
                const exitCode = await new Promise<number>((resolve, reject) => {
                    vitestProcess.on('close', (code) => {
                        clearTimeout(timeoutId);
                        resolve(code || 0);
                    });

                    vitestProcess.on('error', (err) => {
                        clearTimeout(timeoutId);
                        reject(err);
                    });
                });

                const duration = Date.now() - startTime;
                this.log(`Vitest completed in ${duration}ms with exit code ${exitCode}`);

                return {
                    success: exitCode === 0,
                    output: output,
                    error: errorOutput || undefined
                };
            } catch (error) {
                clearTimeout(timeoutId);
                throw error;
            }
        } catch (error) {
            this.log('Error running Vitest', error);
            const isTimeout = error instanceof Error && error.name === 'AbortError';
            return {
                success: false,
                output: isTimeout ? `Test execution timed out after ${this.testTimeout / 1000} seconds` : error instanceof Error ? error.message : 'Unknown error',
                error: isTimeout ? `Test execution timed out after ${this.testTimeout / 1000} seconds` : error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }
}