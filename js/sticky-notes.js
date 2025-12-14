
/* ---------- STICKY NOTES LOGIC ---------- */
// Global array to store sticky notes
var stickyNotes = [];

const stickyNoteSettingsModal = document.getElementById('stickyNoteSettingsModal');
const saveStickyNoteSettingsBtn = document.getElementById('saveStickyNoteSettingsBtn');
const cancelStickyNoteSettingsBtn = document.getElementById('cancelStickyNoteSettingsBtn');
const addStickyNoteCtxBtn = document.getElementById('addStickyNoteCtxBtn');
const notePaperColorInput = document.getElementById('notePaperColorInput');
const noteTextColorInput = document.getElementById('noteTextColorInput');
const noteFontSizeDropdown = document.getElementById('noteFontSizeDropdown');
const noteFontSizeSelect = document.getElementById('noteFontSizeSelect');
const noteFontFamilyDropdown = document.getElementById('noteFontFamilyDropdown');
const noteFontFamilySelect = document.getElementById('noteFontFamilySelect');

let currentEditingNoteId = null;
// Track last right-click position so new sticky notes appear at cursor
let lastContextMenuPos = { x: 100, y: 100 };

// record latest contextmenu coordinates (used by Add Sticky Note)
document.addEventListener('contextmenu', (e) => {
    lastContextMenuPos = { x: e.clientX, y: e.clientY };
}, { passive: true });

function saveStickyNotes() {
    localStorage.setItem('stickyNotes', JSON.stringify(stickyNotes));
    if (typeof browser !== 'undefined' && browser.storage) {
        browser.storage.local.set({ stickyNotes: stickyNotes });
    }
}

