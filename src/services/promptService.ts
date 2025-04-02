import * as vscode from "vscode";
import {TestResult} from "./testService";


export type Message = {
    role: 'system' | 'user' | 'assistant';
    type: 'testFile' | 'implementation' | 'testResult' | 'system'
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

class TddConversationPrompt {
    outputChannel: vscode.OutputChannel;
    conversation: Message[] = [];

    constructor(public programmingLanguage: 'TypeScript', public testRunner: 'vitest') {
        this.outputChannel = vscode.window.createOutputChannel('TddConversationPrompt');
        this.log('Initializing AI Service...');

        this.addInitialPrompt();
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

        this.conversation.push({
            role: 'user',
            type: 'testFile',
            content: (isFirstTestFile ? 'This is the test file content' : 'I have updated the test file content. Now it looks like this:') + `<TEST_FILE_CONTENT>${testFile}</TEST_FILE_CONTENT>`
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

        //  TODO: truncate conversation if it is too long

        const messagesLength = this.conversation.map(m => m.content.length).reduce((a, b) => a + b, 0);

        this.log(`Conversation length: ${conversationLength}, total characters: ${messagesLength}`);
        return this.conversation;
    }

}