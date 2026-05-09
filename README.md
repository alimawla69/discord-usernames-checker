# Discord Username Checker & Generator

[![GitHub last commit](https://img.shields.io/github/last-commit/therrguy/discord-usernames-checker?style=flat)](https://github.com/therrguy/discord-usernames-checker/)
[![GitHub stars](https://img.shields.io/github/stars/therrguy/discord-usernames-checker?style=flat)](https://github.com/therrguy/discord-usernames-checker/stargazers)
[![Visitor Badge](https://visitor-badge.laobi.icu/badge?page_id=discord-usernames-checker)](https://github.com/therrguy/discord-usernames-checker)

A professional Discord username checker with advanced proxy management, rate-limit handling, and automatic cooldown systems.

> **⚠️ Disclaimer**: This tool is for educational purposes only. I am not responsible for any actions you take with this script.

## ✨ Features

### Core Functionality
- **Username Generation**: Automatically generates random Discord usernames
- **Availability Checking**: Checks if usernames are taken or available
- **Auto-Save Results**: Saves available usernames to `hits.txt` and taken usernames to `taken.txt`

### Advanced Proxy Management
- **Proxy Support**: Supports both `host:port` and `host:port:user:pass` formats
- **Random Proxy Selection**: Distributes load evenly across all proxies for better stability
- **Request Limiting**: Each proxy limited to 20 requests before rotation (configurable)
- **Proxy Health Tracking**: Automatically removes dead proxies after 3 consecutive failures
- **Auto-Calculated Concurrency**: Automatically sets worker count based on proxy count (1% of pool, min 10, max 200)

### Rate-Limit Handling
- **Smart Rate-Limit Detection**: Detects 429 responses and moves affected proxies to `banned.txt`
- **Cooldown System**: Bans proxies for 1 hour (configurable) before allowing reuse
- **Auto-Restore**: Automatically restores proxies after cooldown period on script restart
- **Timestamp Tracking**: Uses quick.db to track ban times for accurate cooldown management
- **Duplicate Prevention**: Prevents duplicate entries in banned.txt

### Data Persistence
- **Username History**: Uses quick.db to remember generated usernames across runs
- **No Duplicate Checks**: Never checks the same username twice
- **Graceful Shutdown**: CTRL+C saves all buffered results before exiting

### User Experience
- **Interactive Setup**: Prompts for username length, concurrency, and delay
- **Real-Time Logging**: Color-coded console output for easy monitoring
- **Progress Tracking**: Shows worker count, proxy count, and status updates
- **Smart Startup**: Automatically filters out banned proxies and restores cooled-down proxies

## 📋 Requirements

- **Node.js** (v14 or higher)
- **Proxies**: High-quality residential proxies recommended
  - Get free proxies at [Webshare.io](https://www.webshare.io/)
  - Format: `host:port` or `host:port:user:pass`

## 🚀 Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/therrguy/discord-usernames-checker.git
   cd discord-usernames-checker
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Add proxies**
   - Paste your proxies into `proxies.txt`
   - One proxy per line

4. **Run the script**
   ```bash
   node index.js
   ```
   Or use the provided batch file:
   ```bash
   start.bat
   ```

## ⚙️ Configuration

Edit the constants in `index.js` to customize behavior:

```javascript
const PROXY_REQUEST_LIMIT = 20;          // Requests per proxy before rotation
const PROXY_FAILURE_THRESHOLD = 3;      // Failures before removing dead proxy
const RATE_LIMIT_COOLDOWN = 3600000;    // Cooldown for banned proxies (1 hour in ms)
```

## 📁 File Structure

- `proxies.txt` - Your proxy list (add your proxies here)
- `banned.txt` - Rate-limited proxies (auto-managed)
- `hits.txt` - Available usernames found
- `taken.txt` - Unavailable usernames
- `sqlite.json` - Generated username history (quick.db)

## 🔧 How It Works

1. **Startup**: Loads proxies, filters out banned ones, restores cooled-down proxies
2. **Username Generation**: Generates unique random usernames (not checked before)
3. **Proxy Selection**: Randomly selects a proxy that hasn't hit request limit
4. **Checking**: Sends request to Discord API with proxy
5. **Result Handling**:
   - **Available**: Saves to `hits.txt`
   - **Taken**: Saves to `taken.txt`
   - **Rate-Limited (429)**: Moves proxy to `banned.txt` with timestamp
   - **Network Error**: Retries up to 3 times
   - **Dead Proxy**: Removes after 3 failures
6. **Cooldown**: After 1 hour, banned proxies are automatically restored

## 📊 Performance

With 2000 proxies:
- **Single rotation**: 40,000 requests (20 per proxy)
- **With cooldown**: Continuous checking possible
- **Auto-concurrency**: 20 workers (1% of pool)
- **Throughput**: ~40 requests/second (at 500ms delay)

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## 📝 Changelog

### Recent Updates
- ✅ Added random proxy selection for better stability
- ✅ Implemented smart rate-limit handling with cooldown system
- ✅ Added proxy health tracking and automatic dead proxy removal
- ✅ Implemented username persistence with quick.db
- ✅ Added graceful shutdown with buffer flushing
- ✅ Auto-calculated concurrency based on proxy count
- ✅ Prevented duplicate entries in banned.txt
- ✅ Added automatic filtering of banned proxies during loading
- ✅ Fixed infinite loop when all proxies hit request limit

## 📞 Support

- **Discord Server**: [Join here](https://discord.gg/HFZRWUC)
- **GitHub Issues**: [Report a bug](https://github.com/therrguy/discord-usernames-checker/issues/new)

## 💖 Donate

If you love this tool, please consider [donating](https://www.discord.gg/HFZRWUC) to help support its development!

---

**Made by** [_Luffy99_](https://github.com/therrguy) | [Discord Server](https://discord.gg/HFZRWUC)