function renderStickyNotes() {
    // Remove existing notes from DOM
    document.querySelectorAll('.sticky-note').forEach(el => el.remove());

    stickyNotes.forEach(note => {
        const noteEl = document.createElement('div');
        noteEl.className = 'sticky-note';
        noteEl.id = `note-${note.id}`;
        noteEl.style.left = note.x + 'px';
        noteEl.style.top = note.y + 'px';
        // restore saved size if present
        if (note.width) noteEl.style.width = note.width + 'px';
        if (note.height) noteEl.style.height = note.height + 'px';
        noteEl.style.backgroundColor = note.paperColor || '#fff740';
        noteEl.style.zIndex = note.zIndex || 1000;

        const header = document.createElement('div');
        header.className = 'sticky-note-header';

        // Title
        const titleEl = document.createElement('span');
        titleEl.className = 'sticky-note-title';
        titleEl.textContent = note.title || 'Note';
        titleEl.contentEditable = true;
        titleEl.spellcheck = false;

        titleEl.addEventListener('mousedown', (e) => {
            e.stopPropagation(); // Prevent drag
        });
        titleEl.addEventListener('input', () => {
            note.title = titleEl.textContent;
            saveStickyNotes();
        });
        titleEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                titleEl.blur();
            }
        });

        const controls = document.createElement('div');
        controls.className = 'sticky-note-controls';

        const settingsBtn = document.createElement('button');
        settingsBtn.className = 'sticky-note-btn';
        settingsBtn.innerHTML = '⚙️';
        settingsBtn.title = 'Settings';
        settingsBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation(); // Prevent drag start
            openStickyNoteSettings(note.id);
        });

        const anchorBtn = document.createElement('button');
        anchorBtn.className = 'sticky-note-btn anchor-btn';
        anchorBtn.innerHTML = note.isAnchored ? '⚓' : '🔓';
        anchorBtn.title = note.isAnchored ? 'Unanchor' : 'Anchor';
        anchorBtn.style.color = note.isAnchored ? '#000' : '';
        anchorBtn.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            note.isAnchored = !note.isAnchored;
            anchorBtn.innerHTML = note.isAnchored ? '⚓' : '🔓';
            anchorBtn.title = note.isAnchored ? 'Unanchor' : 'Anchor';
            anchorBtn.style.color = note.isAnchored ? '#000' : '';

            // Update docking state immediately
            if (note.isAnchored) {
                content.contentEditable = false;
                titleEl.contentEditable = false; // Disable title editing
                noteEl.classList.add('docked');
            } else {
                content.contentEditable = true;
                titleEl.contentEditable = true; // Enable title editing
                noteEl.classList.remove('docked');
            }

            saveStickyNotes();
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'sticky-note-btn delete-btn';
        deleteBtn.innerHTML = '🗑';
        deleteBtn.title = 'Delete';
        deleteBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            deleteStickyNote(note.id);
        });

        controls.appendChild(anchorBtn);
        controls.appendChild(settingsBtn);
        controls.appendChild(deleteBtn);

        header.appendChild(titleEl);
        header.appendChild(controls);

        const content = document.createElement('div');
        content.className = 'sticky-note-content';
        content.contentEditable = true;
        content.innerHTML = note.content || '';
        content.style.color = note.textColor || '#000000';
        content.style.fontSize = (note.fontSize || 16) + 'px';
        content.style.fontFamily = note.fontFamily || "'Roboto', sans-serif";
        content.spellcheck = false; // Disable spellcheck

        // Docking Logic: if anchored, content is not editable
        if (note.isAnchored) {
            content.contentEditable = false;
            titleEl.contentEditable = false;
            noteEl.classList.add('docked');
        } else {
            content.contentEditable = true;
            titleEl.contentEditable = true;
            noteEl.classList.remove('docked');
        }

        content.addEventListener('input', (e) => {
            note.content = content.innerHTML;
            saveStickyNotes();
        });

        // Custom Context Menu
        content.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showFormattingMenu(e.clientX, e.clientY, content);
        });

        // Checklist click handler
        content.addEventListener('click', (e) => {
            if (e.target.tagName === 'LI' && e.target.closest('ul.checklist')) {
                const rect = e.target.getBoundingClientRect();
                // Check if click is in the left 24px (where the checkbox is)
                if (e.clientX >= rect.left && e.clientX <= rect.left + 24) {
                    e.target.classList.toggle('checked');
                    note.content = content.innerHTML;
                    saveStickyNotes();
                }
            }
        });

        // Handle Enter key in checklists to prevent inheriting 'checked' state
        content.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const selection = window.getSelection();
                if (!selection.rangeCount) return;

                const range = selection.getRangeAt(0);
                const node = range.startContainer;
                const li = node.nodeType === 1 ? node.closest('li') : node.parentElement.closest('li');

                // Only act if we are inside a checklist item
                if (li && li.closest('ul.checklist')) {
                    e.preventDefault(); // Stop default browser behavior

                    // Create a new, unchecked list item
                    const newLi = document.createElement('li');
                    // Add a zero-width space to make the new element selectable and editable
                    newLi.innerHTML = '&#8203;';

                    // Insert the new li after the current one
                    if (li.nextSibling) {
                        li.parentNode.insertBefore(newLi, li.nextSibling);
                    } else {
                        li.parentNode.appendChild(newLi);
                    }

                    // Move cursor to the new li
                    const newRange = document.createRange();
                    newRange.setStart(newLi, 1); // Position cursor after the zero-width space
                    newRange.collapse(true);
                    selection.removeAllRanges();
                    selection.addRange(newRange);

                    // Manually trigger save
                    note.content = content.innerHTML;
                    saveStickyNotes();
                }
            }
        });

        // Create four corner resizers (tl, tr, bl, br)
        const corners = ['tl', 'tr', 'bl', 'br'];
        const maxCap = 500; // smaller max size
        const minW = 120;
        const minH = 80;

        corners.forEach(corner => {
            const r = document.createElement('div');
            r.className = 'sticky-note-resizer resizer-' + corner;
            r.dataset.corner = corner;
            r.title = 'Resize';
            r.style.position = 'absolute';
            r.style.width = '18px';
            r.style.height = '18px';
            r.style.zIndex = 2000;
            r.style.background = 'transparent';
            // cursor per corner
            if (corner === 'tl' || corner === 'br') r.style.cursor = 'nwse-resize';
            else r.style.cursor = 'nesw-resize';

            let isResizingCorner = false;
            r.addEventListener('mousedown', (ev) => {
                ev.stopPropagation();
                ev.preventDefault();
                if (note.isAnchored) return;
                isResizingCorner = true;
                noteEl.classList.add('resizing');

                const startX = ev.clientX;
                const startY = ev.clientY;
                const startW = noteEl.offsetWidth;
                const startH = noteEl.offsetHeight;
                const startLeft = parseInt(noteEl.style.left || 0);
                const startTop = parseInt(noteEl.style.top || 0);

                function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

                function onMouseMove(me) {
                    if (!isResizingCorner) return;
                    const dx = me.clientX - startX;
                    const dy = me.clientY - startY;
                    let newW = startW;
                    let newH = startH;
                    let newLeft = startLeft;
                    let newTop = startTop;

                    if (corner === 'br') {
                        newW = clamp(startW + dx, minW, Math.min(maxCap, window.innerWidth - startLeft - 8));
                        newH = clamp(startH + dy, minH, Math.min(maxCap, window.innerHeight - startTop - 8));
                    } else if (corner === 'bl') {
                        let desiredWidth = startW - dx;
                        desiredWidth = clamp(desiredWidth, minW, maxCap);
                        newW = desiredWidth;
                        newLeft = startLeft + (startW - newW);
                        newLeft = clamp(newLeft, 8, window.innerWidth - newW - 8);
                        newH = clamp(startH + dy, minH, Math.min(maxCap, window.innerHeight - startTop - 8));
                    } else if (corner === 'tr') {
                        let desiredHeight = startH - dy;
                        desiredHeight = clamp(desiredHeight, minH, maxCap);
                        newH = desiredHeight;
                        newTop = startTop + (startH - newH);
                        newTop = clamp(newTop, 8, window.innerHeight - newH - 8);
                        newW = clamp(startW + dx, minW, Math.min(maxCap, window.innerWidth - startLeft - 8));
                    } else if (corner === 'tl') {
                        let desiredWidth = startW - dx;
                        desiredWidth = clamp(desiredWidth, minW, maxCap);
                        newW = desiredWidth;
                        newLeft = startLeft + (startW - newW);
                        newLeft = clamp(newLeft, 8, window.innerWidth - newW - 8);

                        let desiredHeight = startH - dy;
                        desiredHeight = clamp(desiredHeight, minH, maxCap);
                        newH = desiredHeight;
                        newTop = startTop + (startH - newH);
                        newTop = clamp(newTop, 8, window.innerHeight - newH - 8);
                    }

                    noteEl.style.width = newW + 'px';
                    noteEl.style.height = newH + 'px';
                    noteEl.style.left = newLeft + 'px';
                    noteEl.style.top = newTop + 'px';
                    note.width = newW;
                    note.height = newH;
                    note.x = newLeft;
                    note.y = newTop;
                }

                function onMouseUp() {
                    if (!isResizingCorner) return;
                    isResizingCorner = false;
                    noteEl.classList.remove('resizing');
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                    saveStickyNotes();
                }

                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });

            noteEl.appendChild(r);
        });
        noteEl.appendChild(header);
        noteEl.appendChild(content);
        document.body.appendChild(noteEl);

        // Drag Logic
        header.addEventListener('mousedown', (e) => {
            if (e.target.closest('.sticky-note-btn')) return; // Don't drag if clicking buttons
            if (e.target.closest('.sticky-note-title')) return; // Don't drag if clicking title
            if (note.isAnchored) return; // Don't drag if anchored

            e.preventDefault();
            let isDraggingNote = true;
            noteEl.classList.add('dragging');

            // Bring to front
            const maxZ = Math.max(...Array.from(document.querySelectorAll('.sticky-note')).map(n => parseInt(n.style.zIndex || 1000)), 1000);
            noteEl.style.zIndex = maxZ + 1;
            note.zIndex = maxZ + 1;

            const startX = e.clientX;
            const startY = e.clientY;
            const startLeft = parseInt(noteEl.style.left || 0);
            const startTop = parseInt(noteEl.style.top || 0);

            function onMouseMove(ev) {
                if (!isDraggingNote) return;
                const dx = ev.clientX - startX;
                const dy = ev.clientY - startY;

                let newLeft = startLeft + dx;
                let newTop = startTop + dy;

                // Boundary checks
                const maxX = window.innerWidth - noteEl.offsetWidth;
                const maxY = window.innerHeight - noteEl.offsetHeight;

                newLeft = Math.max(0, Math.min(newLeft, maxX));
                newTop = Math.max(0, Math.min(newTop, maxY));

                noteEl.style.left = newLeft + 'px';
                noteEl.style.top = newTop + 'px';

                note.x = newLeft;
                note.y = newTop;
            }

            function onMouseUp() {
                isDraggingNote = false;
                noteEl.classList.remove('dragging');
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                saveStickyNotes();
            }

            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    });
}

