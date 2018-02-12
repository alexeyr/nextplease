(function () {
    /**
      * Listen for commands.
      */
    browser.commands.onCommand.addListener((direction) => {
        browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
            var active_tab = tabs[0];

            browser.tabs.sendMessage(active_tab.id, {
                command: direction
            });
        }).catch(reportExecuteScriptError);
    });

    /**
     * There was an error executing the script.
     * Display the popup's error message, and hide the normal UI.
     */
    function reportExecuteScriptError(error) {
        console.error(`Failed to execute NextPlease script: ${error.message}`);
    }
})();