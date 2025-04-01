# AI-Enabled TDD VSCode Extension

This VSCode extension provides a user interface for AI-enabled Test-Driven Development (TDD). It integrates with a binary executable that handles the core TDD logic.

## Features

- Visual interface for configuring and running AI TDD process
- Support for multiple programming languages
- Configurable model parameters (temperature, model type)
- Interactive mode support
- Test file selection
- Real-time feedback on TDD process

## Requirements

- VSCode 1.98.0 or higher
- The TDD binary executable installed and accessible in your PATH

## Extension Settings

This extension contributes the following settings:

* `aiTdd.binaryPath`: Path to the TDD binary executable
* `aiTdd.defaultLanguage`: Default programming language for TDD
* `aiTdd.defaultModel`: Default AI model to use
* `aiTdd.defaultTemperature`: Default temperature setting for the model

## Usage

1. Open the AI TDD view from the activity bar
2. Select your test file using the file picker
3. Configure the TDD parameters:
   - Programming language
   - AI model
   - Temperature
   - Interactive mode (optional)
4. Click "Run TDD Process" to start the AI-enabled TDD cycle

## Known Issues

- Make sure the TDD binary is properly installed and accessible
- The extension requires appropriate permissions to execute the binary

## Release Notes

### 0.0.1

Initial release of AI-Enabled TDD extension:
- Basic UI for TDD configuration
- Support for test file selection
- Integration with TDD binary executable

---

## Following extension guidelines

Ensure that you've read through the extensions guidelines and follow the best practices for creating your extension.

* [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

## Working with Markdown

You can author your README using Visual Studio Code. Here are some useful editor keyboard shortcuts:

* Split the editor (`Cmd+\` on macOS or `Ctrl+\` on Windows and Linux).
* Toggle preview (`Shift+Cmd+V` on macOS or `Shift+Ctrl+V` on Windows and Linux).
* Press `Ctrl+Space` (Windows, Linux, macOS) to see a list of Markdown snippets.

## For more information

* [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

**Enjoy!**
