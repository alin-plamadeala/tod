import * as vscode from "vscode";
import {TestResult} from "./testService";
import fs from "fs";
import path from "path";
import {extractRequirementsFromTestFile, stripRequirementCommentsFromTestFile} from "./commentBlockService";


export type Message = {
    role: 'system' | 'user' | 'assistant';
    type: 'testFile' | 'implementation' | 'testResult' | 'system' | 'requirements';
    content: string;
}

const rolePrompt = `You are a Senior Software Engineer that has been tasked with fixing failing tests in a codebase.
I will provide you with the test file content, and you will need to update the implementation file to make the tests pass.
If the tests fail, I will provide you with the test output and error message.

When you see a test failing, you fix it, every time, first try

You are an engineer that only responds with code. No docs. No comments. Only code.

You don't respond with Markdown EVER.  Its ONLY code.
No XML
No Markdown

As a Sr Engineer you pay special attention to the errors and the type mismatches that can arise in the code.`;

export class TddConversationPrompt {
    outputChannel: vscode.OutputChannel;
    conversation: Message[] = [];
    dataDir: string;

    constructor(public programmingLanguage: 'TypeScript', public testRunner: 'vitest', public sessionName: string) {
        this.outputChannel = vscode.window.createOutputChannel('TddConversationPrompt');
        this.log('Initializing AI Service...');

        this.addInitialPrompt();
        const workspaceRoot = vscode.workspace.workspaceFolders![0].uri.fsPath;
        this.dataDir = `${workspaceRoot}/.vscode/ai-tdd/`;
        this.ensureDataDir();
    }

    private addInitialPrompt() {
        this.conversation.push({
            role: 'system',
            type: 'system',
            content: `${rolePrompt}
The code will be in ${this.programmingLanguage} and the tests are running using the ${this.testRunner} test runner.`
        });
    }

    private log(message: string, error?: any) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${message}`;
        this.outputChannel.appendLine(logMessage);
        if (error) {
            this.outputChannel.appendLine(`Error details: ${JSON.stringify(error, null, 2)}`);
        }
    }

    public addTestFileMessage(testFile: string) {
        const isFirstTestFile = this.conversation.filter(m => m.type === 'testFile').length === 0;

        const requirements = extractRequirementsFromTestFile(testFile);
        const cleanTest = stripRequirementCommentsFromTestFile(testFile);


        const message = (isFirstTestFile ? 'This is the test file content: \n' : 'I have updated the test file content. Now it looks like this:\n') + `<TEST_FILE_CONTENT>${cleanTest}</TEST_FILE_CONTENT>`;

        if (requirements.length > 0) {
            this.conversation.push({
                role: 'user',
                type: 'requirements',
                content: `Please pay special attention to the following requirements/constraints: ${requirements.map(r => `<REQUIREMENT>${r}</REQUIREMENT>`).join(', ')}`
            });
        }

        this.log(`Adding Requirement: ${requirements}`);

        this.conversation.push({
            role: 'user',
            type: 'testFile',
            content: message
        });
    }

    public addImplementationMessage(implementation: string) {
        this.conversation.push({
            role: 'assistant',
            type: 'implementation',
            content: `This is the implementation file content: <IMPLEMENTATION_FILE_CONTENT>${implementation}</IMPLEMENTATION_FILE_CONTENT>`
        });
    }


    public addTestRunResult(testResult: TestResult) {
        this.conversation.push({
            role: 'user',
            type: 'testResult',
            content: testResult.success ? 'All tests passed' : `Some tests failed: <FAILED_TESTS_OUTPUT>${testResult.output}</FAILED_TESTS_OUTPUT> <ERROR>${testResult.error}</ERROR>`
        });
    }


    public getMessages(): Message[] {
        const conversationLength = this.conversation.length;

        const truncSize = 2;

        const messagesLength = this.conversation.map(m => m.content.length).reduce((a, b) => a + b, 0);
        this.log(`Conversation length: ${conversationLength}, total characters: ${messagesLength}`);

        const lastTestFileMessages = this.conversation.filter(m => m.type === 'testFile').slice(-truncSize);
        const lastImplementationMessages = this.conversation.filter(m => m.type === 'implementation').slice(-truncSize);
        const lastTestResultMessages = this.conversation.filter(m => m.type === 'testResult').slice(-truncSize);
        const lastRequirementMessages = this.conversation.filter(m => m.type === 'requirements').slice(-truncSize);

        const filteredMessages = this.conversation.filter(m => m.role === 'system' || [...lastTestFileMessages, ...lastImplementationMessages, ...lastTestResultMessages, ...lastRequirementMessages].includes(m));

        this.log(`Filtered conversation length: ${filteredMessages.length}, total characters: ${filteredMessages.map(m => m.content.length).reduce((a, b) => a + b, 0)}`);

        return filteredMessages;
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

    public saveConversation() {
        const conversationPath = path.join(this.dataDir, `${this.sessionName}.json`);
        fs.writeFileSync(conversationPath, JSON.stringify(this.conversation, null, 2));
        this.log(`Conversation saved to ${conversationPath}`);
    }

}