/* ---------- FORMATTING MENU ---------- */
let activeFormattingMenu = null;

function showFormattingMenu(x, y, targetElement) {
    hideFormattingMenu();

    const menu = document.createElement('div');
    menu.className = 'formatting-menu';
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';

    const actions = [
        { label: 'Bold', icon: '<b>B</b>', cmd: 'bold' },
        { label: 'Italic', icon: '<i>I</i>', cmd: 'italic' },
        { separator: true },
        { label: 'Header', icon: 'H', cmd: 'formatBlock', value: 'H2' },
        { label: 'List', icon: '•', cmd: 'insertUnorderedList' },
        { label: 'Numbered List', icon: '1.', cmd: 'insertOrderedList' },
        { label: 'Checklist', icon: '☑', cmd: 'checklist' }
    ];



    actions.forEach(action => {
        if (action.separator) {
            const sep = document.createElement('div');
            sep.className = 'formatting-menu-separator';
            menu.appendChild(sep);
            return;
        }

        const btn = document.createElement('button');
        btn.innerHTML = `<span style="width: 20px; text-align: center;">${action.icon}</span> ${action.label}`;

        // Check active state
        let isActive = false;

        // Helper to check if current selection is inside a checklist
        const isInsideChecklist = () => {
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                const node = selection.anchorNode;
                const ul = node.nodeType === 1 ? node.closest('ul.checklist') : (node.parentElement ? node.parentElement.closest('ul.checklist') : null);
                return !!ul;
            }
            return false;
        };

        if (action.cmd === 'checklist') {
            isActive = isInsideChecklist();
        } else if (action.cmd === 'insertUnorderedList') {
            // Only active if it's a list BUT NOT a checklist
            isActive = document.queryCommandState('insertUnorderedList') && !isInsideChecklist();
        } else if (action.cmd === 'formatBlock') {
            isActive = document.queryCommandValue('formatBlock').toLowerCase() === action.value.toLowerCase();
        } else {
            isActive = document.queryCommandState(action.cmd);
        }

        if (isActive) btn.classList.add('active');

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            execFormat(action.cmd, action.value, targetElement);
            hideFormattingMenu();
        });
        menu.appendChild(btn);
    });

    // Color Rows Container
    const colorContainer = document.createElement('div');
    colorContainer.className = 'formatting-menu-colors';

    // Helper to create Toggle+Picker Row
    const createColorRow = (label, toolTip, cmd, isHighlight) => {
        // Get current value
        let isActive = false;
        let currentHex = '#000000'; // Default black

        if (isHighlight) {
            // Highlight Logic: Check for explicit background color on ancestors
            // queryCommandValue('hiliteColor') is unreliable as it often returns the paper color
            currentHex = 'transparent'; // Default transparent
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                let node = selection.anchorNode;
                // Traverse up to find a span with background-color
                // Limit traversal to avoid going too far up (e.g. to sticky-note-content)
                while (node && (node.nodeType === 1 || (node.nodeType === 3 && node.parentElement))) {
                    const el = node.nodeType === 1 ? node : node.parentElement;
                    if (el.classList.contains('sticky-note-content')) break;
                    if (el.style.backgroundColor && el.style.backgroundColor !== 'transparent' && el.style.backgroundColor !== 'rgba(0, 0, 0, 0)') {
                        currentHex = rgbToHex(el.style.backgroundColor);
                        isActive = true;
                        break;
                    }
                    node = el.parentElement;
                }
            }
        } else {
            // Text Color Logic
            const rawValue = document.queryCommandValue('foreColor');
            currentHex = rgbToHex(rawValue);
            isActive = currentHex !== '#000000';
        }

        const row = document.createElement('div');
        row.className = 'formatting-menu-color-row';

        // Toggle Label Button
        const toggleBtn = document.createElement('button');
        toggleBtn.className = `formatting-menu-color-toggle ${isActive ? 'active' : ''}`;
        // When inactive, cursor should be default or pointer? User implies it's "not toggleable"
        // We will style inactive as simple label, active as "pressed/clickable"
        toggleBtn.innerHTML = `<span>${label}</span>`;
        toggleBtn.title = isActive ? `Remove ${toolTip}` : toolTip;

        // Color Picker Input Container (for circular style)
        const pickerContainer = document.createElement('div');
        pickerContainer.className = 'formatting-menu-picker-container';

        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.className = 'formatting-menu-color-picker';
        // If transparent (highlight default), input color should be black per user request.
        colorInput.value = (isHighlight && currentHex === 'transparent') ? '#000000' : currentHex;
        colorInput.title = `Change ${toolTip}`;

        pickerContainer.appendChild(colorInput);

        // Interaction Logic

        // 1. Picking a color applies it immediately and sets active
        colorInput.addEventListener('input', (e) => {
            e.preventDefault();
            e.stopPropagation();
            execFormat(cmd, e.target.value, targetElement);
            // Manually update state
            toggleBtn.classList.add('active');
            toggleBtn.title = `Remove ${toolTip}`;
        });

        // 2. Clicking Toggle
        toggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (toggleBtn.classList.contains('active')) {
                // Turn OFF -> Reset to default
                const defaultVal = isHighlight ? 'transparent' : '#000000';
                execFormat(cmd, defaultVal, targetElement);
                toggleBtn.classList.remove('active');
                toggleBtn.title = toolTip;
            } else {
                // Inactive: Do nothing (or strictly, user said "becomes toggleble... to indicate I can undo it")
                // So clicking label when inactive implies no action. 
                // Usage is: Pick color -> Active. Then Click label -> Removed.
            }
        });

        row.appendChild(toggleBtn);
        row.appendChild(pickerContainer);
        return row;
    };

    const sep = document.createElement('div');
    sep.className = 'formatting-menu-separator';
    menu.appendChild(sep);

    menu.appendChild(createColorRow('Text', 'Text Color', 'foreColor', false));
    menu.appendChild(createColorRow('Highlight', 'Highlight Color', 'hiliteColor', true));

    document.body.appendChild(menu);
    activeFormattingMenu = menu;

    // Adjust position if off-screen
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) menu.style.left = (window.innerWidth - rect.width - 10) + 'px';
    if (rect.bottom > window.innerHeight) menu.style.top = (window.innerHeight - rect.height - 10) + 'px';
}

