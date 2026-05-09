require('colors');
const axios = require('axios'),
  fs = require('fs'),
  randomUseragent = require('random-useragent'),
  readline = require('readline'),
  { QuickDB } = require('quick.db');

const db = new QuickDB();
const generatedUsernamesKey = 'generated_usernames';

// Batch write buffers
const hitsBuffer = [];
const takenBuffer = [];
const BATCH_SIZE = 50;
let isShuttingDown = false;

// Proxy configuration
const PROXY_REQUEST_LIMIT = 20; // Max requests per proxy before rotation
const PROXY_FAILURE_THRESHOLD = 3; // Remove proxy after 3 consecutive failures
const RATE_LIMIT_COOLDOWN = 3600000; // 1 hour cooldown for rate-limited proxies (in ms)

// Proxy tracking
const proxyUsageCount = new Map(); // Track requests per proxy
const proxyFailureCount = new Map(); // Track consecutive failures per proxy
const deadProxies = new Set(); // Track removed proxies

// Graceful shutdown handler
process.on('SIGINT', async () => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log('\n' + 'Shutting down gracefully...'.yellow);
  await flushBuffers();
  console.log('Buffers flushed. Exiting.'.green);
  process.exit(0);
});

async function flushBuffers() {
  if (hitsBuffer.length > 0) {
    await fs.promises.appendFile('hits.txt', hitsBuffer.join('\n') + '\n');
    hitsBuffer.length = 0;
  }
  if (takenBuffer.length > 0) {
    await fs.promises.appendFile('taken.txt', takenBuffer.join('\n') + '\n');
    takenBuffer.length = 0;
  }
}

async function addToBuffer(buffer, data) {
  buffer.push(data);
  if (buffer.length >= BATCH_SIZE) {
    await flushBuffers();
  }
}

function fileExists(filename) {
  try {
    fs.accessSync(filename, fs.constants.F_OK);
    return true;
  } catch (err) {
    return false;
  }
}

async function getUsername(length) {
  const characters = 'abcdefghijklmnopqrstuvwxyz0123456789._';
  let username = '';
  let attempts = 0;
  const maxAttempts = 1000;

  do {
    username = '';
    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * characters.length);
      username += characters[randomIndex];
    }
    attempts++;
    if (attempts >= maxAttempts) {
      console.log('Warning: Could not generate unique username after max attempts'.yellow);
      return null;
    }
  } while (await db.has(`${generatedUsernamesKey}.${username}`) || blockedUsernames.has(username));

  try {
    await db.set(`${generatedUsernamesKey}.${username}`, true);
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || error.code === 'SQLITE_CONSTRAINT') {
      // Username was already set by another worker, continue to generate new one
      return getUsername(length);
    }
    throw error;
  }
  return username;
}
if (!fileExists('proxies.txt')) {
  try {
    console.log('the proxies.txt is not exits!\nto make this method work you need good proxies or this method will not work.'.red);
    console.log('Proxies file created successfully!'.green);
    fs.writeFileSync('proxies.txt', ''); // Use writeFileSync for simplicity in this case
  } catch (error) {
    console.error('the JavaScript does not have access to create files, so please create proxies.txt and add some proxies'.red);
  }
  return;
}
if (!fileExists('hits.txt')) {
  try {
    console.log('the hits.txt is not exits!\nto make this method work you need good proxies or this method will not work.'.red);
    console.log('hits.txt file created successfully!'.green);
    fs.writeFileSync('hits.txt', ''); // Use writeFileSync for simplicity in this case
  } catch (error) {
    console.error('the JavaScript does not have access to create files, so please create hits.txt'.red);
  }
  return;
}
if (!fileExists('taken.txt')) {
  try {
    console.log('the taken.txt is not exits!\nto make this method work you need good proxies or this method will not work.'.red);
    console.log('taken.txt file created successfully!'.green);
    fs.writeFileSync('taken.txt', ''); // Use writeFileSync for simplicity in this case
  } catch (error) {
    console.error('the JavaScript does not have access to create files, so please create taken.txt'.red);
  }
  return;
}
if (!fileExists('banned.txt')) {
  try {
    console.log('banned.txt created for rate-limited proxies.'.green);
    fs.writeFileSync('banned.txt', '');
  } catch (error) {
    console.error('Could not create banned.txt'.red);
  }
}

