class BlockEditor {
    constructor(container, options = {}) {
        this.container = container;
        this.blocks = [];
        this.ghost = null;     // dragging clone
        this.draggingEl = null;
        this.offsetY = 0;
        this.options = options;
        this.init();
    }

    /* ───────────────────────────── Initialisation ───────────────────────────── */
    init() {
        this.addBlock();               // create first block
        this.updateAllBlockLayouts();   // and position everything
    }

    /* ──────────────────────────── Utility helpers ───────────────────────────── */
    generateId() {
        return Math.random().toString(16).slice(2, 8);
    }

    animateReorder() {
        const items = Array.from(this.container.children);
        const first = items.map(el => el.getBoundingClientRect());
        requestAnimationFrame(() => {
            const last = items.map(el => el.getBoundingClientRect());
            items.forEach((el, i) => {
                const dy = first[i].top - last[i].top;
                if (dy) {
                    el.style.transition = 'none';
                    el.style.transform = `translateY(${dy}px)`;
                    void el.offsetHeight;                // force re-flow
                    el.style.transition = 'transform 200ms ease';
                    el.style.transform = '';
                    el.addEventListener('transitionend', () => {
                        el.style.transition = '';
                    }, { once: true });
                }
            });
        });
    }

    reorderInternalArray() {
        const order = Array
            .from(this.container.querySelectorAll('.block'))
            .map(el => el.dataset.blockId);
        this.blocks.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
    }

