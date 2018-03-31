/* eslint no-unused-vars: off */
const nextplease = {};

nextplease.prefs = new Configs({
    allowsubmit: false,
    allownumbershortcuts: true,
    checkframes: true,
    // TODO add to options.html
    digitDelay: 1000,

    prefetch: "smart",

    NextRegex: "^next(\\s+\\d+)?(\\s+\\w+)?\\s*((>{0,2})|»|>|[\u25B6-\u25BB]|\u2192|\u21A0)\\s*$",
    PrevRegex: "^((<{0,2})|«|<|[\u25C0-\u25C5]|\u2190|\u219E)\\s*((prev(ious)?(\\s+\\d+)?(\\s+\\w+)?)|back)\\s*$",
    FirstRegex: "^((<{0,2})|«|<|[\u25C0-\u25C5]|\u2190|\u219E)\\s*(first(\\s+\\d+)?(\\s+\\w+)?)\\s*$",
    LastRegex: "^last(\\s+\\d+)?(\\s+\\w+)?\\s*((>{0,2})|»|>|>|[\u25B6-\u25BB]|\u2192|\u21A0)\\s*$",
    GalleryRegex: "^(.*\\D)(\\d+)((?:\\.\\w+|[\\/])?)$",

    NextPhrase: "next|next >|>|next »|»|next >>|>>|more results|newer »|older topics »|next page|go to the next photo in the stream",
    PrevPhrase: "previous|prev|< previous|previous results|< prev|<|« prev|«|<< prev|<<|« older|« newer topics|previous page|go to the previous photo in the stream",
    FirstPhrase: "first|< first|first page|« first",
    LastPhrase: "last|last >|last page|last »",

    NextImage: "http://g-images.amazon.com/images/G/01/search-browse/button-more-results.gif",
    PrevImage: "http://g-images.amazon.com/images/G/01/search-browse/button-previous.gif",
    FirstImage: "",
    LastImage: "",

    logLevel: 0,

    highlight: false,
    highlightColor: "#ff0000",
    highlightPrefetched: false,
    highlightPrefetchedColor: "#ff6666",

    showAdvanced: false
}, {
    localKeys: []
});

nextplease.log = function (message) {
    if (nextplease.prefs.logLevel > 0) {
        console.log(message);
    }
};

nextplease.logDetail = function (message) {
    if (nextplease.prefs.logLevel > 1) {
        console.debug(message);
    }
};

nextplease.logError = console.error;

nextplease.getDirectionString = function (dir) {
    return browser.i18n.getMessage(dir + "Page");
};

function stringArrayFromPref(prefName) {
    let value = nextplease.prefs[prefName] || "";
    return value.split("|").map((x) => x.toLowerCase().replace(/&pipe;/g, "|"));
}

nextplease.directions = ["Next", "Prev", "First", "Last"];

nextplease.notify = function (input) {
    if (browser.notifications) {
        const { messageKey, messageArgs, titleKey = "extensionName", titleArgs, timeout = 3000, id = undefined } = input;
        const title = browser.i18n.getMessage(titleKey, titleArgs);
        const message = browser.i18n.getMessage(messageKey, messageArgs);
        const options = {
            type: "basic",
            title: title,
            message: message
        };

        function create() {
            const promise = browser.notifications.create(id, options);
            if (timeout > 0) {
                console.log(timeout);
                promise.then((id) => {
                    setTimeout(() => browser.notifications.clear(id), timeout);
                });
            }
        }

        if (id && browser.notifications.update) {
            // try to update existing notification first,
            // which isn't currently supported in Firefox
            browser.notifications.update(id, options).then((updated) => {
                if (!updated) {
                    create();
                }
            });
        } else {
            create();
        }
    } else {
        browser.runtime.sendMessage({notification: input});
    }
};

nextplease.sendMessageToActiveTab = function(message, handleError = nextplease.logError) {
    browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
        const activeTab = tabs[0];
        if (activeTab && activeTab.id) {
            browser.tabs.sendMessage(activeTab.id, message);
        } else {
            nextplease.log("No active tab");
        }
    }).catch(handleError);
};
