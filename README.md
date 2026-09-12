# Haha-Cookies 🍪

> Session state and tab productivity inspector utility (Chrome Extension Manifest V3).

## Features
- **Cookie Inspector & Manager:** Inspect, edit, export, and import session cookies in real-time.
- **Tab Productivity:** Quick insights and session state inspector.
- **Manifest V3 Compliant:** Built using modern Chrome Extension architecture (`service_worker`, modern permission scopes).

## Installation (Developer Mode)
1. Clone or download this repository:
   ```bash
   git clone https://github.com/somaylab/Haha-Cookies.git
   ```
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** toggle in the top right.
4. Click **Load unpacked** and select the root directory of this repository.

## Structure
- `manifest.json`: Extension manifest (V3)
- `app.html` & `app.css`: Extension popup UI
- `app.js`: Main UI logic and interactions
- `sw.js`: Background service worker
- `core/`: Parser and formatter core engines
- `icons/`: Extension icons

## License
MIT License
