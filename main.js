const fetch = require("node-fetch");
const fs = require('fs').promises;

// Sample node testing and heartbeat functionality
console.log('Starting node test and heartbeat scheduler...');
startHeartbeat();

// Start heartbeat scheduler
async function startHeartbeat() {
  // Retrieve the token from a local text file (assuming you have a token.txt)
  const token = await getToken();
  if (!token) {
    console.warn("No token found. Skipping heartbeat.");
    return;
  }

  // Send heartbeats at a regular interval
  setInterval(async () => {
    try {
      // Get geo-location information
      const geoInfo = await getGeoLocation();

      // Send the heartbeat request to the backend
      const response = await fetch("https://pipe-network-backend.pipecanary.workers.dev/api/heartbeat", {
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

      // Check the response
      if (response.ok) {
        console.log("Heartbeat sent successfully.");
      } else {
        console.error("Heartbeat failed:", await response.text());
      }
    } catch (error) {
      console.error("Error during heartbeat:", error);
    }
  }, 5 * 60 * 1000); // Send heartbeat every 5 minutes
}

// Function to retrieve token from the local text file (token.txt)
async function getToken() {
  try {
    const data = await fs.readFile('token.txt', 'utf8');
    return data.trim(); // Remove any leading/trailing whitespace or newlines
  } catch (error) {
    console.error("Error reading token:", error);
    return null;
  }
}

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

// Function to run periodic node tests
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

// Function to test the latency of a single node
async function testNodeLatency(node) {
  const start = Date.now();
  const timeout = 5000;

  try {
    const response = await Promise.race([
      fetch(`http://${node.ip}`, { mode: 'no-cors' }), // Disable CORS for a simple connectivity check
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), timeout)
      )
    ]);

    // With no-cors, you can't check response.ok, so assume success if no error
    return Date.now() - start;
  } catch (error) {
    await reportTestResult(node, -1);
    return -1;
  }
}

// Function to report a node's test result to the backend
async function reportTestResult(node, latency) {
  const token = await getToken();
  if (!token) {
    console.warn("No token found. Skipping result reporting.");
    return;
  }

  try {
    const response = await fetch("https://pipe-network-backend.pipecanary.workers.dev/api/test", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        node_id: node.node_id,
        ip: node.ip,
        latency: latency,
        status: latency > 0 ? "online" : "offline"
      })
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

// Simulate periodic node testing every 30 minutes
setInterval(() => {
  console.log('Running node tests...');
  runNodeTests();
}, 30 * 60 * 1000); // 30 minutes