function hideFormattingMenu() {
    if (activeFormattingMenu) {
        activeFormattingMenu.remove();
        activeFormattingMenu = null;
    }
}

function execFormat(cmd, value, targetElement) {
    targetElement.focus();
    if (cmd === 'checklist') {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;

        const node = selection.anchorNode;
        const existingUl = node.nodeType === 1 ? node.closest('ul') : (node.parentElement ? node.parentElement.closest('ul') : null);

        if (existingUl) {
            if (existingUl.classList.contains('checklist')) {
                // Already a checklist. Toggle off -> remove list structure entirely (standard behavior)
                document.execCommand('insertUnorderedList');
            } else {
                // Normal list -> convert to checklist
                existingUl.classList.add('checklist');
            }
        } else {
            // Not a list -> create checklist
            document.execCommand('insertUnorderedList');
            // Find the new list and add class
            const newSelection = window.getSelection();
            if (newSelection.rangeCount > 0) {
                const newNode = newSelection.anchorNode;
                const newUl = newNode.nodeType === 1 ? newNode.closest('ul') : (newNode.parentElement ? newNode.parentElement.closest('ul') : null);
                if (newUl) newUl.classList.add('checklist');
            }
        }
    } else if (cmd === 'formatBlock') {
        const current = document.queryCommandValue('formatBlock');
        if (current.toLowerCase() === value.toLowerCase()) {
            document.execCommand('formatBlock', false, 'div');
        } else {
            document.execCommand('formatBlock', false, value);
        }
    } else {
        document.execCommand(cmd, false, value);
    }
}

