// electron/preferences.js
//
// Runs ONLY in Electron's main process (Node.js environment).
// Saves settings to: C:\Users\<user>\PixNarr\preferences.conf
// Plain text key=value format, human-readable.
// Replaces electron-store entirely.

const fs   = require('fs');
const path = require('path');
const os   = require('os');

class Preferences {
  constructor(filename = 'preferences.conf') {
    const configDir = path.join(os.homedir(), 'PixNarr');

    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    this.filepath = path.join(configDir, filename);
    this.data     = {};
    this._load();
  }

  _load() {
    if (!fs.existsSync(this.filepath)) {
      this._save();   // create file with header
      return;
    }
    try {
      const lines = fs.readFileSync(this.filepath, 'utf-8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('//')) continue;
        if (trimmed.includes('=')) {
          const [key, ...valueParts] = trimmed.split('=');
          const cleanKey = key.trim();
          if (cleanKey) this.data[cleanKey] = valueParts.join('=').trim();
        }
      }
    } catch (err) {
      console.warn('[prefs] Failed to load preferences:', err.message);
    }
  }

  _save() {
    try {
      let content  = '// PixNarr Preferences\n';
          content += '// Do not edit manually unless you know what you\'re doing\n\n';
      for (const [k, v] of Object.entries(this.data)) {
        content += `${k}=${v}\n`;
      }
      fs.writeFileSync(this.filepath, content, 'utf-8');
    } catch (err) {
      console.error('[prefs] Failed to save preferences:', err.message);
    }
  }

  set(key, value) {
    if (!key || key.startsWith('//')) throw new Error('Invalid key');
    this.data[key.trim()] = String(value).trim();
    this._save();
  }

  get(key, defaultValue = '') {
    return this.data[key.trim()] ?? defaultValue;
  }

  getInt(key, defaultValue = 0) {
    const num = parseInt(this.get(key), 10);
    return isNaN(num) ? defaultValue : num;
  }

  getBool(key, defaultValue = false) {
    return ['true', '1', 'yes', 'on'].includes(this.get(key).toLowerCase().trim());
  }

  remove(key) {
    delete this.data[key.trim()];
    this._save();
  }

  all() {
    return { ...this.data };
  }

  clear() {
    this.data = {};
    this._save();
  }
}

module.exports = { Preferences };
