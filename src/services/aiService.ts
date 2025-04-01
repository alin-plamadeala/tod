import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import * as vscode from 'vscode';
import { PromptParams, createPromptParamsFromLanguage, reasonPrompt, codeGenPrompt } from './prompt';

export interface AIConfig {
    model: string;
    temperature: number;
    apiKey: string;
}

export interface AIPromptParams {
    language: string;
    testFile: string;
    code?: string;
    error?: string;
    reasoning?: string;
    input?: string;
}

export class AIService {
    private openai: OpenAI | null = null;
    private anthropic: Anthropic | null = null;
    private config: AIConfig;
    private readonly timeout: number = 60000; // 60 seconds timeout
    private outputChannel: vscode.OutputChannel;

    constructor(config: AIConfig) {
        this.config = config;
        this.outputChannel = vscode.window.createOutputChannel('AI TDD');
        this.log('Initializing AI Service...');
        this.initializeClients();
    }

    private log(message: string, error?: any) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${message}`;
        this.outputChannel.appendLine(logMessage);
        if (error) {
            this.outputChannel.appendLine(`Error details: ${JSON.stringify(error, null, 2)}`);
        }
    }

    private initializeClients() {
        this.log(`Initializing AI clients with model: ${this.config.model}`);
        try {
            if (this.config.model.startsWith('gpt')) {
                this.openai = new OpenAI({
                    apiKey: this.config.apiKey
                });
                this.log('OpenAI client initialized');
            } else if (this.config.model.startsWith('claude')) {
                this.anthropic = new Anthropic({
                    apiKey: this.config.apiKey
                });
                this.log('Anthropic client initialized');
            } else {
                this.log(`Warning: Unknown model type ${this.config.model}`);
            }
        } catch (error) {
            this.log('Error initializing AI clients', error);
            throw error;
        }
    }

    public async generateImplementation(
        testCode: string,
        language: string,
        userFeedback: string = '',
        previousImplementation: string = '',
        previousReasoning: string = ''
    ): Promise<string> {
        const prompt = this.generateCodePrompt(testCode, language,userFeedback, previousImplementation, previousReasoning);
        this.log(`Generating implementation with prompt length: ${prompt.length}`);

        try {
            let result: string;
            if (this.openai) {
                this.log('Using OpenAI for implementation generation');
                result = await this.generateWithOpenAI(prompt);
            } else if (this.anthropic) {
                this.log('Using Anthropic for implementation generation');
                result = await this.generateWithAnthropic(prompt);
            } else {
                throw new Error('No AI client initialized');
            }
            this.log('Successfully generated implementation. Length: ' + result.length);
            return result;
        } catch (error) {
            this.log('Error generating implementation', error);
            throw error;
        }
    }

    public async generateReasoning(params: {
        language: string;
        testFile: string;
        code: string;
        error: string;
        previousImplementation?: string;
        previousReasoning?: string;
    }): Promise<string> {
        const prompt = this.generateReasoningPrompt(params);
        this.log(`Generating reasoning with prompt length: ${prompt.length}`);

        try {
            let result: string;
            if (this.openai) {
                this.log('Using OpenAI for reasoning generation');
                result = await this.generateWithOpenAI(prompt);
            } else if (this.anthropic) {
                this.log('Using Anthropic for reasoning generation');
                result = await this.generateWithAnthropic(prompt);
            } else {
                throw new Error('No AI client initialized');
            }
            this.log('Successfully generated reasoning. Length: ' + result.length);
            return result;
        } catch (error) {
            this.log('Error generating reasoning', error);
            throw error;
        }
    }

    private generateCodePrompt(
        testCode: string,
        language: string,
        userFeedback: string = '',
        previousImplementation: string = '',
        previousReasoning: string = ''
    ): string {
        const params = createPromptParamsFromLanguage(language);
        params.testFile = testCode;
        params.code = previousImplementation;
        params.reasoning = previousReasoning;
        params.userFeedback = userFeedback;
        params.motivation = `You are a Senior Software Engineer

When you see a test failing, you fix it, every time, first try
And look, this test provided is failing, but you never worry, you can fix it

You are an engineer that only responds with code. No docs. No comments. Only code.

You don't respond with Markdown EVER.  Its ONLY code.
No XML
No Markdown

As a Sr Engineer you pay special attention to the errors and the type mismatches that can arise in the code.
<test>
__TEST_FILE__
</test>

You should also take into consideration the following inputs:
<inputs>
__USER_FEEDBACK__
</inputs>
`;

        const prompt = codeGenPrompt(params, params.motivation);

        this.log(`Code generation prompt: ${prompt}`);
        return prompt;
    }

    private generateReasoningPrompt(params: {
        language: string;
        testFile: string;
        code: string;
        error: string;
        previousImplementation?: string;
        previousReasoning?: string;
    }): string {
        const promptParams = createPromptParamsFromLanguage(params.language);
        promptParams.testFile = params.testFile;
        promptParams.code = params.code;
        promptParams.error = params.error;
        promptParams.reasoning = params.previousReasoning || '';
        promptParams.input = params.previousImplementation || '';

        const prompt = reasonPrompt(promptParams);

        this.log(`Reasoning prompt: ${prompt}`);
        return prompt;
    }

    private async generateWithOpenAI(prompt: string): Promise<string> {
        if (!this.openai) {
            this.log('Error: OpenAI client not initialized');
            throw new Error('OpenAI client not initialized');
        }

        this.log(`Making OpenAI API call with model ${this.config.model}`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort();
            this.log('OpenAI API call timed out after ' + this.timeout + 'ms');
        }, this.timeout);

        try {
            const startTime = Date.now();


            // TODO: if o1 replace system with developer

            const completion = await this.openai.chat.completions.create({
                model: this.config.model,
                messages: [{ role: 'user', content: prompt }],
                temperature: this.config.temperature,
            }, { signal: controller.signal });

            const duration = Date.now() - startTime;
            this.log(`OpenAI API call completed in ${duration}ms`);

            clearTimeout(timeoutId);
            return completion.choices[0].message.content || '';
        } catch (error) {
            clearTimeout(timeoutId);
            this.log('Error in OpenAI API call', error);
            throw error;
        }
    }

    private async generateWithAnthropic(prompt: string): Promise<string> {
        if (!this.anthropic) {
            this.log('Error: Anthropic client not initialized');
            throw new Error('Anthropic client not initialized');
        }

        this.log(`Making Anthropic API call with model ${this.config.model}`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort();
            this.log('Anthropic API call timed out after ' + this.timeout + 'ms');
        }, this.timeout);

        try {
            const startTime = Date.now();
            const message = await this.anthropic.messages.create({
                model: this.config.model,
                max_tokens: 4096,
                messages: [{ role: 'user', content: prompt }],
                temperature: this.config.temperature,
            }, { signal: controller.signal });

            const duration = Date.now() - startTime;
            this.log(`Anthropic API call completed in ${duration}ms`);

            clearTimeout(timeoutId);

            const content = message.content[0].text;

            console.log('Anthropic content: ' + content);

            return content;
        } catch (error) {
            clearTimeout(timeoutId);
            this.log('Error in Anthropic API call', error);
            throw error;
        }
    }

    public updateConfig(config: AIConfig) {
        this.log('Updating AI configuration', {
            oldModel: this.config.model,
            newModel: config.model,
            oldTemp: this.config.temperature,
            newTemp: config.temperature
        });
        this.config = config;
        this.initializeClients();
    }
} 