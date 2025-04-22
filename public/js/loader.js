// loader.js
// Handles project loading, creation, and management

// Load projects when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Initialize project panel functionality
    initProjectsPanel();
    
    // We've already checked for projects in the loading page
    // No need to check again on index page, the create project view
    // will be shown automatically if there are no projects
});

// Check for projects - no need to show a modal now, the default UI is enough
async function checkAndShowCreateProjectView() {
    console.log('Checking for projects...');
    try {
        const response = await fetch('/api/projects');
        if (!response.ok) {
            throw new Error('Failed to load projects');
        }
        
        const projects = await response.json();
        console.log('Projects found:', projects.length);
        // The projects UI will show a message if no projects exist
    } catch (error) {
        console.error('Error checking projects:', error);
    }
}

// Initialize the projects panel
function initProjectsPanel() {
    loadProjects();
    
    // The add project button is now handled in projects.js
}

// Function to load projects from the API
async function loadProjects() {
    try {
        const response = await fetch('/api/projects');
        if (!response.ok) {
            throw new Error('Failed to load projects');
        }
        
        const data = await response.json();
        
        // Handle the new API response format which includes projects, currentProjectId, and currentSessionId
        if (data && Array.isArray(data.projects)) {
            renderProjects(data.projects);
        } else if (Array.isArray(data)) {
            // For backward compatibility with old API that returned just an array
            renderProjects(data);
        } else {
            console.error('Unexpected API response format:', data);
            renderProjects([]);
        }
    } catch (error) {
        console.error('Error loading projects:', error);
        renderProjects([]);
    }
}

// Function to render projects in the UI
function renderProjects(projects) {
    const projectsList = document.getElementById('projects-list');
    if (!projectsList) return;
    
    // Clear existing projects
    projectsList.innerHTML = '';
    
    if (projects.length === 0) {
        // No projects message
        projectsList.innerHTML = `
            <div class="no-projects" style="padding: 16px; color: var(--secondary-text); text-align: center;">
                No projects yet. Click the + button to create one.
            </div>
        `;
        return;
    }
    
    // Render each project
    projects.forEach((project, index) => {
        const projectItem = document.createElement('div');
        projectItem.className = `project-item${index === 0 ? ' active' : ''}`;
        projectItem.dataset.projectId = project.id;
        
        // Add project status indicator if available
        const statusHtml = project.status ? 
            `<span class="project-status ${project.status}"></span>` : '';
        
        // Use name (new format) or title (old format)
        const projectName = project.name || project.title;
        
        projectItem.innerHTML = `
            <div class="project-info">
                ${statusHtml}
                <span class="project-name">${projectName}</span>
            </div>
            <button class="project-menu-btn" data-project-id="${project.id}">
                <span class="material-icons">more_vert</span>
            </button>
        `;
        
        projectsList.appendChild(projectItem);
        
        // Add click handler
        projectItem.addEventListener('click', () => {
            // Remove active class from all projects
            document.querySelectorAll('.project-item').forEach(p => p.classList.remove('active'));
            // Add active class to this project
            projectItem.classList.add('active');
        });
        
        // Add menu button handler
        const menuBtn = projectItem.querySelector('.project-menu-btn');
        menuBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            
            const rect = menuBtn.getBoundingClientRect();
            const projectId = menuBtn.getAttribute('data-project-id');
            
            // Position and show context menu
            const contextMenu = document.getElementById('project-context-menu');
            if (contextMenu) {
                contextMenu.style.top = `${rect.top}px`;
                contextMenu.style.left = `${rect.right + 5}px`;
                contextMenu.style.display = 'block';
                
                // Store active project id on the menu
                contextMenu.dataset.activeProjectId = projectId;
            }
        });
    });
}

// Legacy function - no longer used, but kept for reference
// Project creation now happens directly in the UI with inline editing
function showCreateProjectOverlay() {
    console.log('Create project overlay has been replaced with inline editing.');
    // This function no longer does anything - creation now handled by projects.js
}

// Function to check if projects exist
async function checkProjects() {
    try {
        const response = await fetch('/api/projects');
        if (!response.ok) {
            throw new Error('Failed to load projects');
        }
        
        const projects = await response.json();
        
        if (projects.length === 0) {
            // No projects, show create project view with an overlay
            showCreateProjectOverlay();
        }
    } catch (error) {
        console.error('Error checking projects:', error);
    }
}