    /* ───────────────────────────── Block factory ────────────────────────────── */
    createBlockElement(id) {
        const blockDiv = document.createElement('div');
        blockDiv.className = 'block';
        blockDiv.dataset.blockId = id;

        /* Left-hand controls */
        const leftControls = document.createElement('div');
        leftControls.className = 'block-left-controls';

        // Drag (text) handle
        const textButton = document.createElement('div');
        textButton.className = 'control-button text-button';
        textButton.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256">
        <path fill="currentColor"
          d="M32 64a8 8 0 0 1 8-8h176a8 8 0 0 1 0 16H40a8 8 0 0 1-8-8m8 48h128a8 8 0 0 0 0-16H40a8 8 0 0 0 0 16m176 24H40a8 8 0 0 0 0 16h176a8 8 0 0 0 0-16m-48 40H40a8 8 0 0 0 0 16h128a8 8 0 0 0 0-16"/>
      </svg>`;
        /* Drag handlers */
        textButton.addEventListener('pointerdown', e => this.handleDragStart(e, blockDiv));

        /* Connectors & add button */
        const topConnector = document.createElement('div');
        topConnector.className = 'connector-segment top-segment';
        topConnector.style.top = '30px';

        const addButton = document.createElement('div');
        addButton.className = 'control-button add-button';
        addButton.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 256 256">
        <path fill="currentColor"
          d="M224 128a8 8 0 0 1-8 8h-80v80a8 8 0 0 1-16 0v-80H40a8 8 0 0 1 0-16h80V40a8 8 0 0 1 16 0v80h80a8 8 0 0 1 8 8"/>
      </svg>`;
        addButton.addEventListener('click', () => this.addBlock(id));

        const bottomConnector = document.createElement('div');
        bottomConnector.className = 'connector-segment bottom-segment';

        leftControls.append(textButton, topConnector, addButton, bottomConnector);

        /* Main content */
        const mainContent = document.createElement('div');
        mainContent.className = 'block-main-content';

        const blockHeader = document.createElement('div');
        blockHeader.className = 'block-header';
        blockHeader.innerHTML = `
      <div class="block-id">
        <svg width="14" height="14" viewBox="0 0 256 256" class="block-collapse">
          <path fill="currentColor" d="m208 96l-80 80l-80-80Z"/>
        </svg>
        <span class="block-label" style="color:#71717a;">Block#${id}</span>
        <input type="text" class="block-name-input" value="Block#${id}" style="display:none;" />
      </div>
      <div class="block-menu">
        <div class="menu-icon mute-icon" data-block-id="${id}" data-state="unmuted">
          <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" class="unmuted-icon icon iconify iconify--ph" width="1em" height="1em" viewBox="0 0 256 256"><path fill="currentColor" d="M176 56H80a72 72 0 0 0 0 144h96a72 72 0 0 0 0-144m0 128H80a56 56 0 0 1 0-112h96a56 56 0 0 1 0 112m0-96a40 40 0 1 0 40 40a40 40 0 0 0-40-40m0 64a24 24 0 1 1 24-24a24 24 0 0 1-24 24"></path></svg>
          <svg style="display:none;" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" class="muted-icon icon iconify iconify--ph" width="1em" height="1em" viewBox="0 0 256 256"><path fill="currentColor" d="M176 56H80a72 72 0 0 0 0 144h96a72 72 0 0 0 0-144m0 128H80a56 56 0 0 1 0-112h96a56 56 0 0 1 0 112M80 88a40 40 0 1 0 40 40a40 40 0 0 0-40-40m0 64a24 24 0 1 1 24-24a24 24 0 0 1-24 24"></path></svg>
        </div>
        <div class="menu-icon copy-icon" data-block-id="${id}">
          <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" class="icon iconify iconify--ph" width="1em" height="1em" viewBox="0 0 256 256"><path fill="currentColor" d="M216 32H88a8 8 0 0 0-8 8v40H40a8 8 0 0 0-8 8v128a8 8 0 0 0 8 8h128a8 8 0 0 0 8-8v-40h40a8 8 0 0 0 8-8V40a8 8 0 0 0-8-8m-56 176H48V96h112Zm48-48h-32V88a8 8 0 0 0-8-8H96V48h112Z"></path></svg>
        </div>
        <div class="menu-icon rename-icon" data-block-id="${id}">
          <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" class="icon iconify iconify--ph" width="1em" height="1em" viewBox="0 0 256 256"><path fill="currentColor" d="m227.32 73.37l-44.69-44.68a16 16 0 0 0-22.63 0L36.69 152A15.86 15.86 0 0 0 32 163.31V208a16 16 0 0 0 16 16h168a8 8 0 0 0 0-16H115.32l112-112a16 16 0 0 0 0-22.63M92.69 208H48v-44.69l88-88L180.69 120ZM192 108.69L147.32 64l24-24L216 84.69Z"></path></svg>
        </div>
        <div class="menu-icon delete-icon" data-block-id="${id}">
          <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true" role="img" class="icon iconify iconify--ph" width="1em" height="1em" viewBox="0 0 256 256"><path fill="currentColor" d="M216 48h-40v-8a24 24 0 0 0-24-24h-48a24 24 0 0 0-24 24v8H40a8 8 0 0 0 0 16h8v144a16 16 0 0 0 16 16h128a16 16 0 0 0 16-16V64h8a8 8 0 0 0 0-16M96 40a8 8 0 0 1 8-8h48a8 8 0 0 1 8 8v8H96Zm96 168H64V64h128Zm-80-104v64a8 8 0 0 1-16 0v-64a8 8 0 0 1 16 0m48 0v64a8 8 0 0 1-16 0v-64a8 8 0 0 1 16 0"></path></svg>
        </div>
      </div>`;

        let editorThis = this;
        /* ───────── Collapse / expand functionality ───────── */
        const collapseIcon = blockHeader.querySelector('.block-collapse');
        if (collapseIcon) {
            collapseIcon.style.cursor = 'pointer';
            collapseIcon.addEventListener('click', () => {
                const content = blockDiv.querySelector('.block-content');
                const footer  = blockDiv.querySelector('.block-footer');

                const isCollapsed = content.style.display === 'none';
                content.style.display = isCollapsed ? '' : 'none';
                footer.style.display  = isCollapsed ? '' : 'none';

                /* Rotate the chevron for visual feedback */
                collapseIcon.style.transform = isCollapsed ? 'rotate(0deg)'
                    : 'rotate(-90deg)';
                editorThis.updateAllBlockLayouts();
            });
        }

        const blockContent = document.createElement('div');
        blockContent.className = 'block-content';

        const blockContentId = `block-content-${id}`;
        blockContent.id = blockContentId;

        mainContent.append(blockHeader, blockContent, document.createElement('div'));
        blockDiv.append(leftControls, mainContent);

        // Add event listeners for copy functionality
        const copyIcon = blockDiv.querySelector('.copy-icon');
        if (copyIcon) {
            copyIcon.addEventListener('click', () => {
                if (this.codeMirrors && this.codeMirrors[id]) {
                    const content = this.codeMirrors[id].getValue();
                    navigator.clipboard.writeText(content)
                        .then(() => {
                            // Optional: Visual feedback
                            copyIcon.style.color = '#4CAF50';
                            setTimeout(() => {
                                copyIcon.style.color = '';
                            }, 1000);
                        })
                        .catch(err => {
                            console.error('Could not copy text: ', err);
                        });
                }
            });
        }

        // Add event listeners for delete functionality
        const deleteIcon = blockDiv.querySelector('.delete-icon');
        if (deleteIcon) {
            deleteIcon.addEventListener('click', () => {
                const blockId = deleteIcon.getAttribute('data-block-id');
                this.deleteBlock(blockId);
            });
        }

        // Add event listeners for rename functionality
        const renameIcon = blockDiv.querySelector('.rename-icon');
        if (renameIcon) {
            renameIcon.addEventListener('click', () => {
                this.startRenaming(id);
            });
        }

        // Add event listeners for mute functionality
        const muteIcon = blockDiv.querySelector('.mute-icon');
        if (muteIcon) {
            muteIcon.addEventListener('click', () => {
                this.toggleMute(id);
            });
        }

        // Setup label and input for renaming
        const label = blockDiv.querySelector('.block-label');
        const input = blockDiv.querySelector('.block-name-input');

        if (input) {
            // Track if Escape was pressed to cancel editing
            let escapePressed = false;

            // Handle key presses
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault(); // Prevent form submission
                    e.stopPropagation(); // Prevent event bubbling
                    this.finishRenaming(id, true); // save changes
                } else if (e.key === 'Escape') {
                    e.preventDefault(); // Prevent default behavior
                    e.stopPropagation(); // Prevent event bubbling
                    escapePressed = true;
                    this.finishRenaming(id, false); // discard changes
                }
            });

            // Handle blur (clicking outside)
            input.addEventListener('blur', () => {
                // Only save changes if Escape wasn't pressed
                if (!escapePressed) {
                    this.finishRenaming(id, true);
                }
                escapePressed = false; // reset for next time
            });
        }

        return blockDiv;
    }

    /* ───────────────────────────── CRUD operations ─────────────────────────── */
    addBlock(afterBlockId = null) {
        const id = this.generateId();
        const blockData = { id, content: '' };
        const blockEl   = this.createBlockElement(id);

        if (afterBlockId === null || !this.blocks.length) {
            this.blocks.push(blockData);
            this.container.appendChild(blockEl);
        } else {
            const refEl = this.getBlockElement(afterBlockId);
            const idx   = this.blocks.findIndex(b => b.id === afterBlockId);
            if (idx !== -1 && refEl) {
                this.blocks.splice(idx + 1, 0, blockData);
                refEl.after(blockEl);
            } else {
                this.blocks.push(blockData);
                this.container.appendChild(blockEl);
            }
        }

        this.updateAllBlockLayouts();
        
        // Initialize CodeMirror for this block
        this.initializeCodeMirror(id);
        
        return blockData;
    }

    getBlockElement(id) {
        return this.container.querySelector(`.block[data-block-id="${id}"]`);
    }

    deleteBlock(id) {
        // Don't allow deleting the last block
        if (this.blocks.length <= 1) {
            return;
        }

        const blockElement = this.getBlockElement(id);
        if (blockElement) {
            // Remove from DOM
            blockElement.remove();

            // Remove CodeMirror instance
            if (this.codeMirrors && this.codeMirrors[id]) {
                this.codeMirrors[id].toTextArea();
                delete this.codeMirrors[id];
            }

            // Remove from internal array
            const index = this.blocks.findIndex(block => block.id === id);
            if (index !== -1) {
                this.blocks.splice(index, 1);
            }

            // Update layout
            this.updateAllBlockLayouts();
        }
    }

    startRenaming(id) {
        const blockElement = this.getBlockElement(id);
        if (!blockElement) return;

        const label = blockElement.querySelector('.block-label');
        const input = blockElement.querySelector('.block-name-input');

        if (label && input) {
            // Hide label, show input
            label.style.display = 'none';
            input.style.display = 'inline';

            // Set input value from label
            input.value = label.textContent;

            // Focus and select all text
            input.focus();
            input.select();
        }
    }

    finishRenaming(id, saveChanges) {
        const blockElement = this.getBlockElement(id);
        if (!blockElement) return;

        const label = blockElement.querySelector('.block-label');
        const input = blockElement.querySelector('.block-name-input');

        if (label && input) {
            // Only update label if saving changes and input has content
            if (saveChanges && input.value.trim() !== '') {
                label.textContent = input.value;
            }
            // Otherwise keep the original label text (ignoring changes)
            // This happens when ESC is pressed

            // Hide input, show label
            input.style.display = 'none';
            label.style.display = 'inline';

            // update block id
            this.blocks.forEach(block => {
                if (block.id === id) {
                    block.id = input.value.trim();
                    return;
                }

            });
        }
    }

    toggleMute(id) {
        const blockElement = this.getBlockElement(id);
        if (!blockElement) return;

        const muteIcon = blockElement.querySelector('.mute-icon');
        if (!muteIcon) return;

        const currentState = muteIcon.getAttribute('data-state');
        const mutedIcon = muteIcon.querySelector('.muted-icon');
        const unmutedIcon = muteIcon.querySelector('.unmuted-icon');

        if (currentState === 'unmuted') {
            // Change to muted state
            muteIcon.setAttribute('data-state', 'muted');
            unmutedIcon.style.display = 'none';
            mutedIcon.style.display = 'inline';
            blockElement.classList.add('muted');

            // Update the block data
            const blockData = this.blocks.find(block => block.id === id);
            if (blockData) {
                blockData.muted = true;
            }
        } else {
            // Change to unmuted state
            muteIcon.setAttribute('data-state', 'unmuted');
            mutedIcon.style.display = 'none';
            unmutedIcon.style.display = 'inline';
            blockElement.classList.remove('muted');

            // Update the block data
            const blockData = this.blocks.find(block => block.id === id);
            if (blockData) {
                blockData.muted = false;
            }
        }
    }

    /* ─────────────────────────── Layout / rendering ────────────────────────── */
    updateAllBlockLayouts() {
        const els = Array.from(this.container.querySelectorAll('.block'));
        els.forEach((el, i) => {
            const blockId = el.dataset.blockId;
            const topSeg = el.querySelector('.top-segment');
            const bottomSeg = el.querySelector('.bottom-segment');
            const addBtn = el.querySelector('.add-button');
            const textBtn = el.querySelector('.text-button');
            if (!topSeg || !bottomSeg || !addBtn || !textBtn) return;

            // Get the height of the block content
            let h = 100; // Default height if we can't determine it
            
            if (this.codeMirrors && this.codeMirrors[blockId]) {
                // For CodeMirror, we need to force a refresh to get accurate dimensions
                this.codeMirrors[blockId].refresh();
                const editorEl = this.codeMirrors[blockId].getWrapperElement();
                h = editorEl.offsetHeight;
            }

            h = Math.min(h, 200);
            
            const connH = h + 7;
            topSeg.style.height = `${connH}px`;
            addBtn.style.marginTop = `${connH}px`;
            textBtn.style.marginTop = '0';
            bottomSeg.style.top = `${connH + 61}px`;
            bottomSeg.style.display = i < els.length - 1 ? 'block' : 'none';
            if (i < els.length - 1) bottomSeg.style.height = '4px';
        });
    }

    /* ───────────────────────── Drag-to-swap handlers ───────────────────────── */
    handleDragStart(e, blockEl) {
        e.preventDefault();
        this.draggingEl = blockEl;
        this.draggingEl.classList.add('drag-placeholder'); // hide it
        const rect = blockEl.getBoundingClientRect();
        this.offsetY = e.clientY - rect.top;

        // make ghost
        this.ghost = blockEl.cloneNode(true);
        Object.assign(this.ghost.style, {
            position      : 'fixed',
            left          : `${rect.left}px`,
            top           : `${rect.top}px`,
            width         : `${rect.width}px`,
            opacity       : '0.9',
            pointerEvents : 'none',
            zIndex        : '9999',
        });
        this.ghost.classList.add('ghost-drag');
        this.container.appendChild(this.ghost);

        // events
        this.moveListener = ev => this.handleDragMove(ev);
        this.upListener   = ()  => this.handleDragEnd();
        document.addEventListener('pointermove', this.moveListener);
        document.addEventListener('pointerup',   this.upListener);
    }

    handleDragMove(e) {
        if (!this.ghost) return;
        const y = e.clientY;
        this.ghost.style.top = `${y - this.offsetY}px`;

        const ghostCenter = y;
        const otherBlocks = Array
            .from(this.container.querySelectorAll('.block'))
            .filter(el => el !== this.draggingEl);

        let swapTarget = null;
        for (const other of otherBlocks) {
            const r = other.getBoundingClientRect();
            if (ghostCenter < r.top + r.height / 2) {
                swapTarget = other;
                break;
            }
        }

        if (swapTarget && swapTarget.previousSibling !== this.draggingEl) {
            this.animateReorder();
            this.container.insertBefore(this.draggingEl, swapTarget);
            this.reorderInternalArray();
        } else if (!swapTarget && this.draggingEl.nextSibling) {
            this.animateReorder();
            this.container.appendChild(this.draggingEl);
            this.reorderInternalArray();
        }
    }

    handleDragEnd() {
        if (this.ghost) this.ghost.remove();
        this.draggingEl.classList.remove('drag-placeholder'); // show it back
        this.ghost = null;
        document.removeEventListener('pointermove', this.moveListener);
        document.removeEventListener('pointerup',   this.upListener);
        this.updateAllBlockLayouts();
    }

    // Initialize CodeMirror for a block
    initializeCodeMirror(blockId) {
        if (!window.CodeMirror) {
            console.error('CodeMirror is not loaded');
            return;
        }
        
        if (!this.codeMirrors) {
            this.codeMirrors = {};
        }
        
        const blockElement = this.getBlockElement(blockId);
        if (!blockElement) return;
        
        const blockContent = blockElement.querySelector('.block-content');
        if (!blockContent) return;
        
        // Create a textarea for CodeMirror to use
        const textarea = document.createElement('textarea');
        blockContent.appendChild(textarea);
        
        // Get stored content if any
        const blockData = this.blocks.find(block => block.id === blockId);
        const content = blockData ? blockData.content || '' : '';
        
        // Initialize CodeMirror
        const cm = CodeMirror.fromTextArea(textarea, {
            mode: 'markdown',
            theme: 'custom',
            lineNumbers: true,
            autoCloseBrackets: true,
            matchBrackets: true,
            styleActiveLine: true,
            lineWrapping: true,
            tabSize: 4,
            placeholder: 'Prompt text...',
            extraKeys: {
                'Tab': function(cm) {
                    cm.replaceSelection('    ', 'end');
                },
                'Ctrl-/': 'toggleComment',
                'Cmd-/': 'toggleComment'
            }
        });
        
        // Set initial content
        cm.setValue(content);
        
        // Set appropriate size
        cm.setSize('100%', 'auto');
        
        // Add event listener to update block content in real-time
        cm.on('change', () => {
            // Update block data when text changes
            const blockData = this.blocks.find(block => block.id === blockId);
            if (blockData) {
                blockData.content = cm.getValue();
            }
            // Adjust layout
            this.updateAllBlockLayouts();
        });
        
        // Store the CodeMirror instance
        this.codeMirrors[blockId] = cm;
    }

    /**
     * Rebuild the editor from a PT-style JSON object
     *   {
     *     blocks: [
     *       { id: "abc123", content: "Some text", muted: false }
     *     ]
     *   }
     */
    loadFromPTJson(json) {
        if (json && Array.isArray(json.blocks)) {
            this.blocks = json.blocks;
        }

        /* wipe current state */
        this.container.innerHTML = '';
        
        // Clear any existing CodeMirror instances
        this.codeMirrors = {};

        /* recreate every block exactly as described */
        this.blocks.forEach(raw => {
            const id   = raw.id || this.generateId();
            const data = {
                id,
                content: raw.content ?? '',
                muted  : !!raw.muted
            };

            /* build DOM */
            const el = this.createBlockElement(id);
            
            /* honour muted flag visually & internally */
            if (data.muted) {
                el.classList.add('muted');
                const muteIcon   = el.querySelector('.mute-icon');
                const mutedSvg   = muteIcon?.querySelector('.muted-icon');
                const unmutedSvg = muteIcon?.querySelector('.unmuted-icon');
                if (muteIcon)  muteIcon.setAttribute('data-state', 'muted');
                if (mutedSvg)  mutedSvg.style.display   = 'inline';
                if (unmutedSvg) unmutedSvg.style.display = 'none';
            }

            this.container.appendChild(el);
            
            // Initialize CodeMirror after the element is in the DOM
            this.initializeCodeMirror(id);
        });

        this.updateAllBlockLayouts();
    }

    /**
     * Produce a PT-style JSON snapshot of the current editor state
     * Returns a plain JS object – call JSON.stringify() if you need a string.
     *   {
     *     blocks: [
     *       { id: "abc123", content: "Some text", muted: false }
     *     ]
     *   }
     */
    getPTJson() {
        const blocks = this.blocks.map(b => {
            /* pull latest content from CodeMirror if available */
            let content = b.content ?? '';
            if (this.codeMirrors && this.codeMirrors[b.id]) {
                content = this.codeMirrors[b.id].getValue();
            }
            
            return {
                id      : b.id,
                content : content,
                muted   : !!b.muted
            };
        });

        return { blocks };
    }
}

