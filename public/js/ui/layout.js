// src/ui/layout.js
// Purpose: Handles general layout adjustments (drag bar) and the initial loading screen.

// DOM Elements specific to layout
const loadingScreen = document.getElementById('loading-screen');
const mainContent = document.getElementById('main-content');
const dragBar = document.getElementById('drag-bar');
const mainPanel = document.getElementById('main-panel');
const projectsPanel = document.getElementById('projects-panel');
const rightPanel = document.getElementById('right-panel');
const container = document.querySelector('.container');

/**
 * Initializes the drag bar functionality for resizing panels.
 */
export function initDragBar() {
    if (!dragBar || !mainPanel || !projectsPanel || !rightPanel || !container) {
        console.warn("Drag bar elements not found, skipping initialization.");
        return;
    }

    let dragging = false;
    let startX, startRightPanelWidth; // For desktop horizontal drag
    let startY, startMainPanelHeight; // For mobile vertical drag (if needed)
    let isMobile = window.innerWidth <= 768;

    function checkMobileView() {
        isMobile = window.innerWidth <= 768;
        // Adjust cursor based on orientation (assuming horizontal for desktop, vertical for mobile)
        dragBar.style.cursor = isMobile ? 'ns-resize' : 'ew-resize';
        // Reset styles if switching views to avoid conflicts
        // mainPanel.style.height = '';
        // rightPanel.style.width = '';
    }

    checkMobileView(); // Initial check
    window.addEventListener('resize', checkMobileView); // Update on resize

    dragBar.addEventListener('mousedown', (e) => {
        e.preventDefault(); // Prevent text selection during drag
        dragging = true;
        startX = e.clientX;
        startY = e.clientY; // Capture vertical start too
        startRightPanelWidth = rightPanel.offsetWidth;
        startMainPanelHeight = mainPanel.offsetHeight; // Capture start height
        document.body.style.userSelect = 'none'; // Prevent selection globally
        document.body.style.cursor = isMobile ? 'ns-resize' : 'ew-resize'; // Set cursor globally
    });

    document.addEventListener('mousemove', (e) => {
        if (!dragging) return;

        if (isMobile) {
            // Vertical resizing for mobile view (adjust main panel height)
            const deltaY = e.clientY - startY;
            let newMainPanelHeight = startMainPanelHeight + deltaY;
            // Define reasonable min/max heights (adjust as needed)
            const minHeight = 150;
            const maxHeight = container.offsetHeight - (projectsPanel.offsetHeight + 50); // Leave some space

            newMainPanelHeight = Math.max(minHeight, Math.min(newMainPanelHeight, maxHeight));
            mainPanel.style.height = `${newMainPanelHeight}px`;

        } else {
            // Horizontal resizing for desktop view (adjust right panel width)
            const deltaX = e.clientX - startX;
            let newRightPanelWidth = startRightPanelWidth - deltaX;
            // Define reasonable min/max widths (adjust as needed)
            const minWidth = 300;
            // Ensure projects panel + main panel min width don't exceed container
            const maxWidth = container.offsetWidth - (projectsPanel.offsetWidth + 400); // Min main panel width

            newRightPanelWidth = Math.max(minWidth, Math.min(newRightPanelWidth, maxWidth));
            rightPanel.style.width = `${newRightPanelWidth}px`;
            // Let flexbox handle the main panel width adjustment:
            // mainPanel.style.width = `calc(100% - ${projectsPanel.offsetWidth}px - ${newRightPanelWidth}px - ${dragBar.offsetWidth}px)`;
        }
    });

    document.addEventListener('mouseup', () => {
        if (dragging) {
            dragging = false;
            document.body.style.userSelect = ''; // Restore selection
            document.body.style.cursor = ''; // Restore cursor
        }
    });

    console.log("Drag bar initialized.");
}

/**
 * Hides the loading screen and reveals the main application content.
 */
export function hideLoading() {
    if (loadingScreen && mainContent) {
        loadingScreen.style.opacity = '0';
        mainContent.classList.add('loaded'); // Add class for potential content animation

        // Remove loading screen from DOM after transition
        loadingScreen.addEventListener('transitionend', () => {
            loadingScreen.style.display = 'none';
        }, { once: true }); // Ensure listener runs only once

        console.log("Loading screen hidden.");
    } else {
        console.warn("Loading screen or main content element not found.");
        // Fallback: Ensure main content is visible even if loading screen isn't found
        if(mainContent) mainContent.style.opacity = '1';
    }
}