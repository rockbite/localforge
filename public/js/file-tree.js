/**
 * File Tree Widget for Agent UI
 * This module creates an interactive file tree display
 * that can be easily embedded in agent messages
 */

class FileTreeWidget {
    constructor() {
        this.init();
    }

    init() {
        // Add stylesheet to head if not already present
        if (!document.getElementById('file-tree-styles')) {
            const styles = document.createElement('style');
            styles.id = 'file-tree-styles';
            styles.textContent = this.getStyles();
            document.head.appendChild(styles);
        }
        
        // Setup event delegation for file tree interactions
        document.addEventListener('click', (e) => {
            // Handle folder toggle clicks
            if (e.target.closest('.file-node-folder > .file-tree-node')) {
                const node = e.target.closest('.file-node-folder');
                if (node) {
                    node.classList.toggle('open');
                    e.stopPropagation();
                }
            }
            
            // Handle file clicks
            if (e.target.closest('.file-node-file > .file-tree-node')) {
                const fileNode = e.target.closest('.file-tree-node');
                if (fileNode) {
                    // Remove active class from all nodes
                    document.querySelectorAll('.file-tree-node').forEach(node => {
                        node.classList.remove('active');
                    });
                    
                    // Add active class to clicked node
                    fileNode.classList.add('active');
                    
                    // Update path display if it exists
                    const widget = fileNode.closest('.file-tree-widget');
                    const fileName = fileNode.querySelector('.name').textContent;
                    const pathElement = widget.querySelector('.file-tree-path');
                    
                    if (pathElement) {
                        // Build full path by traversing up the tree
                        let path = fileName;
                        let parent = fileNode.closest('.file-node-children');
                        
                        while (parent) {
                            const folderNode = parent.previousElementSibling;
                            if (folderNode && folderNode.querySelector('.name')) {
                                path = folderNode.querySelector('.name').textContent + path;
                            }
                            parent = parent.parentElement.closest('.file-node-children');
                        }
                        
                        pathElement.textContent = path;
                    }
                }
            }
        });
    }
    
    /**
     * Preprocess content to replace filetree code blocks with widgets
     * This is called before markdown processing
     */
    preprocessContent(content) {
        if (!content || !content.includes('```filetree')) return content;
        
        // Find all filetree blocks
        return content.replace(/```filetree\s+([\s\S]+?)```/g, (match, treeContent) => {
            // Extract the tree and create root
            const root = this.buildTreeFromText(treeContent);
            if (!root) return match; // If parsing fails, keep original
            
            // Create a placeholder that won't be processed by markdown
            return `<div class="filetree-placeholder" data-tree="${encodeURIComponent(treeContent.trim())}"></div>`;
        });
    }
    
    /**
     * Post-process content to replace placeholder divs with actual widgets
     * This is called after markdown processing
     */
    postprocessContent(container) {
        if (!container) return;
        
        // Find all placeholder divs
        const placeholders = container.querySelectorAll('.filetree-placeholder');
        placeholders.forEach(placeholder => {
            const treeContent = decodeURIComponent(placeholder.getAttribute('data-tree'));
            const root = this.buildTreeFromText(treeContent);
            
            if (root) {
                // Create widget HTML
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = this.createWidget(root, {
                    title: root.name,
                    autoExpand: true
                });
                
                // Replace placeholder with the widget
                placeholder.parentNode.replaceChild(tempDiv.firstElementChild, placeholder);
            }
        });
    }
    