function loadCodeMirror(callback) {
    // Skip if already loaded
    if (window.CodeMirror) {
        if (callback) callback();
        return;
    }
    
    // Load CodeMirror script dynamically
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.12/codemirror.min.js';
    script.onload = () => {
        // Register custom theme
        if (window.CodeMirror && !window.CodeMirror.theme) {
            window.CodeMirror.defineOption('theme', 'default', function(cm, val, old) {
                if (old && old != val) {
                    cm.display.wrapper.classList.remove('cm-s-' + old);
                }
                if (val) {
                    cm.display.wrapper.classList.add('cm-s-' + val);
                }
            });
        }
        
        // Load additional CodeMirror resources after the main script is loaded
        const resources = [
            'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.12/mode/markdown/markdown.min.js',
            'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.12/mode/javascript/javascript.min.js',
            'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.12/addon/edit/closebrackets.min.js',
            'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.12/addon/edit/matchbrackets.min.js',
            'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.12/addon/comment/comment.min.js',
            'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.12/addon/selection/active-line.min.js',
            'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.12/addon/display/placeholder.min.js',
            'https://cdnjs.cloudflare.com/ajax/libs/codemirror/5.65.12/codemirror.min.css'
        ];
        
        let loaded = 0;
        const totalResources = resources.length;
        
        resources.forEach(url => {
            if (url.endsWith('.js')) {
                const script = document.createElement('script');
                script.src = url;
                script.onload = () => {
                    loaded++;
                    if (loaded === totalResources && callback) callback();
                };
                document.head.appendChild(script);
            } else if (url.endsWith('.css')) {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = url;
                link.onload = () => {
                    loaded++;
                    if (loaded === totalResources && callback) callback();
                };
                document.head.appendChild(link);
            }
        });
    };
    document.head.appendChild(script);
}

