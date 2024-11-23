const fs = require('fs');
const axios = require('axios');
const schedule = require('node-schedule');

// Configuration
const BACKEND_URL = 'https://pipe-network-backend.pipecanary.workers.dev/api';
const HEARTBEAT_INTERVAL = 5 * 60 * 1000; // 5 minutes
const NODE_TEST_INTERVAL = 30 * 60 * 1000; // 30 minutes
const TOKEN_FILE = 'token.txt'; // File to store the token

// Read token from file (simulating storage)
function getToken() {
  if (fs.existsSync(TOKEN_FILE)) {
    const token = fs.readFileSync(TOKEN_FILE, 'utf-8').trim();
    if (token) {
      return token;
    } else {
      console.log("Token is empty in the file.");
      return null;
    }
  } else {
    console.log(`No token found in ${TOKEN_FILE}.`);
    return null;
  }
}

// Save token to file (simulating storage)
function saveToken(token) {
  fs.writeFileSync(TOKEN_FILE, token, 'utf-8');
  console.log(`Token saved to ${TOKEN_FILE}`);
}

// Fetch Geo-location data
async function getGeoLocation() {
  try {
    const response = await axios.get('https://ipapi.co/json/');
    const data = response.data;
    return {
      ip: data.ip || 'unknown',
      location: `${data.city || 'unknown'}, ${data.region || 'unknown'}, ${data.country_name || 'unknown'}`
    };
  } catch (error) {
    console.error("Geo-location error:", error);
    return { ip: 'unknown', location: 'unknown' };
  }
}

// Send heartbeat to the backend
async function sendHeartbeat() {
  const token = getToken();
  if (!token) {
    console.log("No token found. Skipping heartbeat.");
    return;
  }

  const geoInfo = await getGeoLocation();
  const payload = {
    ip: geoInfo.ip,
    location: geoInfo.location,
    timestamp: Date.now()
  };

  try {
    const response = await axios.post(`${BACKEND_URL}/heartbeat`, payload, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    if (response.status === 200) {
      console.log("Heartbeat sent successfully.");
      await updatePoints(); // Update points after a successful heartbeat
    } else {
      console.log(`Heartbeat failed: ${response.data}`);
    }
  } catch (error) {
    console.error("Error during heartbeat:", error);
    reconnect(); // Trigger reconnect on failure
  }
}

// Test node latency
async function testNodeLatency(node) {
  const timeout = 5000; // Timeout in milliseconds
  const start = Date.now();

  try {
    await axios.get(`http://${node.ip}`, { timeout });
    return Date.now() - start;
  } catch (error) {
    return -1;
  }
}

// Report test result to the backend
async function reportTestResult(node, latency) {
  const token = getToken();
  if (!token) {
    console.log("No token found. Skipping result reporting.");
    return;
  }

  const payload = {
    node_id: node.node_id,
    ip: node.ip,
    latency,
    status: latency > 0 ? 'online' : 'offline'
  };

  try {
    const response = await axios.post(`${BACKEND_URL}/test`, payload, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    if (response.status === 200) {
      console.log(`Reported result for node ${node.node_id}.`);
    } else {
      console.log(`Failed to report result for node ${node.node_id}.`);
    }
  } catch (error) {
    console.error(`Error reporting result for node ${node.node_id}:`, error);
  }
}

// Run node tests
async function runNodeTests() {
  const token = getToken();
  if (!token) {
    console.log("No token found. Skipping node tests.");
    return;
  }

  try {
    const response = await axios.get(`${BACKEND_URL}/nodes`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const nodes = response.data;

    for (const node of nodes) {
      const latency = await testNodeLatency(node);
      console.log(`Node ${node.node_id} (${node.ip}) latency: ${latency}ms`);
      await reportTestResult(node, latency);
    }

    console.log("All node tests completed.");
  } catch (error) {
    console.error("Error running node tests:", error);
  }
}

// Update points after reconnect
async function updatePoints() {
  const token = getToken();
  if (!token) {
    console.log("No token found. Skipping points update.");
    return;
  }

  try {
    const response = await axios.get(`${BACKEND_URL}/points`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    const points = response.data.points;
    console.log(`Points updated: ${points}`);
  } catch (error) {
    console.error("Error updating points:", error);
  }
}

// Reconnect logic (retry on failure)
async function reconnect() {
  console.log("Attempting to reconnect...");
  let attempts = 0;
  const maxAttempts = 5;
  while (attempts < maxAttempts) {
    try {
      await sendHeartbeat();
      console.log("Reconnection successful.");
      return;
    } catch (error) {
      attempts++;
      console.log(`Reconnect attempt ${attempts} failed. Retrying in 30 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 30000)); // Wait 30 seconds before retrying
    }
  }
  console.log("Max reconnection attempts reached. Giving up.");
}

// Schedule periodic tasks
function scheduleTasks() {
  // Schedule node tests every 30 minutes
  schedule.scheduleJob('*/30 * * * *', runNodeTests);
  
  // Schedule heartbeat every 5 minutes
  schedule.scheduleJob('*/5 * * * *', sendHeartbeat);
}

// Main function to start the script
async function main() {
  // If the token file doesn't exist, prompt for token
  if (!fs.existsSync(TOKEN_FILE)) {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question('Enter your API token: ', (newToken) => {
      saveToken(newToken);
      rl.close();
      scheduleTasks(); // Start the scheduled tasks after saving the token
    });
  } else {
    scheduleTasks(); // Start the scheduled tasks if token exists
  }
}

main();
