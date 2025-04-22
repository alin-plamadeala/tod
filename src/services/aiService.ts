import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import * as vscode from 'vscode';
import {Message} from "./promptService";

export interface AIConfig {
    model: string;
    temperature: number;
    apiKey: string;
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
        messages: Message[]
    ): Promise<string> {
        this.log(`Generating implementation with ${messages.length} message. Total content len: ${messages.reduce((acc, m) => acc + m.content.length, 0)}`);

        try {
            let result: string;
            if (this.openai) {
                this.log('Using OpenAI for implementation generation');
                result = await this.generateWithOpenAI(messages);
            } else if (this.anthropic) {
                this.log('Using Anthropic for implementation generation');
                result = await this.generateWithAnthropic(messages);
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

    private async generateWithOpenAI(messages: Message[]): Promise<string> {
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


            let passedMessages: OpenAI.ChatCompletionMessageParam[] = messages;
            if (this.config.model.startsWith('o1')) {
                passedMessages = messages.map(m => m.role === 'system' ? ({...m, role: 'developer'}) : m);
            }

            const completion = await this.openai.chat.completions.create({
                model: this.config.model,
                messages: passedMessages,
                temperature: this.config.temperature,
            }, {signal: controller.signal});

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

    private async generateWithAnthropic(messages: Message[]): Promise<string> {
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


            const systemMessage = messages.find(m => m.role === 'system')?.content;

            if (!systemMessage) {
                this.log("No system message found in messages");
                throw new Error('No system message found in messages');
            }

            const passedMessages: Anthropic.MessageParam[] = messages.filter(m => m.role !== 'system').map(m => ({
                role: m.role,
                content: m.content
            }) as (Message & { role: Exclude<Message['role'], 'system'> }));


            const message = await this.anthropic.messages.create({
                model: this.config.model,
                max_tokens: 4096,
                system: systemMessage,
                messages: passedMessages,
                temperature: this.config.temperature,
            }, {signal: controller.signal});

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
}