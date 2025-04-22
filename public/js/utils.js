// src/utils.js
// Purpose: Contains shared utility functions used across different modules.

/**
 * Formats elapsed time in milliseconds into a human-readable string (e.g., "1.2s", "15s").
 * @param {HTMLElement | null} element - The DOM element to update (optional).
 * @param {number} elapsedMs - The elapsed time in milliseconds.
 * @returns {string} The formatted time string.
 */
export function updateTimerDisplay(element, elapsedMs) {
    const elapsedSec = elapsedMs / 1000;
    let displayTime;

    if (elapsedSec < 0) {
        displayTime = '0.0s'; // Avoid negative display
    } else if (elapsedSec < 10) {
        displayTime = elapsedSec.toFixed(1) + 's';
    } else {
        displayTime = Math.floor(elapsedSec) + 's';
    }

    if (element) {
        element.textContent = displayTime;
    }
    return displayTime;
}

/**
 * Shows a confirmation modal using Shoelace dialog.
 * @param {object} options - Configuration options.
 * @param {string} [options.title='Confirm Action'] - The title for the dialog.
 * @param {string} options.message - The main confirmation message.
 * @param {string} [options.itemName=''] - The specific item name (e.g., project/session name) to display.
 * @param {string} [options.confirmText='Confirm'] - Text for the confirmation button.
 * @param {'primary' | 'success' | 'neutral' | 'warning' | 'danger' | 'text'} [options.confirmVariant='danger'] - Shoelace variant for the confirm button.
 * @param {string} [options.cancelText='Cancel'] - Text for the cancel button.
 * @returns {Promise<boolean>} - Resolves true if confirmed, false if canceled.
 */
export function showConfirmationModal({
    title = 'Confirm Action',
    message,
    itemName = '',
    confirmText = 'Confirm',
    confirmVariant = 'danger',
    cancelText = 'Cancel'
}) {
    return new Promise((resolve) => {
        const dialog = document.getElementById('confirmation-dialog');
        const messageEl = document.getElementById('confirmation-message');
        const itemNameEl = document.getElementById('confirmation-item-name');
        const confirmButton = dialog.querySelector('.confirm-button');
        const cancelButton = dialog.querySelector('.cancel-button');

        if (!dialog || !messageEl || !itemNameEl || !confirmButton || !cancelButton) {
            console.error('Confirmation dialog elements not found!');
            // Fallback to browser confirm if modal elements are missing
            resolve(window.confirm(`${message}${itemName ? `\n\nItem: ${itemName}` : ''}` ));
            return;
        }

        // Update dialog content
        dialog.label = title;
        messageEl.textContent = message;
        itemNameEl.textContent = itemName;
        itemNameEl.style.display = itemName ? 'block' : 'none'; // Show only if itemName is provided

        // Update buttons
        confirmButton.textContent = confirmText;
        confirmButton.variant = confirmVariant;
        cancelButton.textContent = cancelText;

        // --- Event Handling ---
        // Function to run when confirmed
        const onConfirm = () => {
            cleanup();
            resolve(true);
            dialog.hide();
        };

        // Function to run when canceled
        const onCancel = () => {
            cleanup();
            resolve(false);
            dialog.hide(); // Ensure dialog hides on cancel click too
        };

        // Function to cleanup listeners
        const cleanup = () => {
            confirmButton.removeEventListener('click', onConfirm);
            cancelButton.removeEventListener('click', onCancel);
            // Also listen for Shoelace's hide event to handle closing via Esc or overlay click
            dialog.removeEventListener('sl-hide', onCancelOnHide); 
        };

        // Handler specifically for sl-hide event
        const onCancelOnHide = (event) => {
            // Only resolve(false) if the hide wasn't triggered by clicking confirm/cancel buttons
            // (Those cases are handled by onConfirm/onCancel already)
            if (event.target === dialog) { // Make sure it's the dialog hiding
                cleanup(); // Ensure cleanup happens regardless
                resolve(false);
            }
        };

        // Remove any previous listeners (important!) and add new ones
        confirmButton.addEventListener('click', onConfirm);
        cancelButton.addEventListener('click', onCancel);
        dialog.addEventListener('sl-hide', onCancelOnHide);

        // Show the dialog
        dialog.show();
    });
}

// Note: Initialization logic for external libraries like 'marked' or 'Prism'
// is omitted here. It's assumed they are loaded and configured globally
// via <script> tags or another module bundler setup.
// If specific configuration were needed, it could potentially go here.
// export function configureMarkdown() {
//     // Example: marked.setOptions(...)
// }