class TDDApp {
    constructor() {
        this.vscode = acquireVsCodeApi();
        this.setupEventListeners();
        this.history = [];
        this.tddStarted = false;
    }

    requestTheme() {
        this.vscode.postMessage({type: 'requestTheme'});
    }

    setupEventListeners() {
        // Handle button clicks
        this.selectTestFileBtn = document.getElementById('selectTestFile');
        this.selectImplementationFileBtn = document.getElementById('selectImplementationFile');
        this.runTDDBtn = document.getElementById('runTDD');
        this.pauseTddCheckbox = document.getElementById('pauseCheckbox');

        console.log('Found buttons:', {
            selectTestFileBtn: !!this.selectTestFileBtn,
            selectImplementationFileBtn: !!this.selectImplementationFileBtn,
            runTDDBtn: !!this.runTDDBtn,
            pauseTddCheckbox: !!this.pauseTddCheckbox,
        });


        console.log('Setting up event listeners...');
        // Handle messages from the extension
        window.addEventListener('message', event => {
            console.log('Received message in webview:', event.data);
            const message = event.data;
            switch (message.type) {
                case 'themeChanged':
                    const htmlElement = document.documentElement;
                    htmlElement.setAttribute('data-theme', message.theme);
                    break;
                case 'testFileSelected':
                    console.log('Setting test file:', message.path);
                    document.getElementById('testFile').value = message.path;
                    break;
                case 'implementationFileSelected':
                    console.log('Setting implementation file:', message.path);
                    document.getElementById('implementationFile').value = message.path;
                    break;
                case 'codeGenerationRunning':
                    console.log('Code generation running');
                    this.showStatus('Code generation running...', 'info');
                    break;
                case 'codeGenerationCompleted':
                    console.log('Code generation completed');
                    this.showStatus('Code generation completed', 'success');
                    this.addHistoryItem({
                        timestamp: new Date(),
                        title: 'Code generation',
                        type: 'codeGenSuccess',
                        content: event.data.code
                    });
                    break;
                case 'codeGenerationFailed':
                    console.log('Code generation failed');
                    this.showStatus('Code generation failed', 'error');
                    this.addHistoryItem({
                        timestamp: new Date(),
                        title: 'Code generation failed',
                        type: 'codeGenFailed',
                        content: event.data.error
                    });
                    break;
                case 'testStarted':
                    console.log('Test running');
                    this.showStatus('Test started...', 'info');
                    break;
                case 'testFailed':
                    console.log('Test failed');
                    this.showStatus('Tests failed', 'error');
                    this.addHistoryItem({
                        timestamp: new Date(),
                        title: 'Test failed',
                        type: 'testFailed',
                        content: event.data.error,
                        output: event.data.output
                    });
                    break;
                case 'testPassed':
                    console.log('Test passed');
                    this.showStatus('Tests passed', 'success');
                    this.addHistoryItem({
                        timestamp: new Date(),
                        title: 'Test passed',
                        type: 'testPassed',
                    });
                    break;
                case 'updatePauseToggle':
                    console.log('Updating pause toggle:', event);
                    if (pauseTddCheckbox) {
                        pauseTddCheckbox.checked = event.data.value;
                    }
                    break;
            }
        });


        this.selectTestFileBtn?.addEventListener('click', () => {
            console.log('Select test file button clicked');
            this.selectTestFile();
        });

        this.selectImplementationFileBtn?.addEventListener('click', () => {
            console.log('Select implementation file button clicked');
            this.selectImplementationFile();
        });

        this.runTDDBtn?.addEventListener('click', () => {
            console.log('Run TDD button clicked');
            this.runTDD();
        });

        this.pauseTddCheckbox?.addEventListener('change', (e) => {
            console.log('Pause TDD checkbox changed:', e.target.checked);
            this.onPauseTddChange(e);
        });
    }


    onPauseTddChange(e) {
        console.log('Pause TDD checkbox changed:', e.target.checked);
        this.vscode.postMessage({type: 'setPause', pause: e.target.checked});
    }

    addHistoryItem(historyItem) {
        this.history.push(historyItem);
        const historyElement = document.getElementById('history');
        if (!historyElement) {
            return;
        }


        const item = document.createElement('details');
        item.classList.add('collapse', 'bg-base-100', 'border-base-300', 'border');

        const header = document.createElement('summary');
        header.classList.add('collapse-title', 'font-semibold');
        const formattedDate = historyItem.timestamp.toISOString().replace('T', ' ').replace(/\.\d+Z/, '');
        header.textContent = historyItem.title + ' - ' + formattedDate;


        if (historyItem.content) {
            const contentDiv = document.createElement('div');
            contentDiv.classList.add('collapse-content', 'text-sm');

            const codeContainer = document.createElement('div');
            // codeContainer.classList.add('mockup-code', 'w-full');

            const codePre = document.createElement('pre');
            const code = document.createElement('code');
            code.textContent = historyItem.content;
            codePre.appendChild(code);
            codeContainer.appendChild(codePre);
            contentDiv.appendChild(codeContainer);

            item.appendChild(contentDiv);
        }


        item.appendChild(header);

        historyElement.insertBefore(item, historyElement.firstChild);
    }

    selectTestFile() {
        console.log('Sending selectTestFile message');
        this.vscode.postMessage({type: 'selectTestFile'});
    }

    selectImplementationFile() {
        console.log('Sending selectImplementationFile message');
        this.vscode.postMessage({type: 'selectImplementationFile'});
    }

    stopTDD() {
        console.log('Stopping TDD process');
        this.vscode.postMessage({type: 'stopTDD'});
        this.tddStarted = false;

        if (this.runTDDBtn) {
            this.runTDDBtn.textContent = 'Start TDD Session';
        }

        if (this.selectImplementationFileBtn) {
            this.selectImplementationFileBtn.disabled = false;
        }
        if (this.selectTestFileBtn) {
            this.selectTestFileBtn.disabled = false;
        }
    }

    runTDD() {
        if (this.tddStarted) {
            this.stopTDD();
            this.showStatus('TDD process stopped.', 'info');
            return;
        }

        console.log('Running TDD process');
        const testFile = document.getElementById('testFile').value;
        const implementationFile = document.getElementById('implementationFile').value;

        console.log('TDD parameters:', {
            testFile,
            implementationFile,
        });

        if (!testFile) {
            this.showStatus('Please select a test file first', 'error');
            return;
        }

        if (!implementationFile) {
            this.showStatus('Please select an implementation file', 'error');
            return;
        }

        this.showStatus('TDD process started. Update the test file.', 'info');
        this.vscode.postMessage({
            type: 'runTDD',
            testFile,
            implementationFile,
        });

        if (this.selectImplementationFileBtn) {
            this.selectImplementationFileBtn.disabled = true;
        }
        if (this.selectTestFileBtn) {
            this.selectTestFileBtn.disabled = true;
        }

        this.tddStarted = true;

        if (this.runTDDBtn) {
            this.runTDDBtn.textContent = 'Stop TDD';
        }


    }

    showStatus(message, type = 'info') {
        const statusElement = document.getElementById('status');
        if (!statusElement) {
            return;
        }

        statusElement.textContent = message;
        statusElement.className = `alert alert-${type}`;
    }
}

// Initialize the app
window.addEventListener('DOMContentLoaded', () => {
    window.tddApp = new TDDApp();
    window.tddApp.requestTheme();
});