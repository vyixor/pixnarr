import os
from typing import Optional, Dict
from pathlib import Path
#loggers
import logging
from logging.handlers import RotatingFileHandler
from typing import Optional

log_dir = os.path.join(os.getenv('APPDATA'), 'PixNarr', 'logs')
os.makedirs(log_dir, exist_ok=True)
log_file = os.path.join(log_dir, 'pixnarr_backend.log')

logger = logging.getLogger("pixnarr_backend")
if not logger.handlers:
    _fh = RotatingFileHandler(
        log_file,
        maxBytes=5 * 1024 * 1024,
        backupCount=3,
        encoding="utf-8",
    )
    _fh.setFormatter(logging.Formatter("%(asctime)s - %(levelname)s - %(message)s"))
    logger.setLevel(logging.INFO)
    logger.addHandler(_fh)





home = os.path.join(Path.home(), "PixNarr")
os.makedirs(home, exist_ok=True)

class Preferences:
    def __init__(self, filepath: str = "preferences.conf"):
        self.filepath = filepath
        self._data: Dict[str, str] = {}
        self.filepath =  os.path.join(home, self.filepath)
        self._load()

    def _load(self):
        """Load preferences from file"""
        if not os.path.exists(self.filepath):
            self._save()  # Create empty file
            return

        try:
            with open(self.filepath, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    # Skip empty lines and comments
                    if not line or line.startswith('//'):
                        continue
                    
                    if '=' in line:
                        key, value = line.split('=', 1)
                        key = key.strip()
                        value = value.strip()
                        if key:  # Ensure key is not empty
                            self._data[key] = value
        except Exception as e:
            logger.error(f"Failed to load preferences from {self.filepath}: {e}")
            print(f"Warning: Failed to load preferences: {e}")

    def _save(self):
        """Save preferences to file"""
        try:
            with open(self.filepath, 'w', encoding='utf-8') as f:
                f.write("// PixNarr Preferences\n")
                f.write("// Do not edit manually unless you know what you're doing\n\n")
                for key, value in self._data.items():
                    f.write(f"{key}={value}\n")
        except Exception as e:
            logger.error(f"Failed to save preferences to {self.filepath}: {e}")
            print(f"Error: Failed to save preferences: {e}")

    def set(self, key: str, value: str):
        """Save a key-value pair"""
        if not key or key.startswith('//'):
            logger.error("Invalid key provided")
            raise ValueError("Key cannot be empty or start with '//'")
        
        self._data[key.strip()] = str(value).strip()
        self._save()

    def get(self, key: str, default: str = "") -> str:
        """Retrieve value by key"""
        return self._data.get(key.strip(), default)

    def get_int(self, key: str, default: int = 0) -> int:
        """Retrieve value as integer"""
        try:
            return int(self.get(key, str(default)))
        except:
            return default

    def get_bool(self, key: str, default: bool = False) -> bool:
        """Retrieve value as boolean"""
        val = self.get(key, str(default)).lower()
        return val in ('true', '1', 'yes', 'on')

    def remove(self, key: str):
        """Remove a key"""
        if key in self._data:
            del self._data[key]
            self._save()

    def all(self) -> Dict[str, str]:
        """Return all preferences"""
        return self._data.copy()

    def clear(self):
        """Clear all preferences"""
        self._data.clear()
        self._save()

"""

# Initialize
prefs = Preferences("preferences.conf")

# Save data
prefs.set("name", "John Doe")
prefs.set("theme", "dark")
prefs.set("volume", "85")
prefs.set("auto_save", "true")

# Retrieve data
print(prefs.get("name"))           # John Doe
print(prefs.get_int("volume"))     # 85
print(prefs.get_bool("auto_save")) # True

# Remove a key
prefs.remove("theme")

# Show all
print(prefs.all())

"""