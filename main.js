import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

// Define constants
const backendUrl = 'https://pipe-network-backend.pipecanary.workers.dev/api/heartbeat';
const HEARTBEAT_INTERVAL = 5 * 60 * 1000; // 5 minutes
const NODE_TEST_INTERVAL = 30 * 60 * 1000; // 30 minutes
const tokenFilePath = path.join(__dirname, 'token.json'); // File to store the token

// Function to run the node tests
async function runNodeTests() {
  try {
    const response = await fetch('https://pipe-network-backend.pipecanary.workers.dev/api/nodes');
    const nodes = await response.json();

    for (const node of nodes) {
      // Track uptime and latency
      const latency = await testNodeLatency(node);
      console.log(`Node ${node.node_id} (${node.ip}) latency: ${latency}ms`);

      // Report the test result to the backend
      await reportTestResult(node, latency);
    }
    console.log('All node tests completed.');
  } catch (error) {
    console.error('Error running node tests:', error);
  }
}

// Function to test the latency of a single node
async function testNodeLatency(node) {
  const start = Date.now();
  const timeout = 5000; // 5 seconds timeout

  try {
    const response = await Promise.race([
      fetch(`http://${node.ip}`, { mode: 'no-cors' }), // Disable CORS for a simple connectivity check
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeout))
    ]);

    // With no-cors, you can't check response.ok, so assume success if no error
    return Date.now() - start;
  } catch (error) {
    await reportTestResult(node, -1);
    return -1; // Return -1 to indicate failure
  }
}

// Function to report a node's test result to the backend
async function reportTestResult(node, latency) {
  const token = await getToken();
  if (!token) {
    console.warn('No token found. Skipping result reporting.');
    return;
  }

  try {
    const response = await fetch('https://pipe-network-backend.pipecanary.workers.dev/api/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        node_id: node.node_id,
        ip: node.ip,
        latency: latency,
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

// Read token from the token file
async function getToken() {
  try {
    const tokenData = await fs.promises.readFile(tokenFilePath, 'utf8');
    const token = JSON.parse(tokenData).token;
    return token;
  } catch (error) {
    console.error('Error reading token:', error);
    return null;
  }
}

// Write token to the token file
async function saveToken(token) {
  try {
    await fs.promises.writeFile(tokenFilePath, JSON.stringify({ token }), 'utf8');
    console.log('Token saved successfully.');
  } catch (error) {
    console.error('Error saving token:', error);
  }
}

// Start heartbeat logic
async function startHeartbeat() {
  const token = await getToken();

  if (!token) {
    console.warn('No token found. Skipping heartbeat.');
    return;
  }

  setInterval(async () => {
    try {
      const geoInfo = await getGeoLocation();

      const response = await fetch('https://pipe-network-backend.pipecanary.workers.dev/api/heartbeat', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
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
}

// Fetch geo-location data
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

// Update points (for example, adding more points for each successful heartbeat)
async function updatePoints() {
  try {
    const token = await getToken();
    if (!token) {
      console.warn('No token found. Skipping points update.');
      return;
    }

    const response = await fetch('https://pipe-network-backend.pipecanary.workers.dev/api/points', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    
    const data = await response.json();
    console.log(`Points updated: ${data.points}`);
  } catch (error) {
    console.error('Error updating points:', error);
  }
}

// Set up a repeating interval for node tests and points update
setInterval(async () => {
  await runNodeTests(); // Run the node tests every 30 minutes
  await updatePoints();  // Update points
}, NODE_TEST_INTERVAL);

// Initialize and run tests
console.log('Starting node test and heartbeat scheduler...');
startHeartbeat();