function promptEditorBoot(container, options = {}) {
    if(container.innerHTML.trim() === '') {
        container.innerHTML = `    <div class="tab-container">
        <div class="tab-header">
            <div class="tab active" data-tab="text">Text Editor</div>
            <div class="tab" data-tab="prompt">Prompt Editor</div>
        </div>

        <div class="tab-content-container">
            <div class="tab-content text active">
                <div id="text-editor-container" class="text-editor-container"></div>
            </div>

            <div class="tab-content prompt">
                <div class="editor-container"></div>
            </div>
        </div>
    </div>`;
    }
    /* local handles ---------------------------------------------------------- */
    const editorContainer = container.querySelector('.editor-container');
    const textEditorContainer = container.querySelector('#text-editor-container');
    const tabs = container.querySelectorAll('.tab');
    const blockEditor = new BlockEditor(editorContainer, options);
    let textEditor = null;
    
    options.placeholder = options.placeholder || 'Prompt text…';

    // Load CodeMirror and initialize both editors
    loadCodeMirror(() => {
        // Initialize the text editor with CodeMirror
        initializeTextEditor();
    });
    
    function initializeTextEditor() {
        if (!window.CodeMirror) {
            console.error('CodeMirror is not loaded');
            return;
        }
        
        // Create a textarea for the text editor
        const textarea = document.createElement('textarea');
        textarea.className = 'raw-textarea plain-text';
        textarea.placeholder = options.placeholder;
        textEditorContainer.appendChild(textarea);
        
        // Initialize CodeMirror for the text editor
        textEditor = CodeMirror.fromTextArea(textarea, {
            mode: 'markdown',
            theme: 'custom',
            lineNumbers: true,
            autoCloseBrackets: true,
            matchBrackets: true,
            styleActiveLine: true,
            lineWrapping: true,
            tabSize: 4,
            placeholder: options.placeholder,
            extraKeys: {
                'Tab': function(cm) {
                    cm.replaceSelection('    ', 'end');
                },
                'Ctrl-/': 'toggleComment',
                'Cmd-/': 'toggleComment'
            }
            // Cmd+Enter and Ctrl+Enter handlers removed to prevent double submission
            // The document-level handler in chat.js will handle these keystrokes instead
        });
        
        // Set appropriate size
        textEditor.setSize('100%', '100%');
        
        // Add custom CodeMirror CSS
        const style = document.createElement('style');
        style.textContent = `
            .prompt-editor-container .CodeMirror {
                height: 100%;
                font-family: 'JetBrains Mono', 'Menlo', 'Monaco', 'Consolas', 'Courier New', monospace;
                background-color: var(--bg-code);
                color: var(--text-primary);
            }
            .prompt-editor-container .CodeMirror-gutters {
                background-color: var(--bg-tertiary);
                border-right: 1px solid var(--border-primary);
            }
            .prompt-editor-container .CodeMirror-linenumber {
                color: var(--text-secondary);
            }
            .prompt-editor-container .CodeMirror-cursor {
                border-left: 1px solid var(--text-primary);
            }
            .prompt-editor-container .CodeMirror-activeline-background {
                background-color: var(--bg-active);
            }
            .prompt-editor-container .CodeMirror-placeholder {
                color: var(--text-placeholder);
                opacity: 0.7;
            }
            /* Syntax highlighting */
            .prompt-editor-container .cm-comment {
                color: var(--code-comment);
            }
            .prompt-editor-container .cm-string {
                color: var(--code-string);
            }
            .prompt-editor-container .cm-property {
                color: var(--code-property);
            }
            .prompt-editor-container .cm-keyword {
                color: var(--code-keyword);
            }
        `;
        document.head.appendChild(style);
    }

    /* tab switching ---------------------------------------------------------- */
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabWrap = tab.closest('.tab-container');

            /* header -------------------------------------------------------------- */
            tabWrap.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            /* body ---------------------------------------------------------------- */
            const contentWrap = tabWrap.querySelector('.tab-content-container');
            contentWrap.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

            const targetClass = tab.dataset.tab;                  // "text" | "prompt"
            contentWrap.querySelector(`.${targetClass}`).classList.add('active');

            /* sync textarea ⇄ block-editor --------------------------------------- */
            if (targetClass === 'prompt') {
                syncTextEditorToBlockEditor();
            } else {
                // When switching to text editor, update CodeMirror with current block content
                syncBlockEditorToTextEditor();
            }
        });
    });

    function syncTextEditorToBlockEditor() {
        if (!textEditor) return;
        
        const text = textEditor.getValue();
        const pt = rawTextToPt(text);
        blockEditor.loadFromPTJson(pt);
    }

    function syncBlockEditorToTextEditor() {
        if (!textEditor) return;
        
        const pt = blockEditor.getPTJson();
        const text = ptToRawText(pt);
        textEditor.setValue(text);
    }
    
    /**
     * Clears the content of both text editor and block editor
     */
    function clearContent() {
        // Clear the text editor
        if (textEditor) {
            textEditor.setValue('');
            textEditor.clearHistory();
        }
        
        // Clear the block editor
        const emptyJson = { 
            blocks: [{ 
                id: Math.random().toString(16).slice(2, 8), 
                content: '', 
                muted: false 
            }] 
        };
        blockEditor.loadFromPTJson(emptyJson);
        
        // Ensure all CodeMirror instances are cleared and refreshed
        if (blockEditor.codeMirrors) {
            Object.values(blockEditor.codeMirrors).forEach(cm => {
                cm.setValue('');
                cm.clearHistory();
                cm.refresh();
            });
        }
    }

    return {
        blockEditor,
        getTextEditor: () => textEditor,
        clearContent // Add the new clear method
    };
}

