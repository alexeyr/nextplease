(function () {
    browser.commands.onCommand.addListener((direction) => {
        browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
            var active_tab = tabs[0];

            // TODO handle number shortcuts when commands are added (send {digit:...})
            browser.tabs.sendMessage(active_tab.id, {
                direction: direction
            });
        }).catch(nextplease.logError);
    });
})();