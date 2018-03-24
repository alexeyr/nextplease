(function () {
    browser.commands.onCommand.addListener((command) => {
        const digit = parseInt(command, 10);

        const message = digit ?
            { digit: digit } :
            { direction: command };
        nextplease.sendMessageToActiveTab(message);
    });

    browser.runtime.onMessage.addListener((message) => {
        if (message.notification) {
            nextplease.notify(message.notification);
        }
    });
})();