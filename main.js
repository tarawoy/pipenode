const fs = require('fs');

// Function to dynamically load node-fetch
const fetch = (...args) =>
  import('node-fetch').then(({ default: fetch }) => fetch(...args));

// Configuration
const BACKEND_URL = 'https://pipe-network-backend.pipecanary.workers.dev/api';
const HEARTBEAT_INTERVAL = 5 * 60 * 1000; // 5 minutes
const TOKEN_FILE = 'token.txt'; // Path to the file containing the JWT token

// Load the JWT token from the file
function loadToken() {
  try {
    return fs.readFileSync(TOKEN_FILE, 'utf8').trim();
  } catch (error) {
    console.error(`Error reading token file (${TOKEN_FILE}):`, error);
    return null;
  }
}

// Start periodic node tests
setInterval(runNodeTests, 30 * 60 * 1000); // 30 minutes
console.log('Node testing setup complete.');

// Function to perform node testing
async function runNodeTests() {
  const token = loadToken();
  if (!token) {
    console.warn('No token available. Skipping node tests.');
    return;
  }

  console.log('Running node tests...');

  try {
    const response = await fetch(`${BACKEND_URL}/nodes`);
    const nodes = await response.json();

    for (const node of nodes) {
      const latency = await testNodeLatency(node);
      console.log(`Node ${node.node_id} (${node.ip}) latency: ${latency}ms`);

      // Report the test result to the backend
      await reportTestResult(node, latency, token);
    }
    console.log('All node tests completed.');
  } catch (error) {
    console.error('Error running node tests:', error);
  }
}

// Function to test the latency of a single node
async function testNodeLatency(node) {
  const start = Date.now();
  const timeout = 5000;

  try {
    await Promise.race([
      fetch(`http://${node.ip}`, { mode: 'no-cors' }), // Simple connectivity check
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeout)),
    ]);

    return Date.now() - start; // Successful latency measurement
  } catch {
    return -1; // Node is offline or unreachable
  }
}

// Function to report a node's test result to the backend
async function reportTestResult(node, latency, token) {
  try {
    const response = await fetch(`${BACKEND_URL}/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        node_id: node.node_id,
        ip: node.ip,
        latency,
        status: latency > 0 ? 'online' : 'offline',
      }),
    });

    if (response.ok) {
      console.log(`Reported result for node ${node.node_id}.`);
    } else {
      console.error(`Failed to report result for node ${node.node_id}.`);
    }
  } catch (error) {
    console.error(`Error reporting result for node ${node.node_id}:`, error);
  }
}

// Start the heartbeat logic
setInterval(async () => {
  const token = loadToken();
  if (!token) {
    console.warn('No token available. Skipping heartbeat.');
    return;
  }

  console.log('Sending heartbeat...');

  try {
    const geoInfo = await getGeoLocation();

    const response = await fetch(`${BACKEND_URL}/heartbeat`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ip: geoInfo.ip,
        location: geoInfo.location,
        timestamp: Date.now(),
      }),
    });

    if (response.ok) {
      console.log('Heartbeat sent successfully.');
    } else {
      console.error('Heartbeat failed:', await response.text());
    }
  } catch (error) {
    console.error('Error during heartbeat:', error);
  }
}, HEARTBEAT_INTERVAL);

// Fetch IP and Geo-location data
async function getGeoLocation() {
  try {
    const response = await fetch('https://ipapi.co/json/');
    if (!response.ok) throw new Error('Failed to fetch Geo-location data');
    const data = await response.json();
    return {
      ip: data.ip,
      location: `${data.city}, ${data.region}, ${data.country_name}`,
    };
  } catch (error) {
    console.error('Geo-location error:', error);
    return { ip: 'unknown', location: 'unknown' };
  }
}