// Close formatting menu on click elsewhere
document.addEventListener('click', (e) => {
    if (activeFormattingMenu && !activeFormattingMenu.contains(e.target)) {
        hideFormattingMenu();
    }
});

function addStickyNote() {
    if (stickyNotes.length >= 15) {
        if (typeof showCustomAlert === 'function') {
            showCustomAlert('You can only create up to 15 sticky notes.');
        } else {
            alert('You can only create up to 15 sticky notes.');
        }
        return;
    }

    // Place initial note near last context-menu (cursor) position, with small offset
    // Default size is a perfect square
    const defaultSize = 220;
    let startX = lastContextMenuPos.x + 8;
    let startY = lastContextMenuPos.y + 8;
    // Keep inside viewport
    startX = Math.max(8, Math.min(startX, window.innerWidth - defaultSize - 8));
    startY = Math.max(8, Math.min(startY, window.innerHeight - defaultSize - 8));

    // Soft Lavender first, then Buttercream Yellow, Sage Mist, Pale Periwinkle, Dusty Rose
    const defaultColors = ['#EDE0F5', '#FFF4BD', '#D4EAC8', '#D6EAF8', '#FADBD8'];

    let nextColor = defaultColors[0];
    if (stickyNotes.length > 0) {
        const lastColor = stickyNotes[stickyNotes.length - 1].paperColor;
        const lastIndex = defaultColors.indexOf(lastColor);
        if (lastIndex !== -1) {
            nextColor = defaultColors[(lastIndex + 1) % defaultColors.length];
        }
    }

    const newNote = {
        id: Date.now(),
        x: startX,
        y: startY,
        width: defaultSize,
        height: defaultSize,
        content: '',
        title: 'Note',
        paperColor: nextColor,
        textColor: '#000000',
        fontSize: 16,
        fontFamily: "'Roboto', sans-serif",
        zIndex: 1000 + stickyNotes.length
    };

    stickyNotes.push(newNote);
    saveStickyNotes();
    renderStickyNotes();

    // Close the settings modal to show the new note
    if (typeof closeEditModal === 'function') closeEditModal();
    const editButtonContextMenu = document.getElementById('editButtonContextMenu');
    if (editButtonContextMenu) editButtonContextMenu.style.display = 'none';
}