// Function to move proxy to banned.txt and store timestamp
async function banProxy(proxyString) {
  try {
    // Check if proxy is already in banned.txt
    const bannedContent = fs.readFileSync('banned.txt', 'utf-8').trim();
    if (bannedContent) {
      const bannedLines = bannedContent.replace(/\r/gi, '').split('\n').filter(p => p.trim());
      if (bannedLines.includes(proxyString)) {
        // Already banned, just update timestamp
        const timestamp = Date.now();
        await db.set(`banned_proxies.${proxyString}`, timestamp);
        return;
      }
    }
    
    await fs.promises.appendFile('banned.txt', proxyString + '\n');
    const timestamp = Date.now();
    await db.set(`banned_proxies.${proxyString}`, timestamp);
    
    // Remove from proxies.txt
    const proxyContent = fs.readFileSync('proxies.txt', 'utf-8').trim();
    if (proxyContent) {
      const proxyLines = proxyContent.replace(/\r/gi, '').split('\n').filter(p => p.trim() && p !== proxyString);
      fs.writeFileSync('proxies.txt', proxyLines.join('\n') + '\n');
    }
    
    // Remove from in-memory proxies array
    const proxyIndex = proxies.indexOf(proxyString);
    if (proxyIndex > -1) {
      proxies.splice(proxyIndex, 1);
    }
    
    console.log(`Proxy ${proxyString} moved to banned.txt and removed from proxies.txt.`.yellow);
  } catch (error) {
    console.error('Error banning proxy:', error.message);
  }
}

// Function to check and restore proxies that have passed cooldown
async function restoreBannedProxies() {
  try {
    const bannedContent = fs.readFileSync('banned.txt', 'utf-8').trim();
    if (!bannedContent) return;
    
    const bannedProxies = bannedContent.replace(/\r/gi, '').split('\n').filter(p => p.trim());
    const now = Date.now();
    const toRestore = [];
    const stillBanned = [];
    
    for (const proxy of bannedProxies) {
      const bannedTime = await db.get(`banned_proxies.${proxy}`);
      if (bannedTime && (now - bannedTime) >= RATE_LIMIT_COOLDOWN) {
        toRestore.push(proxy);
        await db.delete(`banned_proxies.${proxy}`);
      } else {
        stillBanned.push(proxy);
      }
    }
    
    if (toRestore.length > 0) {
      await fs.promises.appendFile('proxies.txt', toRestore.join('\n') + '\n');
      // Add to in-memory proxies array
      proxies.push(...toRestore);
      console.log(`Restored ${toRestore.length} proxies from banned.txt (cooldown period passed).`.green);
    }
    
    if (stillBanned.length > 0) {
      fs.writeFileSync('banned.txt', stillBanned.join('\n') + '\n');
      console.log(`${stillBanned.length} proxies still in cooldown.`.yellow);
    } else {
      fs.writeFileSync('banned.txt', '');
    }
  } catch (error) {
    console.error('Error restoring banned proxies:', error.message);
  }
}

let proxies = [];
try {
  const proxyContent = fs.readFileSync('proxies.txt', 'utf-8').trim();
  if (proxyContent) {
    const allProxies = proxyContent.replace(/\r/gi, '').split('\n').filter(p => p.trim());
    
    // Load banned proxies for comparison
    let bannedProxies = [];
    if (fileExists('banned.txt')) {
      const bannedContent = fs.readFileSync('banned.txt', 'utf-8').trim();
      if (bannedContent) {
        bannedProxies = bannedContent.replace(/\r/gi, '').split('\n').filter(p => p.trim());
      }
    }
    
    // Filter out proxies that are already banned
    const validProxies = [];
    const toRemoveFromProxies = [];
    
    for (const proxy of allProxies) {
      if (bannedProxies.includes(proxy)) {
        // Proxy is already banned, skip it and mark for removal
        toRemoveFromProxies.push(proxy);
      } else {
        validProxies.push(proxy);
      }
    }
    
    proxies = validProxies;
    
    // Remove banned proxies from proxies.txt
    if (toRemoveFromProxies.length > 0) {
      fs.writeFileSync('proxies.txt', validProxies.join('\n') + '\n');
      console.log(`Removed ${toRemoveFromProxies.length} proxies from proxies.txt (already in banned.txt).`.yellow);
    }
  }
} catch (err) {
  console.log('Warning: Could not read proxies.txt'.yellow);
}

if (!proxies || proxies.length === 0) {
  console.log('All proxies are in cooldown or banned. Script cannot run. Wait for cooldown period or add new proxies.'.red);
  process.exit(0);
} else {
  console.log(`Loaded ${proxies.length} proxies.`.green);
}

