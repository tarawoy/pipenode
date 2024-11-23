import fetch from 'node-fetch'; // Use `import` for ES modules
import fs from 'fs/promises'; // Use promises-based API for file handling

const backendUrl = 'https://pipe-network-backend.pipecanary.workers.dev/api/heartbeat';
const HEARTBEAT_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Read the token from token.txt file
async function getToken() {
  try {
    const data = await fs.readFile('token.txt', 'utf8');
    return data.trim();
  } catch (err) {
    console.error('Failed to read token file:', err);
    return null;
  }
}

// Function to test node latency
async function testNodeLatency(node) {
  const start = Date.now();
  const timeout = 5000;

  try {
    await Promise.race([
      fetch(`http://${node.ip}`, { mode: 'no-cors' }), // Disable CORS for simple connectivity check
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeout)),
    ]);

    return Date.now() - start;
  } catch (error) {
    console.error(`Error testing latency for node ${node.node_id}:`, error);
    await reportTestResult(node, -1);
    return -1;
  }
}

// Function to report node test result
async function reportTestResult(node, latency) {
  const token = await getToken();
  if (!token) {
    console.warn('No token found. Skipping result reporting.');
    return;
  }

  try {
    const response = await fetch("https://pipe-network-backend.pipecanary.workers.dev/api/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        node_id: node.node_id,
        ip: node.ip,
        latency: latency,
        status: latency > 0 ? "online" : "offline",
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

// Heartbeat Function
async function startHeartbeat() {
  const token = await getToken();
  if (!token) {
    console.warn('No token found. Skipping heartbeat.');
    return;
  }

  setInterval(async () => {
    try {
      const geoInfo = await getGeoLocation();
      const response = await fetch(backendUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ip: geoInfo.ip,
          location: geoInfo.location,
          timestamp: Date.now(),
        }),
      });

      if (response.ok) {
        console.log("Heartbeat sent successfully.");
      } else {
        console.error("Heartbeat failed:", await response.text());
      }
    } catch (error) {
      console.error("Error during heartbeat:", error);
    }
  }, HEARTBEAT_INTERVAL);
}

// Retrieve the user's Geo-location data
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

// Example of periodic node testing
async function runNodeTests() {
  try {
    const response = await fetch("https://pipe-network-backend.pipecanary.workers.dev/api/nodes");
    const nodes = await response.json();

    for (const node of nodes) {
      const latency = await testNodeLatency(node);
      console.log(`Node ${node.node_id} (${node.ip}) latency: ${latency}ms`);

      // Report the test result to the backend
      await reportTestResult(node, latency);
    }
    console.log("All node tests completed.");
  } catch (error) {
    console.error("Error running node tests:", error);
  }
}

// Run the periodic tests and heartbeat
runNodeTests();
startHeartbeat();
