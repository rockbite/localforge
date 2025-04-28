// Connect the settings button to the settings UI
document.addEventListener('DOMContentLoaded', function() {
    const settingsButton = document.getElementById('settings-button');
    if (settingsButton) {
        settingsButton.addEventListener('click', function() {
            if (window.settingsUI) {
                window.settingsUI.openDialog();
            }
        });
    }
});