function deleteStickyNote(id) {
    if (typeof showCustomConfirm === 'function') {
        showCustomConfirm('Are you sure you want to delete this note?', () => {
            stickyNotes = stickyNotes.filter(n => n.id !== id);
            saveStickyNotes();
            renderStickyNotes();
        });
    } else {
        if (confirm('Are you sure you want to delete this note?')) {
            stickyNotes = stickyNotes.filter(n => n.id !== id);
            saveStickyNotes();
            renderStickyNotes();
        }
    }
}

function openStickyNoteSettings(id) {
    currentEditingNoteId = id;
    const note = stickyNotes.find(n => n.id === id);
    if (!note) return;

    notePaperColorInput.value = note.paperColor || '#fff740';
    noteTextColorInput.value = note.textColor || '#000000';

    // Set font size dropdown
    const currentFontSize = note.fontSize || 16;
    if (noteFontSizeSelect) {
        noteFontSizeSelect.value = currentFontSize;
        const fontSizeLabel = noteFontSizeDropdown.querySelector('.current-font-label');
        if (fontSizeLabel) fontSizeLabel.textContent = currentFontSize + 'px';
    }

    // Set font family dropdown
    const currentFont = note.fontFamily || "'Roboto', sans-serif";
    noteFontFamilySelect.value = currentFont;
    const fontLabel = noteFontFamilyDropdown.querySelector('.current-font-label');
    const option = noteFontFamilyDropdown.querySelector(`.dropdown-option[data-value="${currentFont}"]`);
    if (fontLabel && option) {
        fontLabel.textContent = option.textContent;
        fontLabel.style.fontFamily = currentFont;
    }

    stickyNoteSettingsModal.style.display = 'flex';
    document.body.classList.add('modal-open');
}

