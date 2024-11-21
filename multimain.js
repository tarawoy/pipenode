const fs = require('fs');
const fetch = (...args) =>
  import('node-fetch').then(({ default: fetch }) => fetch(...args));

// Import the SOCKS proxy agent
const { SocksProxyAgent } = require('socks-proxy-agent');

const BACKEND_URL = 'https://pipe-network-backend.pipecanary.workers.dev/api';
const HEARTBEAT_INTERVAL = 5 * 60 * 1000; // 5 minutes
const TOKEN_FILE = 'token.txt'; // Path to the file containing the JWT token
const PROXIES_FILE = 'proxies.txt'; // Path to the file containing proxies

// Fixed User-Agent (Chrome PC)
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36';

// Load the JWT token from the file
function loadToken() {
  try {
    const token = fs.readFileSync(TOKEN_FILE, 'utf8').trim();
    console.log(`Loaded token: ${token}`);
    return token;
  } catch (error) {
    console.error(`Error reading token file (${TOKEN_FILE}):`, error);
    return null;
  }
}

// Load proxies from a file (one per line, e.g., socks5://ip:port)
function loadProxies() {
  try {
    const proxies = fs.readFileSync(PROXIES_FILE, 'utf8').split('\n').map(p => p.trim());
    console.log(`Loaded ${proxies.length} proxies.`);
    return proxies;
  } catch (error) {
    console.error(`Error reading proxies file (${PROXIES_FILE}):`, error);
    return [];
  }
}

// Start periodic node tests
setInterval(runNodeTests, 30 * 60 * 1000); // 30 minutes
console.log('Node testing setup complete.');

// Function to perform node testing with parallel proxies
async function runNodeTests() {
  const token = loadToken();
  const proxies = loadProxies();

  if (!token || proxies.length === 0) {
    console.warn('No token or proxies available. Skipping node tests.');
    return;
  }

  console.log('Running node tests...');

  try {
    const response = await fetch(`${BACKEND_URL}/nodes`);
    const nodes = await response.json();

    if (!nodes || nodes.length === 0) {
      console.log('No nodes found.');
      return;
    }

    // Use multiple proxies concurrently
    await Promise.all(nodes.map(async (node) => {
      const proxy = proxies[Math.floor(Math.random() * proxies.length)]; // Randomly select a proxy
      const latency = await testNodeLatency(node, proxy);
      console.log(`Node ${node.node_id} (${node.ip}) latency: ${latency}ms`);

      // Report the test result to the backend
      await reportTestResult(node, latency, token, proxy);
    }));

    console.log('All node tests completed.');
  } catch (error) {
    console.error('Error running node tests, reconnecting...', error);
    setTimeout(runNodeTests, 5000); // Reattempt after 5 seconds
  }
}

// Function to test the latency of a single node using a SOCKS proxy
async function testNodeLatency(node, proxy) {
  const start = Date.now();
  const timeout = 5000;

  console.log(`Testing latency for node ${node.node_id} at IP ${node.ip} using proxy ${proxy}...`);

  try {
    const agent = new SocksProxyAgent(proxy); // SOCKS Proxy Agent

    // Perform the fetch with SOCKS proxy and fixed User-Agent
    await Promise.race([ 
      fetch(`http://${node.ip}`, {
        mode: 'no-cors',
        headers: { 'User-Agent': USER_AGENT },
        agent: agent, // Use the SOCKS proxy agent here
      }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeout)),
    ]);

    const latency = Date.now() - start; // Successful latency measurement
    console.log(`Node ${node.node_id} latency: ${latency}ms`);
    return latency;
  } catch (error) {
    console.error(`Node ${node.node_id} failed to respond using proxy ${proxy}.`, error);
    return -1; // Node is offline or unreachable
  }
}

// Function to report a node's test result to the backend using a SOCKS proxy
async function reportTestResult(node, latency, token, proxy) {
  try {
    const agent = new SocksProxyAgent(proxy); // SOCKS Proxy Agent

    const response = await fetch(`${BACKEND_URL}/test`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'User-Agent': USER_AGENT, // Fixed User-Agent
      },
      body: JSON.stringify({
        node_id: node.node_id,
        ip: node.ip,
        latency,
        status: latency > 0 ? 'online' : 'offline',
      }),
      agent: agent, // Use the SOCKS proxy agent here
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
        'User-Agent': USER_AGENT, // Fixed User-Agent
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

// Function to get the latest points from the backend
async function getPoints() {
  const token = loadToken();
  if (!token) {
    console.error('No token available. Cannot fetch points.');
    return;
  }

  try {
    const response = await fetch(`${BACKEND_URL}/points`, {
      headers: { 'Authorization': `Bearer ${token}`, 'User-Agent': USER_AGENT }
    });

    if (!response.ok) throw new Error('Failed to fetch points');

    const data = await response.json();
    return data.points;
  } catch (error) {
    console.error('Error fetching points:', error);
    return null;
  }
}

// Display the latest points
setInterval(async () => {
  const points = await getPoints();
  if (points) {
    console.log('Latest points:', points);
  } else {
    console.log('No points available.');
  }
}, 60000); // Check every minute
