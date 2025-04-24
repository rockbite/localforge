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

        const textarea = document.createElement('textarea');
        textarea.className = 'block-textarea';
        textarea.placeholder = 'Prompt text...';
        textarea.rows = 1;
        textarea.addEventListener('input', () => this.updateAllBlockLayouts());
        blockContent.appendChild(textarea);
        makeSmartTextarea(textarea, {}, this);

        // inside createBlockElement(), just after textarea is created
        textarea.addEventListener('keydown', e => {
            if (e.key !== 'Tab') return;          // bail if it’s not the Tab key
            e.preventDefault();

            const indent = '    ';                // 4 spaces (‘\t’ works too)
            const { value } = textarea;
            let  { selectionStart: start, selectionEnd: end } = textarea;

            // Locate the first/last line boundaries that the caret or selection touches
            const firstLineStart = value.lastIndexOf('\n', start - 1) + 1;
            const lastLineEnd    = (value.indexOf('\n', end) === -1) ? value.length
                : value.indexOf('\n', end);

            // Slice out the affected block (one or many lines)
            const block   = value.slice(firstLineStart, lastLineEnd);
            const lines   = block.split('\n');

            if (e.shiftKey) {
                // -------- Shift-Tab = outdent --------
                let removed = 0;
                const newLines = lines.map(line => {
                    if (line.startsWith(indent)) {
                        removed += indent.length;
                        return line.slice(indent.length);
                    }
                    return line;
                });

                const newBlock = newLines.join('\n');
                textarea.value = value.slice(0, firstLineStart) + newBlock + value.slice(lastLineEnd);

                // Shrink the selection (can’t go past the start of the document)
                const shrink = Math.min(removed, start - firstLineStart);
                textarea.selectionStart = start - shrink;
                textarea.selectionEnd   = end   - removed;
            } else {
                // -------- Tab = indent --------
                const newLines = lines.map(line => indent + line);
                const newBlock = newLines.join('\n');
                textarea.value = value.slice(0, firstLineStart) + newBlock + value.slice(lastLineEnd);

                // Grow the selection to account for added spaces
                textarea.selectionStart = start + indent.length;
                textarea.selectionEnd   = end   + (indent.length * lines.length);
            }
        });


        const blockFooter = document.createElement('div');
        blockFooter.className = 'block-footer';

        mainContent.append(blockHeader, blockContent, blockFooter);
        blockDiv.append(leftControls, mainContent);

        // Add event listeners for copy functionality
        const copyIcon = blockDiv.querySelector('.copy-icon');
        if (copyIcon) {
            copyIcon.addEventListener('click', () => {
                const textArea = blockDiv.querySelector('.block-textarea');
                if (textArea) {
                    navigator.clipboard.writeText(textArea.value)
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
                    this.finishRenaming(id, true); // save changes
                } else if (e.key === 'Escape') {
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
        requestAnimationFrame(() => blockEl.querySelector('.block-textarea')?.focus());
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
            const ta         = el.querySelector('.block-textarea');
            const topSeg     = el.querySelector('.top-segment');
            const bottomSeg  = el.querySelector('.bottom-segment');
            const addBtn     = el.querySelector('.add-button');
            const textBtn    = el.querySelector('.text-button');
            if (!ta || !topSeg || !bottomSeg || !addBtn || !textBtn) return;

            ta.style.height = 'auto';
            let h = ta.scrollHeight-7;
            h = Math.min(h, 200);
            ta.style.height = `${h}px`;

            const connH = h + 27;
            topSeg.style.height = `${connH}px`;
            addBtn.style.marginTop = `${connH - 2}px`;
            textBtn.style.marginTop = '0';
            bottomSeg.style.top = `${connH + 64}px`;
            bottomSeg.style.display = i < els.length - 1 ? 'block' : 'none';
            if (i < els.length - 1) bottomSeg.style.height = '6px';
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
            const ta = el.querySelector('.block-textarea');
            if (ta) ta.value = data.content;

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
            /* pull latest textarea text from the DOM (in case user edited) */
            const el = this.getBlockElement(b.id);
            const ta = el?.querySelector('.block-textarea');
            return {
                id      : b.id,
                content : ta ? ta.value : (b.content ?? ''),
                muted   : !!b.muted
            };
        });

        return { blocks };
    }
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
                <textarea class="raw-textarea plain-text" placeholder="Prompt text…"></textarea>
            </div>

            <div class="tab-content prompt">
                <div class="editor-container"></div>
            </div>
        </div>
    </div>`;
    }

    /* local handles ---------------------------------------------------------- */
    const editorContainer = container.querySelector('.editor-container');
    const textarea        = container.querySelector('.plain-text');
    const tabs            = container.querySelectorAll('.tab');
    const editor          = new BlockEditor(editorContainer, options);

    options.placeholder = options.placeholder || 'Prompt text…';

    textarea.placeholder = options.placeholder;

    makeSmartTextarea(textarea);

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
                syncTextareaToEditor(textarea, editor);
            } else {
                textarea.value = ptToRawText(editor.getPTJson());
            }
        });
    });

    return editor;
}

function syncTextareaToEditor(textarea, editor) {
    const pt  = rawTextToPt(textarea.value);

    if (pt.blocks.length === 1 && editor.blocks.length <= 1) {
        if (editor.blocks.length === 0) {
            editor.addBlock(pt.blocks[0]);
        } else {
            editor.blocks[0].content = pt.blocks[0].content;
        }
    } else {
        pt.blocks.forEach(block => {
            const hit = editor.blocks.find(b => b.id === block.id);
            if (hit) hit.content = block.content;
        });
    }

    editor.loadFromPTJson();
    editor.updateAllBlockLayouts();
}


/**
 * Convert a PT-style JSON snapshot into the “raw text” format.
 *  • If there’s only one block, return its text verbatim.
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

    /* Regex picks up “---block[ID]---\n” delimiters */
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

/**
 * Give a plain <textarea> some basic code-editor super-powers.
 * @param {HTMLTextAreaElement} ta
 * @param {Object} [opts]
 * @param {number} [opts.tabSize=4]   – how many spaces a “tab” inserts
 * @param {number} [opts.maxUndo=200] – max history snapshots to keep
 */
function makeSmartTextarea(ta, opts = {}, editor) {
    const TAB     = " ".repeat(opts.tabSize ?? 4);
    const MAX_UNDO = opts.maxUndo ?? 200;

    // --- simple undo / redo history -----------------------------------------
    const history =  [];
    let   index   = -1;
    const push = () => {
        // squash identical consecutives
        if (index >= 0 && history[index].value === ta.value) return;
        history.splice(index + 1);                 // drop forward stack
        history.push({ value: ta.value, start: ta.selectionStart, end: ta.selectionEnd });
        if (history.length > MAX_UNDO) history.shift();
        index = history.length - 1;
        if(editor) editor.updateAllBlockLayouts();
    };
    const apply = delta => {
        if (!history.length) return;
        index = Math.min(Math.max(index + delta, 0), history.length - 1);
        const snap = history[index];
        ta.value = snap.value;
        ta.setSelectionRange(snap.start, snap.end);
        if(editor) editor.updateAllBlockLayouts();
    };
    push();               // initial snapshot
    ta.addEventListener("input", push, { passive: true });   // new snapshot on any change

    // ------------------------------------------------- helper utils ----------
    const getLineStart = pos => ta.value.lastIndexOf("\n", pos - 1) + 1;
    const getLine      = pos => {
        const start = getLineStart(pos);
        const end   = ta.value.indexOf("\n", pos);
        return ta.value.slice(start, end === -1 ? undefined : end);
    };

    ta.addEventListener("keydown", e => {
        const { key, ctrlKey, metaKey, shiftKey } = e;
        const mod = ctrlKey || metaKey;

        // -------- undo / redo (uses our own stack, survives blur) --------------
        if (mod && key === "z") { e.preventDefault(); apply( shiftKey ? +1 : -1 ); return; }
        if (mod && key === "y") { e.preventDefault(); apply(+1); return; }

        // ---------------------- TAB / SHIFT-TAB --------------------------------
        if (key === "Tab") {
            e.preventDefault();
            const { selectionStart: s, selectionEnd: ePos, value } = ta;
            const linesStart = getLineStart(s);
            const linesEnd   = ePos;
            const before     = value.slice(0, linesStart);
            const selected   = value.slice(linesStart, linesEnd);
            const after      = value.slice(linesEnd);

            if (shiftKey) {
                // out-dent every line that starts with TAB
                const outdented = selected
                    .split("\n")
                    .map(l => l.startsWith(TAB) ? l.slice(TAB.length) : l)
                    .join("\n");

                ta.value = before + outdented + after;
                const delta = selected.length - outdented.length;
                ta.selectionStart = s - (s === linesStart ? 0 : TAB.length); // keep anchor
                ta.selectionEnd   = ePos - delta;
            } else {
                // indent
                const indented = selected.replace(/^/gm, TAB);
                ta.value = before + indented + after;
                const delta = indented.length - selected.length;
                ta.selectionStart = s + TAB.length;
                ta.selectionEnd   = ePos + delta;
            }
            if(editor) editor.updateAllBlockLayouts();
            return;
        }

        // -------------------- auto-indent + bullets + pair ---------------------
        if (key === "Enter") {
            e.preventDefault();
            const { selectionStart: s, selectionEnd: ePos, value } = ta;
            const line = getLine(s);
            const indentMatch = line.match(/^\s+/);
            const indent = indentMatch ? indentMatch[0] : "";
            const bulletMatch = line.match(/^(\s*)([*-]\s)/);
            const bullet = bulletMatch ? bulletMatch[2] : "";

            const nl = "\n" + indent + bullet;
            ta.value = value.slice(0, s) + nl + value.slice(ePos);
            const pos = s + nl.length;
            ta.setSelectionRange(pos, pos);
            if(editor) editor.updateAllBlockLayouts();
            return;
        }

        // ---------------------- bracket / quote pair ---------------------------
        const PAIRS = { "(":")", "[":"]", "{":"}", "'":"'", '"':'"' };
        if (PAIRS[key] && !mod) {
            const { selectionStart: s, selectionEnd: ePos, value } = ta;
            e.preventDefault();
            const open = key, close = PAIRS[key];
            const inside = value.slice(s, ePos);
            ta.value = value.slice(0, s) + open + inside + close + value.slice(ePos);
            const cursor = inside ? ePos + 2 : s + 1;
            ta.setSelectionRange(inside ? s : cursor, inside ? ePos + 2 : cursor);
            if(editor) editor.updateAllBlockLayouts();
            return;
        }
    });
}