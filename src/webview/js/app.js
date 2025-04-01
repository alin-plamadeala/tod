class TDDApp {
    constructor() {
        this.vscode = acquireVsCodeApi();
        this.loadConfig();
        this.setupEventListeners();
    }

    setupEventListeners() {
        console.log('Setting up event listeners...');
        // Handle messages from the extension
        window.addEventListener('message', event => {
            console.log('Received message in webview:', event.data);
            const message = event.data;
            switch (message.type) {
                case 'testFileSelected':
                    console.log('Setting test file:', message.path);
                    document.getElementById('testFile').value = message.path;
                    break;
                case 'implementationFileSelected':
                    console.log('Setting implementation file:', message.path);
                    document.getElementById('implementationFile').value = message.path;
                    break;
                case 'testHistory':
                    console.log('Showing test history');
                    this.showHistory(message.history);
                    break;
                case 'testResult':
                    console.log('Handling test result');
                    this.handleTestResult(message.result);
                    break;
                case 'iterationComplete':
                    console.log('Showing feedback section for iteration:', message.iteration);
                    this.showFeedbackSection(message.iteration);
                    break;
            }
        });

        // Handle button clicks
        const selectTestFileBtn = document.getElementById('selectTestFile');
        const selectImplementationFileBtn = document.getElementById('selectImplementationFile');
        const runTDDBtn = document.getElementById('runTDD');
        const viewHistoryBtn = document.getElementById('viewHistory');
        const continueTDDBtn = document.getElementById('continueTDD');
        const stopTDDBtn = document.getElementById('stopTDD');

        console.log('Found buttons:', {
            selectTestFileBtn: !!selectTestFileBtn,
            selectImplementationFileBtn: !!selectImplementationFileBtn,
            runTDDBtn: !!runTDDBtn,
            viewHistoryBtn: !!viewHistoryBtn,
            continueTDDBtn: !!continueTDDBtn,
            stopTDDBtn: !!stopTDDBtn
        });

        selectTestFileBtn?.addEventListener('click', () => {
            console.log('Select test file button clicked');
            this.selectTestFile();
        });
        
        selectImplementationFileBtn?.addEventListener('click', () => {
            console.log('Select implementation file button clicked');
            this.selectImplementationFile();
        });
        
        runTDDBtn?.addEventListener('click', () => {
            console.log('Run TDD button clicked');
            this.runTDD();
        });
        
        viewHistoryBtn?.addEventListener('click', () => {
            console.log('View history button clicked');
            this.viewHistory();
        });

        continueTDDBtn?.addEventListener('click', () => {
            console.log('Continue TDD button clicked');
            this.continueTDD();
        });

        stopTDDBtn?.addEventListener('click', () => {
            console.log('Stop TDD button clicked');
            this.stopTDD();
        });
    }

    loadConfig() {
        const config = this.vscode.getState()?.config || {};
        document.getElementById('model').value = config.model || 'gpt-4';
        document.getElementById('apiKey').value = config.apiKey || '';
    }

    saveConfig() {
        const config = {
            model: document.getElementById('model').value,
            apiKey: document.getElementById('apiKey').value
        };
        this.vscode.setState({ config });
        this.vscode.postMessage({
            type: 'updateAIConfig',
            config
        });
    }

    selectTestFile() {
        console.log('Sending selectTestFile message');
        this.vscode.postMessage({ type: 'selectTestFile' });
    }

    selectImplementationFile() {
        console.log('Sending selectImplementationFile message');
        this.vscode.postMessage({ type: 'selectImplementationFile' });
    }

    runTDD() {
        console.log('Running TDD process');
        const testFile = document.getElementById('testFile').value;
        const implementationFile = document.getElementById('implementationFile').value;
        const model = document.getElementById('model').value;
        const apiKey = document.getElementById('apiKey').value;

        console.log('TDD parameters:', {
            testFile,
            implementationFile,
            model,
            apiKey: apiKey ? '***' : ''
        });

        if (!testFile) {
            this.showStatus('Please select a test file first', 'error');
            return;
        }

        if (!implementationFile) {
            this.showStatus('Please select an implementation file', 'error');
            return;
        }

        this.showStatus('Running TDD process...', 'info');
        this.vscode.postMessage({
            type: 'runTDD',
            testFile,
            implementationFile,
            model,
            apiKey
        });
    }

    viewHistory() {
        console.log('Sending showTestHistory message');
        this.vscode.postMessage({ type: 'showTestHistory' });
    }

    showHistory(history) {
        const historyContainer = document.getElementById('history');
        const historyContent = document.getElementById('historyContent');
        historyContainer.style.display = 'block';

        if (!history || history.results.length === 0) {
            historyContent.innerHTML = '<p>No test history available.</p>';
            return;
        }

        const historyHtml = history.results.map((result, index) => `
            <div class="history-item ${result.success ? 'success' : 'failure'}">
                <h4>Run ${index + 1}</h4>
                <div class="test-output">${this.escapeHtml(result.output)}</div>
                ${result.error ? `<div class="test-error">${this.escapeHtml(result.error)}</div>` : ''}
                ${result.reasoning ? `<div class="test-reasoning">${this.escapeHtml(result.reasoning)}</div>` : ''}
            </div>
        `).join('');

        historyContent.innerHTML = historyHtml;
    }

    showFeedbackSection(iteration) {
        const feedbackSection = document.getElementById('feedbackSection');
        const feedbackInput = document.getElementById('feedbackInput');
        
        if (feedbackSection && feedbackInput) {
            feedbackSection.style.display = 'block';
            feedbackInput.value = '';
            feedbackInput.focus();
        }
    }

    continueTDD() {
        const feedbackInput = document.getElementById('feedbackInput');
        const feedbackSection = document.getElementById('feedbackSection');
        
        if (feedbackSection) {
            feedbackSection.style.display = 'none';
        }

        const feedback = feedbackInput?.value || '';
        console.log('Sending feedback:', feedback);
        
        this.vscode.postMessage({
            type: 'continueTDD',
            feedback
        });
    }

    stopTDD() {
        const feedbackSection = document.getElementById('feedbackSection');
        if (feedbackSection) {
            feedbackSection.style.display = 'none';
        }

        console.log('Stopping TDD process');
        this.vscode.postMessage({
            type: 'stopTDD'
        });
    }

    handleTestResult(result) {
        const resultDiv = document.getElementById('result');
        if (!resultDiv) return;

        let html = '';
        
        // Add iteration info if available
        if (result.iteration) {
            html += `<div class="iteration-info">Iteration ${result.iteration}/${result.maxIterations}</div>`;
        }

        // Add test result
        html += `<div class="test-result ${result.success ? 'success' : 'failure'}">`;
        html += `<h3>${result.success ? '✅ Tests Passed' : '❌ Tests Failed'}</h3>`;
        html += `<pre>${result.output}</pre>`;
        html += `</div>`;

        // Add reasoning if available
        if (result.reasoning) {
            html += `<div class="reasoning">`;
            html += `<h3>Analysis</h3>`;
            html += `<pre>${result.reasoning}</pre>`;
            html += `</div>`;
        }

        // Add max iterations reached message if applicable
        if (result.maxIterationsReached) {
            html += `<div class="max-iterations-warning">`;
            html += `<h3>⚠️ Maximum Iterations Reached</h3>`;
            html += `<p>The TDD process has reached the maximum number of iterations (${result.maxIterations}). `;
            html += `Please review the results and consider running the process again with a different approach.</p>`;
            html += `</div>`;
        }

        resultDiv.innerHTML = html;
        this.showStatus(result.success ? 'Tests passed!' : 'Tests failed. Check the results for details.');
    }

    showStatus(message, type = 'info') {
        const statusElement = document.getElementById('status');
        if (!statusElement) return;

        statusElement.textContent = message;
        statusElement.className = `status ${type}`;
        statusElement.style.display = 'block';
    }

    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
}

// Initialize the app
window.addEventListener('DOMContentLoaded', () => {
    window.tddApp = new TDDApp();
}); 