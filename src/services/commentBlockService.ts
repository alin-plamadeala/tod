import { SnippetString } from 'vscode';

export const generateRequirementCommentBlockSnippet = (): SnippetString => {
    const snippet = new SnippetString();
    snippet.appendText('\n\n// REQUIREMENT: ');
    snippet.appendPlaceholder('natural language requirements');
    return snippet;
};


export const extractRequirementsFromTestFile = (code: string): string[] => {
    const requirements: string[] = [];
    const lines = code.split('\n');
    for (const line of lines) {
        const match = line.match(/\/\/ REQUIREMENT: (.*)/);
        if (match) {
            requirements.push(match[1]);
        }
    }
    return requirements;
};

export const stripRequirementCommentsFromTestFile = (code: string): string => {
    return code.replace(/\/\/ REQUIREMENT: (.*)/g, '');
};