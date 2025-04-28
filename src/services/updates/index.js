// Update checker service
import https from 'https';
import semver from 'semver';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Service state
let updateInfo = {
  currentVersion: null,
  latestVersion: null,
  updateAvailable: false,
  lastChecked: null
};

// Initialize the service
export function initUpdateService() {
  try {
    // Load package.json to get current version
    const packagePath = path.resolve(__dirname, '../../../package.json');
    const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
    updateInfo.currentVersion = pkg.version;
    
    console.log(`Update service initialized. Current version: ${updateInfo.currentVersion}`);
    
    // Check for updates immediately
    checkForUpdates();
    
    // Schedule regular update checks
    setInterval(checkForUpdates, 3600000); // Check every hour
    
    return updateInfo;
  } catch (error) {
    console.error('Failed to initialize update service:', error);
  }
}

// Check for updates and return update information
export function checkForUpdates() {
  return new Promise((resolve, reject) => {
    if (!updateInfo.currentVersion) {
      return reject(new Error('Update service not initialized'));
    }
    
    console.log(`Checking for updates. Current version: ${updateInfo.currentVersion}`);
    
    https.get('https://registry.npmjs.org/@rockbite/localforge/latest', res => {
      let body = '';
      res.on('data', chunk => (body += chunk));
      res.on('end', () => {
        try {
          const response = JSON.parse(body);
          updateInfo.latestVersion = response.version;
          updateInfo.lastChecked = new Date();
          
          console.log(`Latest version available: ${updateInfo.latestVersion}`);
          
          if (semver.gt(updateInfo.latestVersion, updateInfo.currentVersion)) {
            console.log(`Update available: ${updateInfo.latestVersion}`);
            updateInfo.updateAvailable = true;
          } else {
            console.log('Application is up to date');
            updateInfo.updateAvailable = false;
          }
          
          resolve(updateInfo);
        } catch (error) {
          console.error('Error parsing npm registry response:', error);
          reject(error);
        }
      });
    }).on('error', (error) => {
      console.error('Error checking for updates:', error);
      reject(error);
    });
  });
}

// Get current update information
export function getUpdateInfo() {
  return updateInfo;
}