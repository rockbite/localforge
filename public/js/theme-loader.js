// Theme loader - loads the current theme from settings
document.addEventListener('DOMContentLoaded', async function() {
    try {
        // Fetch settings from API
        const response = await fetch('/api/settings');
        if (!response.ok) {
            throw new Error(`Failed to load settings: ${response.statusText}`);
        }
        
        const settings = await response.json();
        
        // Apply theme if available in settings
        if (settings.theme) {
            applyTheme(settings.theme);
        } else {
            // Default to dark theme if no theme specified
            applyTheme('dark');
        }
    } catch (error) {
        console.error('Error loading theme settings:', error);
        // Default to dark theme on error
        applyTheme('dark');
    }
});

// Function to apply the theme - make it globally available
window.applyTheme = function(themeName) {
    // Remove any existing theme stylesheets
    const existingThemeLink = document.getElementById('theme-stylesheet');
    if (existingThemeLink) {
        existingThemeLink.remove();
    }

    // Add the new theme stylesheet
    const link = document.createElement('link');
    link.id = 'theme-stylesheet';
    link.rel = 'stylesheet';
    link.href = `/css/themes/_${themeName}-theme.css`;
    document.head.appendChild(link);
    
    // Apply the theme to the HTML element
    document.documentElement.dataset.theme = themeName;
}