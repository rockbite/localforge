// Handle update notifications in the renderer process
console.log('Update checker initialized');

document.addEventListener('DOMContentLoaded', () => {
  const updateIndicator = document.getElementById('update-indicator');
  const updateText = document.getElementById('update-text');
  
  if (!updateIndicator || !updateText) {
    console.error('Update indicator elements not found in the DOM');
    return;
  }
  
  // Socket listener for update_available event
  const handleUpdateAvailable = (data) => {
    console.log('Update available:', data);
    
    // Show update notification with version number
    updateText.textContent = `Update available: v${data.latest}`;
    updateIndicator.style.display = 'flex';
    
    // Store update info for dialog
    updateIndicator.dataset.currentVersion = data.current;
    updateIndicator.dataset.latestVersion = data.latest;
  };
  
  // Set click handler to open package page
  updateIndicator.addEventListener('click', () => {
    const currentVersion = updateIndicator.dataset.currentVersion || '';
    const latestVersion = updateIndicator.dataset.latestVersion || '';
    const packageName = '@rockbite/localforge';
    
    // If running in Electron, use a dialog
    if (window.electronAPI) {
      window.electronAPI.showUpdateDialog();
    } else {
      // Direct URL navigation for browser
      window.open(`https://www.npmjs.com/package/${packageName}/v/${latestVersion}`, '_blank');
    }
  });
  
  // Check if socket.io is initialized
  if (typeof io !== 'undefined') {
    // Listen for socket event from socket.js
    window.addEventListener('update_available', (event) => {
      const data = event.detail;
      handleUpdateAvailable(data);
    });
  }
});