    /**
     * Parse file tree text and build tree structure
     */
    buildTreeFromText(treeText) {
        if (!treeText) return null;
        
        const lines = treeText.trim().split('\n');
        if (lines.length === 0) return null;
        
        // Create a default root node
        const root = {
            name: 'root/',
            isFolder: true,
            children: [],
            level: 0,
            open: true // Root folder always starts open
        };
        
        // Stack to keep track of current parent
        const stack = [root];
        
        // Process all lines, including the first one
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            // Calculate indentation level
            let level = 0;
            let j = 0;
            
            // Count spaces or tree characters to determine level
            while (j < line.length && (line[j] === ' ' || line[j] === '│' || line[j] === '├' || line[j] === '└' || line[j] === '─')) {
                j++;
                if (line[j] === '─') {
                    // Count indentation based on tree characters
                    while (j < line.length && line[j] === '─') j++;
                }
            }
            
            // Each level is typically represented by 4 spaces or a set of tree chars
            level = Math.floor(j / 4) + 1;
            
            // For top-level items (no indentation), we want to add them to the root
            if (j === 0) level = 1;
            
            // Extract node name
            const name = line.substring(j).trim();
            const isFolder = name.endsWith('/');
            
            // Create node
            const node = {
                name,
                isFolder,
                children: [],
                level,
                open: false // Default to closed folders - never open automatically
            };
            
            // Find correct parent for this node based on level
            while (stack.length > 1 && stack[stack.length - 1].level >= level) {
                stack.pop();
            }
            
            // Add node to its parent
            stack[stack.length - 1].children.push(node);
            
            // If it's a folder, add it to the stack
            if (isFolder) {
                stack.push(node);
            }
        }
        
