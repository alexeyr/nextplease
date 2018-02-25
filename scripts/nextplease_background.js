(function () {
    browser.commands.onCommand.addListener((direction) => {
        browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
            var active_tab = tabs[0];

            // TODO handle number shortcuts when commands are added
            browser.tabs.sendMessage(active_tab.id, {
                command: direction
            });
        }).catch(nextplease.logError);
    });
})();