/**
 * Convert a PT-style JSON snapshot into the "raw text" format.
 *  • If there's only one block, return its text verbatim.
 *  • If there are several, emit each block as:
 *        ---block[<id>]---
 *        <content>
 *      Blocks are concatenated with a single newline; no extra
 *      newline appears at the very start or end of the result.
 */
function ptToRawText(pt) {
    if (!pt || !Array.isArray(pt.blocks) || pt.blocks.length === 0) return '';

    /* Single-block → just its text */
    if (pt.blocks.length === 1) {
        return pt.blocks[0].content ?? '';
    }

    /* Multi-block → delimiter lines */
    const parts = pt.blocks.map(b =>
        `---block[${b.id}]---\n${b.content ?? ''}`
    );

    return parts.join('\n');                // no leading / trailing blank lines
}

/**
 * Parse raw text back into PT-style JSON.
 *  • Recognises the delimiter   ---block[<id>]---
 *    (IDs are preserved; any text before the first delimiter
 *    or files with no delimiters become a single new block).
 *  • Returns a plain object:   { blocks: [ … ] }
 *  • Caller can then feed that straight into:
 *        editor.loadFromPTJson(pt);
 */
function rawTextToPt(text) {
    if (typeof text !== 'string') text = '';

    /* Regex picks up "---block[ID]---\n" delimiters */
    const delim = /---block\[(.*?)\]---\n?/g;

    if (!delim.test(text)) {
        /* No delimiters → treat whole input as one block */
        return {
            blocks: [{
                id      : Math.random().toString(16).slice(2, 8),
                content : text.trimEnd(),
                muted   : false
            }]
        };
    }

    /* Reset lastIndex then split, keeping captured IDs */
    delim.lastIndex = 0;
    const pieces = text.split(/---block\[(.*?)\]---\n?/);

    /* pieces = ["", id1, content1, id2, content2, …] */
    const blocks = [];
    for (let i = 1; i < pieces.length; i += 2) {
        const id      = pieces[i];
        const content = (pieces[i + 1] ?? '').replace(/\n$/, ''); // trim final NL
        blocks.push({ id, content, muted: false });
    }

    return { blocks };
}