        return root;
    }
    
    /**
     * Create HTML for file tree widget
     */
    createWidget(root, options = {}) {
        const {
            title = root.name,
            showPath = true,
            showInfo = true,
            autoExpand = false // Default to collapsed
        } = options;
        
        if (!root) return '';
        
        let widgetHtml = `
        <div class="file-tree-widget">
            <div class="file-tree-body">
                <ul class="file-tree-item">
                    ${this.renderNode(root, autoExpand)}
                </ul>
            </div>`;
            
        if (showPath) {
            widgetHtml += `<div class="file-tree-path">/${title}</div>`;
        }
        
        if (showInfo) {
            // Calculate file and folder counts
            const counts = this.countItems(root);
            widgetHtml += `
            <div class="file-tree-info">
                <span>${counts.files} files, ${counts.folders} folders</span>
            </div>`;
        }
        
        widgetHtml += `</div>`;
        
        return widgetHtml;
    }
    
    /**
     * Count files and folders in the tree
     */
    countItems(node) {
        let files = 0;
        let folders = 0;
        
        if (node.isFolder) {
            folders++;
            node.children.forEach(child => {
                const counts = this.countItems(child);
                files += counts.files;
                folders += counts.folders;
            });
        } else {
            files++;
        }
        
        return { files, folders };
    }
    
    /**
     * Render a single node and its children
     */
    renderNode(node, autoExpand = false) {
        if (node.isFolder) {
            // Special case: If level is 0 (root folder), always open it
            // Otherwise only open if explicitly set to open
            const isRootFolder = node.level === 0;
            const openClass = isRootFolder || node.open ? 'open' : '';
            
            // Sort children: folders first, then files alphabetically
            const sortedChildren = [...node.children].sort((a, b) => {
                // If types are different (folder vs file), sort folders first
                if (a.isFolder !== b.isFolder) {
                    return a.isFolder ? -1 : 1;
                }
                // Otherwise sort alphabetically
                return a.name.localeCompare(b.name);
            });
            
            return `
            <li class="file-node-folder ${openClass}">
                <div class="file-tree-node">
                    <span class="name">${node.name}</span>
                </div>
                <ul class="file-node-children">
                    ${sortedChildren.map(child => this.renderNode(child, autoExpand)).join('')}
                </ul>
            </li>`;
        } else {
            // Determine file extension for coloring
            let fileClass = 'txt';
            const name = node.name.toLowerCase();
            
            if (name.startsWith('.')) {
                fileClass = 'gray'; // Dotfiles (.env, .gitignore, etc) are gray
            } else if (name.endsWith('.js')) fileClass = 'js';
            else if (name.endsWith('.ts') || name.endsWith('.tsx')) fileClass = 'js';
            else if (name.endsWith('.css')) fileClass = 'css';
            else if (name.endsWith('.html') || name.endsWith('.htm')) fileClass = 'html';
            else if (name.endsWith('.json')) fileClass = 'json';
            else if (name.match(/\.(jpg|jpeg|png|gif|svg|webp)$/)) fileClass = 'img';
            
            return `
            <li class="file-node-file">
                <div class="file-tree-node">
                    <span class="name ${fileClass}">${node.name}</span>
                </div>
            </li>`;
        }
    }
    
    
    /**
     * CSS styles for the file tree widget
     */
    getStyles() {
        return `
        /* File Tree Widget Styles */
        .file-tree-widget {
            background-color: var(--primary-bg, #1E1E1E);
            border-radius: var(--border-radius, 8px);
            overflow: hidden;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            border: 1px solid var(--border-color, #333);
            position: relative;
            width: 100%;
            margin: 10px 0;
            font-family: var(--code-font, monospace);
        }

        .file-tree-widget * {
            box-sizing: border-box;
        }

        .file-tree-body {
            padding: 12px 0;
            max-height: 400px;
            overflow-y: auto;
        }

        /* Override any global styles that might affect our lists */
        .file-tree-widget ul, 
        .file-tree-widget li {
            list-style-type: none !important;
            list-style: none !important;
            padding: 0 !important;
            margin: 0 !important;
        }

        .file-tree-item {
            padding: 0 !important;
            margin: 0 !important;
            list-style: none !important;
        }

        .file-tree-node {
            padding: 0px 16px;
            display: flex;
            align-items: center;
            cursor: pointer;
            transition: background-color 0.2s;
            user-select: none;
            position: relative;
        }

        .file-tree-node:hover {
            background-color: rgba(255, 255, 255, 0.05);
        }

        .file-tree-node.active {
            background-color: rgba(255, 255, 255, 0.1);
        }

        .file-tree-node .name {
            font-size: 14px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        /* Remove the size class that's no longer used */
        .file-tree-node .size {
            display: none;
        }

        .file-node-folder > .file-tree-node {
            font-weight: normal;
        }

        .file-node-folder > .file-tree-node .name {
            color: var(--folder-color, #40A2E3);  /* Now blue (was yellow) */
        }

        .file-node-file > .file-tree-node .name.js {
            color: var(--js-file-color, #7dd1c1);
        }

        .file-node-file > .file-tree-node .name.css {
            color: var(--css-file-color, #7B61FF);
        }

        .file-node-file > .file-tree-node .name.html {
            color: var(--html-file-color, #FF715B);
        }

        .file-node-file > .file-tree-node .name.json {
            color: var(--json-file-color, #FFD166);  /* Now yellow (was blue) */
        }

        .file-node-file > .file-tree-node .name.img {
            color: var(--image-file-color, #E57373);
        }

        .file-node-file > .file-tree-node .name.txt {
            color: var(--text-file-color, #d9dfe7);
        }
        
        .file-node-file > .file-tree-node .name.gray {
            color: var(--secondary-text, #888);
        }

        .file-node-children {
            padding-left: 20px !important;
            margin-left: 0 !important;
            overflow: hidden;
            max-height: 0;
            transition: max-height 0.3s ease-out;
        }

        .file-node-folder.open > .file-node-children {
            max-height: 1000px;
            display: block !important;
        }
        
        /* Fix for nesting and indentation */
        .file-tree-widget ul ul {
            margin-left: 20px !important;
        }

        .file-tree-path {
            font-size: 12px;
            color: var(--secondary-text, #888);
            padding: 8px 16px;
            background-color: rgba(0, 0, 0, 0.2);
            border-top: 1px solid var(--border-color, #333);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .file-tree-info {
            padding: 8px 16px;
            font-size: 12px;
            color: var(--secondary-text, #888);
            border-top: 1px solid var(--border-color, #333);
            display: flex;
            justify-content: space-between;
        }
        
        /* Hide placeholder during rendering */
        .filetree-placeholder {
            display: none;
        }
        
        /* For Material icons */
        .file-tree-widget .material-icons {
            font-family: 'Material Icons', sans-serif;
            font-weight: normal;
            font-style: normal;
            font-size: 18px;
            display: inline-block;
            line-height: 1;
            text-transform: none;
            letter-spacing: normal;
            word-wrap: normal;
            white-space: nowrap;
            direction: ltr;
        }`;
    }
}

// Create global instance
window.fileTreeWidget = new FileTreeWidget();