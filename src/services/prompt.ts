export interface PromptParams {
    export: string;
    language: string;
    testFile: string;
    testRunner: string;
    error: string;
    code: string;
    reasoning: string;
    motivation: string;
    input: string;
    userFeedback: string;
}

const JS_EXPORT = "All functions used in tests are imported without default imports";

const CODE_GEN_PROMPT = `
<MustReadCarefully>
__MOTIVATION__
</MustReadCarefully>

Take your time to generate the code and think step by step in resolving the issues.
<Reasoning For Error>
__REASONING__
</Reasoning For Error>

<Error>
__ERROR__
</Error>
`;

const ERROR_REASONING_PROMPT = `Take your time to explain why the following error occurred
<TestFile>
__TEST_FILE__
</TestFile>

<Code>
__CODE__
</Code>

<Error>
__ERROR__
</Error>

<Must>
    * You must fix the code file to conform to the test files requirements
    * You must not change the function signatures from how they are used in the test file
</Must>
`;

export function createPromptParamsFromLanguage(lang: string): PromptParams {
    switch (lang) {
        case "JavaScript":
            return {
                export: JS_EXPORT,
                motivation: "",
                language: lang,
                testFile: "",
                testRunner: "vitest",
                error: "",
                code: "",
                reasoning: "",
                input: "",
                userFeedback: ""
            };
        case "Python":
            return {
                export: "",
                motivation: "",
                language: lang,
                testFile: "",
                testRunner: "pytest",
                error: "",
                code: "",
                reasoning: "",
                input: "",
                userFeedback: ""
            };
        default:
            throw new Error("Incorrect language");
    }
}

function prompt(str: string, params: PromptParams): string {
    let prompt = str.replace(/__LANGUAGE__/g, params.language);
    prompt = prompt.replace(/__MOTIVATION__/g, params.motivation);
    prompt = prompt.replace(/__EXPORT__/g, params.export);
    prompt = prompt.replace(/__TEST_RUNNER__/g, params.testRunner);
    prompt = prompt.replace(/__TEST_FILE__/g, params.testFile);
    prompt = prompt.replace(/__ERROR__/g, params.error);
    prompt = prompt.replace(/__CODE__/g, params.code);
    prompt = prompt.replace(/__REASONING__/g, params.reasoning);
    prompt = prompt.replace(/__INPUT__/g, params.input);
    prompt = prompt.replace(/__USER_FEEDBACK__/g, params.userFeedback);
    return prompt;
}

export function reasonPrompt(params: PromptParams): string {
    return prompt(ERROR_REASONING_PROMPT, params);
}

export function codeGenPrompt(params: PromptParams, promptString: string): string {
    const newParams = { ...params };
    newParams.motivation = prompt(promptString, params);
    return prompt(CODE_GEN_PROMPT, newParams);
}
