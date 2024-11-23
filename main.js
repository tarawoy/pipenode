const fetch = require("node-fetch");
const fs = require("fs").promises;

// Configuration
const BACKEND_URL = "https://pipe-network-backend.pipecanary.workers.dev";
const HEARTBEAT_INTERVAL = 5 * 60 * 1000; // 5 minutes
const NODE_TEST_INTERVAL = 30 * 60 * 1000; // 30 minutes
const TOKEN_PATH = "./token.txt";
const UPTIME_PATH = "./uptime.json"; // Stores uptime data

// Uptime tracker
let uptimeData = {};

// Load uptime data from file
async function loadUptimeData() {
  try {
    const data = await fs.readFile(UPTIME_PATH, "utf8");
    uptimeData = JSON.parse(data);
    console.log("Loaded uptime data.");
  } catch (error) {
    console.warn("No uptime data found, initializing new data.");
    uptimeData = {};
  }
}

// Save uptime data to file
async function saveUptimeData() {
  try {
    await fs.writeFile(UPTIME_PATH, JSON.stringify(uptimeData, null, 2));
    console.log("Uptime data saved.");
  } catch (error) {
    console.error("Error saving uptime data:", error);
  }
}

// Function to read the token from a file
async function getToken() {
  try {
    const token = await fs.readFile(TOKEN_PATH, "utf8");
    return token.trim();
  } catch (error) {
    console.error("Error reading token:", error);
    return null;
  }
}

// Function to fetch node data and test latency
async function runNodeTests() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/nodes`);
    const nodes = await response.json();

    for (const node of nodes) {
      const latency = await testNodeLatency(node);
      const status = latency > 0 ? "online" : "offline";

      // Update uptime data
      if (!uptimeData[node.node_id]) {
        uptimeData[node.node_id] = { uptime: 0, downtime: 0 };
      }

      if (status === "online") {
        uptimeData[node.node_id].uptime += NODE_TEST_INTERVAL;
      } else {
        uptimeData[node.node_id].downtime += NODE_TEST_INTERVAL;
      }

      // Log and report the result
      console.log(`Node ${node.node_id} (${node.ip}) - Latency: ${latency}ms, Status: ${status}`);
      await reportTestResult(node, latency, status);
    }

    await saveUptimeData();
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
    await Promise.race([
      fetch(`http://${node.ip}`, { method: "GET" }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), timeout)
      ),
    ]);

    return Date.now() - start; // Calculate latency
  } catch (error) {
    console.warn(`Error testing node ${node.node_id}:`, error.message);
    return -1; // Indicate the node is offline
  }
}

// Function to report a node's test result to the backend
async function reportTestResult(node, latency, status) {
  const token = await getToken();
  if (!token) {
    console.warn("No token found. Skipping result reporting.");
    return;
  }

  try {
    const response = await fetch(`${BACKEND_URL}/api/test`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        node_id: node.node_id,
        ip: node.ip,
        latency: latency,
        status: status,
        uptime: uptimeData[node.node_id]?.uptime || 0,
        downtime: uptimeData[node.node_id]?.downtime || 0,
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

// Function to send a heartbeat
async function sendHeartbeat() {
  const token = await getToken();
  if (!token) {
    console.warn("No token found. Skipping heartbeat.");
    return;
  }

  try {
    const geoInfo = await getGeoLocation();
    const response = await fetch(`${BACKEND_URL}/api/heartbeat`, {
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
}

// Function to fetch IP and Geo-location data
async function getGeoLocation() {
  try {
    const response = await fetch("https://ipapi.co/json/");
    if (!response.ok) throw new Error("Failed to fetch Geo-location data");
    const data = await response.json();
    return {
      ip: data.ip,
      location: `${data.city}, ${data.region}, ${data.country_name}`,
    };
  } catch (error) {
    console.error("Geo-location error:", error);
    return { ip: "unknown", location: "unknown" };
  }
}

// Function to update points for the user
async function updatePoints() {
  const token = await getToken();
  if (!token) {
    console.warn("No token found. Skipping point update.");
    return;
  }

  try {
    const response = await fetch(`${BACKEND_URL}/api/points`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    console.log(`Current points: ${data.points}`);
  } catch (error) {
    console.error("Error updating points:", error);
  }
}

// Scheduler
function startScheduler() {
  console.log("Starting node test, heartbeat, and point update scheduler...");

  // Load uptime data
  loadUptimeData();

  // Initial runs
  runNodeTests();
  sendHeartbeat();
  updatePoints();

  // Periodic tasks
  setInterval(runNodeTests, NODE_TEST_INTERVAL);
  setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
  setInterval(updatePoints, NODE_TEST_INTERVAL);
}

// Start the script
startScheduler();
