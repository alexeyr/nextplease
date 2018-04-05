(function () {
    browser.commands.onCommand.addListener((command) => {
        const digit = parseInt(command, 10);

        const message = digit ?
            { digit: digit } :
            { direction: command };
        nextplease.sendMessageToActiveTab(message);
    });

    let contextInfo;
    browser.runtime.onMessage.addListener((message) => {
        if (message.notification) {
            nextplease.notify(message.notification);
        } else if (message.contextType) {
            contextInfo = message;
            updateMenuItems();
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

    browser.contextMenus.onClicked.addListener((info, _) => onItemClicked(info));

    function prefName(direction) {
        return direction + contextInfo.contextType;
    }

    async function updateMenuItems() {
        const target = contextInfo.value;
        browser.contextMenus.update("target", { title: target });
        for (const direction of nextplease.directions) {
            const prefname = prefName(direction);
            const pref = stringArrayFromPref(prefname);

            await browser.contextMenus.update(direction, {
                checked: pref.includes(target)
            });
        }
        browser.contextMenus.refresh();
    }

    function onItemClicked(info) {
        const target = contextInfo.value;
        if (!target) {
            return;
        }
        const direction = info.menuItemId;
        if (nextplease.directions.includes(direction)) {
            // clicked one of the direction items, all others are ignored
            const prefname = prefName(direction);

            // TODO simplify!
            const prefvalue = nextplease.prefs[prefname];
            let resultprefvalue;
            if (!info.wasChecked) {
                resultprefvalue = prefvalue + "\n" + target;
            } else {
                const values = stringArrayFromPref(prefname);
                resultprefvalue = values.filter(v => v != target).join("\n");
            }
            nextplease.prefs[prefname] = resultprefvalue;
        }
    }
})();
