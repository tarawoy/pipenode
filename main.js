const axios = require('axios');
const cron = require('node-cron');
const fs = require('fs').promises;
const path = require('path');
const chalk = require('chalk'); // For colorful console output


class NetworkTester {
    constructor() {
        this.config = {
            backendUrl: 'https://pipe-network-backend.pipecanary.workers.dev/api',
            testInterval: '*/30 * * * *', // Every 30 minutes
            timeout: 5000,
            logFile: path.join(__dirname, 'network_test_log.json')
        };
    }


    // Centralized logging with preview
    async logTestResult(testResult) {
        try {
            // Prepare log entry
            const logEntry = {
                timestamp: new Date().toISOString(),
                ...testResult
            };


            // Read existing logs
            let logs = [];
            try {
                const existingLogs = await fs.readFile(this.config.logFile, 'utf8');
                logs = JSON.parse(existingLogs);
            } catch (readError) {
                // File might not exist yet
                console.warn('Creating new log file');
            }


            // Add new log entry
            logs.push(logEntry);


            // Limit log size (keep last 100 entries)
            logs = logs.slice(-100);


            // Write logs back to file
            await fs.writeFile(this.config.logFile, JSON.stringify(logs, null, 2));


            // Console preview
            this.previewTestResult(logEntry);
        } catch (error) {
            console.error('Logging error:', error);
        }
    }


    // Preview test result in console
    previewTestResult(result) {
        console.log(chalk.bold.blue('=== Test Result Preview ==='));
        console.log(chalk.green(`Timestamp: ${result.timestamp}`));
        
        if (result.nodes) {
            result.nodes.forEach(node => {
                const statusColor = node.latency > 0 ? chalk.green : chalk.red;
                console.log(chalk.yellow(`Node ID: ${node.node_id}`));
                console.log(statusColor(`IP: ${node.ip}`));
                console.log(statusColor(`Latency: ${node.latency}ms`));
                console.log(statusColor(`Status: ${node.status}`));
                console.log('---');
            });
        }


        if (result.error) {
            console.log(chalk.red('Error Details:'), result.error);
        }


        console.log(chalk.bold.blue('=== End of Preview ===\n'));
    }


    // Enhanced node testing with detailed response tracking
    async runNodeTests() {
        const testResult = {
            nodes: []
        };


        try {
            // Fetch nodes with detailed error handling
            const nodesResponse = await this.safeApiCall(() => 
                axios.get(`${this.config.backendUrl}/nodes`)
            );


            if (!nodesResponse || !nodesResponse.data) {
                throw new Error('No nodes found');
            }


            const nodes = nodesResponse.data;


            // Test each node with detailed tracking
            for (const node of nodes) {
                const nodeTestResult = await this.testSingleNode(node);
                testResult.nodes.push(nodeTestResult);
            }


            // Log comprehensive test results
            await this.logTestResult(testResult);


            return testResult;
        } catch (error) {
            console.error('Comprehensive node testing failed:', error);
            await this.logTestResult({ 
                error: error.message, 
                stack: error.stack 
            });
        }
    }


    // Safe API call wrapper with detailed error handling
    async safeApiCall(apiCall) {
        try {
            const response = await apiCall();
            return {
                status: response.status,
                data: response.data,
                headers: response.headers
            };
        } catch (error) {
            console.error('API Call Error:', {
                message: error.message,
                code: error.code,
                response: error.response ? {
                    status: error.response.status,
                    data: error.response.data
                } : null
            });
            return null;
        }
    }


    // Enhanced single node testing
    async testSingleNode(node) {
        const start = Date.now();
        
        try {
            const response = await this.safeApiCall(() => 
                axios.get(`http://${node.ip}`, { timeout: this.config.timeout })
            );


            const latency = Date.now() - start;
            
            return {
                node_id: node.node_id,
                ip: node.ip,
                latency: latency,
                status: latency > 0 ? 'online' : 'offline',
                responseDetails: response
            };
        } catch (error) {
            return {
                node_id: node.node_id,
                ip: node.ip,
                latency: -1,
                status: 'offline',
                error: error.message
            };
        }
    }


    // Setup scheduled testing
    startScheduledTesting() {
        console.log(chalk.green('Network Testing Scheduler Activated'));
        
        // Run immediately on startup
        this.runNodeTests();


        // Schedule periodic tests
        cron.schedule(this.config.testInterval, () => {
            console.log(chalk.yellow('Scheduled Network Test Initiated'));
            this.runNodeTests();
        });
    }
}


// Initialize and start the network tester
const networkTester = new NetworkTester();
networkTester.startScheduledTesting();
