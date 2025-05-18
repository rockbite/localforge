// Preload script for Electron app
const { contextBridge, ipcRenderer } = require('electron');

// Log for debugging
console.log('Preload script running');

// Expose IPC functions to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Receive update notifications from main process
  onUpdateAvailable: (callback) => {
    console.log('Registering update-available listener');
    ipcRenderer.on('update-available', (_, data) => {
      console.log('Received update-available event:', data);
      callback(data);
    });
  },
  
  // Request to show the update dialog
  showUpdateDialog: () => {
    console.log('Sending show-update-dialog event');
    ipcRenderer.send('show-update-dialog');
  },
  
  // Open directory selector dialog
  showDirectoryPicker: () => {
    console.log('Sending show-directory-picker event');
    return ipcRenderer.invoke('show-directory-picker');
  },

  // Show a save file dialog and return the chosen path
  showSaveDialog: (options) => {
    console.log('Sending show-save-dialog event', options);
    return ipcRenderer.invoke('show-save-dialog', options);
  },

  // Write data to a file on disk
  saveFile: (filePath, data) => {
    return ipcRenderer.invoke('save-file', filePath, data);
  },
  
  // Check if running in Electron
  isElectron: () => true
});