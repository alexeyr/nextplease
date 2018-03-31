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

    function logError() {
        if (browser.runtime.lastError) {
            nextplease.logError(browser.runtime.lastError);
        }
    }

    function createContextMenuItem(options) {
        browser.contextMenus.create(Object.assign(options, {
            contexts: ["link", "image"]
        }), logError);
    }

    // TODO can't handle Chrome for now, which doesn't support this
    // https://stackoverflow.com/questions/49466636/updating-context-menu-depending-on-the-clicked-link-in-a-chrome-extension
    if (browser.contextMenus.onShown) {
        createContextMenuItem({ id: "target", title: "%s" });

        createContextMenuItem({ type: "separator" });

        for (const direction of nextplease.directions) {
            const itemTitle = browser.i18n.getMessage("useContextMenu",
                [browser.i18n.getMessage(`${direction}Page`)]);

            createContextMenuItem({
                id: direction,
                type: "checkbox",
                title: itemTitle
            });
        }
    }

    async function handleContextMenu(info, tab, isShow) {
        const isImage = info.mediaType && info.mediaType === "image";
        const target = isImage ? info.linkUrl : nextplease.normalize(info.linkText);

        function prefName(direction) {
            return direction + (isImage ? "Image" : "Phrase");
        }
        if (isShow) {
            // we're in onShown
            browser.contextMenus.update("target", { title: target });
            for (const direction of nextplease.directions) {
                const prefname = prefName(direction);
                const pref = stringArrayFromPref(prefname);

                if (pref.includes(target)) {
                    browser.contextMenus.update(direction, {
                        checked: true
                    });
                } else {
                    browser.contextMenus.update(direction, {
                        checked: false
                    });
                }
            }
            browser.contextMenus.refresh();
        } else {
            // we're in onClicked
            const direction = info.menuItemId;
            if (nextplease.directions.includes(direction)) {
                // clicked one of the direction items, all others are ignored
                const prefname = prefName(direction);

                // TODO simplify!
                const prefvalue = nextplease.prefs[prefname];
                var resultprefvalue;
                if (!info.wasChecked) {
                    resultprefvalue = prefvalue + "\n" + target;
                } else {
                    const values = stringArrayFromPref(prefname);
                    resultprefvalue = values.filter(v => v != target).join("\n");
                }
                nextplease.prefs[prefname] = resultprefvalue;
            }
        }
    }

    browser.contextMenus.onShown.addListener(async (info, tab) => await handleContextMenu(info, tab, true));

    browser.contextMenus.onClicked.addListener(async (info, tab) => await handleContextMenu(info, tab, false));
})();
