const WebSocket = require('ws');
const http = require('http');

console.log('\n=== Testing WebSocket Admin Authentication ===\n');

// Get credentials from environment variables or use defaults
const username = process.env.TEST_USERNAME || 'admin';
const password = process.env.TEST_PASSWORD || 'admin123';
const apiUrl = process.env.API_URL || 'localhost:5001';
const wsUrl = process.env.WS_URL || 'localhost:5001';

// Test 1: Connection without token (should fail)
console.log('Test 1: Connecting WITHOUT token (should be rejected)...');
const ws1 = new WebSocket(`ws://${wsUrl}/ws?role=admin`);

ws1.on('open', () => {
    console.log('❌ FAIL: Connection opened without token (should have been rejected)');
    ws1.close();
});

ws1.on('close', (code, reason) => {
    console.log(`✅ PASS: Connection closed - Code: ${code}, Reason: ${reason.toString()}`);

    // Test 2: Connection with valid token (should succeed)
    setTimeout(() => {
        getTokenAndTest();
    }, 1000);
});

ws1.on('error', (err) => {
    console.log(`✅ PASS: Connection rejected with error: ${err.message}`);
});

async function getTokenAndTest() {
    console.log('\nGenerating fresh token via login API...');

    try {
        const token = await loginAndGetToken();
        console.log('Token obtained successfully');
        testWithToken(token);
    } catch (error) {
        console.error('❌ FAIL: Could not obtain token:', error.message);
        console.log('\nMake sure:');
        console.log('1. Backend is running on http://localhost:5001');
        console.log(`2. User '${username}' exists with password '${password}'`);
        console.log('3. Or set TEST_USERNAME and TEST_PASSWORD environment variables');
        process.exit(1);
    }
}

function loginAndGetToken() {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({
            username: username,
            password: password
        });

        const options = {
            hostname: apiUrl.split(':')[0],
            port: apiUrl.split(':')[1] || 5001,
            path: '/auth/login',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = http.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                if (res.statusCode === 200) {
                    const response = JSON.parse(data);
                    resolve(response.accessToken);
                } else {
                    reject(new Error(`Login failed with status ${res.statusCode}: ${data}`));
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.write(postData);
        req.end();
    });
}

function testWithToken(token) {
    console.log('\nTest 2: Connecting WITH valid token (should succeed)...');

    const ws2 = new WebSocket(`ws://${wsUrl}/ws?role=admin&token=${encodeURIComponent(token)}`);

    ws2.on('open', () => {
        console.log('✅ PASS: Connection opened with valid token');

        // Send a test message
        ws2.send(JSON.stringify({ event: 'ping', payload: {} }));

        setTimeout(() => {
            ws2.close();
            console.log('\n=== All WebSocket Authentication Tests Complete ===\n');
            process.exit(0);
        }, 2000);
    });

    ws2.on('message', (data) => {
        console.log('Received message:', data.toString());
    });

    ws2.on('close', (code, reason) => {
        console.log(`Connection closed - Code: ${code}, Reason: ${reason.toString()}`);
    });

    ws2.on('error', (err) => {
        console.log(`❌ FAIL: Connection with valid token failed: ${err.message}`);
        process.exit(1);
    });
}