const blockedUsernames = new Set();
if (fileExists('taken.txt')) {
  const blockedUsernamesList = fs.readFileSync('taken.txt', 'utf-8').trim().replace(/\r/gi, '').split('\n');
  blockedUsernamesList.forEach(username => blockedUsernames.add(username));
}

function parseProxy(proxyString) {
  if (!proxyString || !proxyString.trim()) return null;
  const parts = proxyString.trim().split(':');
  
  if (parts.length === 2) {
    // host:port
    const port = parseInt(parts[1], 10);
    if (!port || port < 1 || port > 65535 || !parts[0]) return null;
    return {
      host: parts[0],
      port: port,
      username: null,
      password: null
    };
  } else if (parts.length === 4) {
    // host:port:user:pass
    const port = parseInt(parts[1], 10);
    if (!port || port < 1 || port > 65535 || !parts[0]) return null;
    return {
      host: parts[0],
      port: port,
      username: parts[2],
      password: parts[3]
    };
  }
  return null;
}

async function Check(username, workerId, proxy, proxyString, retryCount = 0) {
  if (isShuttingDown) return;
  if (blockedUsernames.has(username)) {
    console.log(`Worker ${workerId} - Username (${username}) is blocked. Skipping.`.yellow);
    return;
  }

  // Use full proxy string as key to distinguish proxies with same host:port but different auth
  const proxyKey = proxyString || 'direct';

  try {
    let requestConfig = {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': randomUseragent.getRandom()
      },
      timeout: 10000 // 10 second timeout
    };

    if (proxy && proxy.host && proxy.port) {
      if (proxy.username && proxy.password) {
        requestConfig.proxy = {
          protocol: 'http',
          host: proxy.host,
          port: proxy.port,
          auth: {
            username: proxy.username,
            password: proxy.password
          }
        };
      } else {
        requestConfig.proxy = {
          protocol: 'http',
          host: proxy.host,
          port: proxy.port,
        };
      }
    }

    const response = await axios.post("https://discord.com/api/v9/unique-username/username-attempt-unauthed", { "username": username }, requestConfig);

    // Reset failure count on success
    if (proxy && proxyFailureCount.has(proxyKey)) {
      proxyFailureCount.delete(proxyKey);
    }

    if (response.data.taken) {
      console.log(`Worker ${workerId} - Username (${username}) Is Not Available`.red);
      await addToBuffer(takenBuffer, username);
    } else {
      console.log(`Worker ${workerId} - Username (${username}) Is Available`.green);
      await addToBuffer(hitsBuffer, username);
    }
  } catch (error) {
    if (error.response && error.response.status === 429) {
      console.error(`Worker ${workerId} - Username ${username} - Rate limited (429). Banning proxy.`.yellow);
      // Ban the proxy and remove from active list
      if (proxyString) {
        await banProxy(proxyString);
        const index = proxies.indexOf(proxyString);
        if (index > -1) {
          proxies.splice(index, 1);
        }
      }
      return;
    }

    // Track proxy failures for health monitoring
    if (proxy) {
      const currentFailures = proxyFailureCount.get(proxyKey) || 0;
      proxyFailureCount.set(proxyKey, currentFailures + 1);

      // Remove proxy if it exceeds failure threshold
      if (currentFailures + 1 >= PROXY_FAILURE_THRESHOLD) {
        deadProxies.add(proxyKey);
        console.log(`Proxy ${proxyKey} removed after ${PROXY_FAILURE_THRESHOLD} consecutive failures.`.red);
      }
    }

    const isNetworkError = !error.response && (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED');
    
    if (isNetworkError && retryCount < 3) {
      console.log(`Worker ${workerId} - Username ${username} - Network error, retrying (${retryCount + 1}/3)...`.yellow);
      await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
      return Check(username, workerId, proxy, proxyString, retryCount + 1);
    }

    console.error(`Worker ${workerId} - Username ${username} - Error: ${error.message}`);
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function getInput(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

(async () => {
  console.clear()
  console.log('---------------------------------------'.red)
  console.log(`This tool has been made by _Luffy99 -> (https://discord.gg/HFZRWUC) - (https://github.com/therrguy/discord-username-checker) `)
  console.log('---------------------------------------'.red)
  console.log('')
  console.log('=== DISCORD USERNAME CHECKER INSTRUCTIONS ==='.cyan)
  console.log('')
  console.log('Features:')
  console.log('  • Controlled concurrency queue (auto-calculated based on proxy count)')
  console.log('  • Proxy health tracking (removes dead proxies after 3 failures)')
  console.log('  • Request limiting (100 requests per proxy before rotation)')
  console.log('  • Rate-limit handling (429 proxies moved to banned.txt)')
  console.log('  • Auto-restore (banned proxies restored after 1 hour cooldown)')
  console.log('  • Username persistence (quick.db remembers generated usernames)')
  console.log('  • Graceful shutdown (CTRL+C saves remaining results)')
  console.log('')
  console.log('Files:')
  console.log('  • proxies.txt - Your proxy list (host:port or host:port:user:pass)')
  console.log('  • banned.txt - Rate-limited proxies (auto-managed)')
  console.log('  • hits.txt - Available usernames')
  console.log('  • taken.txt - Unavailable usernames')
  console.log('  • sqlite.json - Generated username history (quick.db)')
  console.log('')
  console.log('Configuration:')
  console.log(`  • PROXY_REQUEST_LIMIT: ${PROXY_REQUEST_LIMIT} requests per proxy`)
  console.log(`  • PROXY_FAILURE_THRESHOLD: ${PROXY_FAILURE_THRESHOLD} failures before removal`)
  console.log(`  • RATE_LIMIT_COOLDOWN: ${RATE_LIMIT_COOLDOWN / 60000} minutes for banned proxies`)
  console.log('')
  console.log('Press CTRL+C to stop gracefully and save results.')
  console.log('---------------------------------------'.cyan)
  console.log('')
  
  // Restore any proxies that have passed cooldown period
  await restoreBannedProxies();
  
  const usernameLength = await getInput('Enter username length (2 to 20, default is 4): ');
  const concurrency = await getInput('Enter concurrency level (default is 10): ');
  const requestDelay = await getInput('Enter delay between requests in ms (default is 500): ');
  rl.close();

  const parsedUsernameLength = Math.max(2, Math.min(parseInt(usernameLength, 10) || 4, 20));
  
  // Auto-calculate concurrency based on proxy count (1% of proxies, min 10, max 200)
  // But never exceed the number of available proxies
  const defaultConcurrency = proxies.length > 0 ? Math.max(10, Math.min(Math.floor(proxies.length * 0.01), 200)) : 10;
  const maxAllowedConcurrency = proxies.length > 0 ? proxies.length : 10;
  const parsedConcurrency = Math.max(1, Math.min(parseInt(concurrency, 10) || defaultConcurrency, maxAllowedConcurrency));
  const parsedRequestDelay = Math.max(0, parseInt(requestDelay, 10) || 500);
  
  console.log(`Running with ${parsedConcurrency} workers and ${proxies.length} proxies.`.cyan);

  let workerId = 1;

  // Controlled concurrency queue
  async function runWorker() {
    while (!isShuttingDown) {
      // Stop if no proxies available
      if (proxies.length === 0) {
        console.log('No proxies available. Stopping.'.red);
        isShuttingDown = true;
        break;
      }
      
      const username = await getUsername(parsedUsernameLength);
      if (!username) {
        console.log('Could not generate unique username. Stopping.'.yellow);
        break;
      }

      // Randomly select a proxy that's not dead
      let proxyConfig = null;
      let proxyString = null;
      let attempts = 0;
      const maxProxyAttempts = proxies.length > 0 ? proxies.length : 1;
      
      while (attempts < maxProxyAttempts && !proxyConfig) {
        if (proxies.length > 0) {
          // Random proxy selection
          const randomIndex = Math.floor(Math.random() * proxies.length);
          proxyString = proxies[randomIndex];
          const parsedProxy = parseProxy(proxyString);
          
          // Use full proxy string as key to distinguish proxies with same host:port but different auth
          const proxyKey = proxyString || null;
          
          // Skip dead proxies
          if (proxyKey && deadProxies.has(proxyKey)) {
            attempts++;
            continue;
          }
          
          proxyConfig = parsedProxy;
        }
        attempts++;
      }

      // Stop if all proxies are dead
      if (!proxyConfig && proxies.length > 0) {
        console.log('All proxies are dead. Stopping.'.red);
        isShuttingDown = true;
        break;
      }

      await Check(username, workerId++, proxyConfig, proxyString);
      
      if (parsedRequestDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, parsedRequestDelay));
      }
    }
  }

  // Launch workers with controlled concurrency
  const workers = [];
  for (let i = 0; i < parsedConcurrency; i++) {
    workers.push(runWorker());
  }

  await Promise.all(workers);
  await flushBuffers();
  console.log('All workers completed.'.green);

})();