// Event Listeners for Sticky Note Settings
if (addStickyNoteCtxBtn) {
    addStickyNoteCtxBtn.addEventListener('click', addStickyNote);
}

if (saveStickyNoteSettingsBtn) {
    saveStickyNoteSettingsBtn.addEventListener('click', () => {
        if (currentEditingNoteId) {
            const note = stickyNotes.find(n => n.id === currentEditingNoteId);
            if (note) {
                note.paperColor = notePaperColorInput.value;
                note.textColor = noteTextColorInput.value;
                note.fontSize = parseInt(noteFontSizeSelect.value);
                note.fontFamily = noteFontFamilySelect.value;
                saveStickyNotes();
                renderStickyNotes();
            }
        }
        stickyNoteSettingsModal.style.display = 'none';
        document.body.classList.remove('modal-open');
        currentEditingNoteId = null;
    });
}

if (cancelStickyNoteSettingsBtn) {
    cancelStickyNoteSettingsBtn.addEventListener('click', () => {
        stickyNoteSettingsModal.style.display = 'none';
        document.body.classList.remove('modal-open');
        currentEditingNoteId = null;
    });
}


// Dropdown logic for sticky note font size
if (noteFontSizeDropdown) {
    const selected = noteFontSizeDropdown.querySelector('.dropdown-selected');
    const options = noteFontSizeDropdown.querySelector('.dropdown-options');
    const hiddenInput = document.getElementById('noteFontSizeSelect');
    const labelSpan = selected.querySelector('.current-font-label');

    selected.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.custom-dropdown').forEach(d => {
            if (d !== noteFontSizeDropdown) d.classList.remove('open');
        });
        noteFontSizeDropdown.classList.toggle('open');
    });

    options.querySelectorAll('.dropdown-option').forEach(opt => {
        opt.addEventListener('click', (e) => {
            e.stopPropagation();
            const val = opt.dataset.value;
            const text = opt.textContent;
            hiddenInput.value = val;
            labelSpan.textContent = text;
            noteFontSizeDropdown.classList.remove('open');
        });
    });
}

// Dropdown logic for sticky note font family
if (noteFontFamilyDropdown) {
    const selected = noteFontFamilyDropdown.querySelector('.dropdown-selected');
    const options = noteFontFamilyDropdown.querySelector('.dropdown-options');
    const hiddenInput = document.getElementById('noteFontFamilySelect');
    const labelSpan = selected.querySelector('.current-font-label');

    selected.addEventListener('click', (e) => {
        e.stopPropagation();
        // Close other dropdowns
        document.querySelectorAll('.custom-dropdown').forEach(d => {
            if (d !== noteFontFamilyDropdown) d.classList.remove('open');
        });
        noteFontFamilyDropdown.classList.toggle('open');
    });

    options.querySelectorAll('.dropdown-option').forEach(opt => {
        opt.addEventListener('click', (e) => {
            e.stopPropagation();
            const val = opt.dataset.value;
            const text = opt.textContent;
            hiddenInput.value = val;
            labelSpan.textContent = text;
            labelSpan.style.fontFamily = val;
            noteFontFamilyDropdown.classList.remove('open');
        });
    });
}

// Close sticky note settings modal on Escape
window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        if (stickyNoteSettingsModal && stickyNoteSettingsModal.style.display === 'flex') {
            stickyNoteSettingsModal.style.display = 'none';
            document.body.classList.remove('modal-open');
            currentEditingNoteId = null;
        }
    }
});
