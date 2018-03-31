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

    const onShownListener = async (info, tab) => await handleContextMenu(info, tab, true);
    const onClickedListener = async (info, tab) => await handleContextMenu(info, tab, false);

    async function createOrRemoveContextMenu() {
        function createContextMenuItem(options) {
            browser.contextMenus.create(Object.assign(options, {
                contexts: ["link", "image"]
            }), logError);
        }

        function addListenerIfNeeded(event, listener) {
            if (!event.hasListener(listener)) {
                event.addListener(listener);
            }
        }

        if (browser.contextMenus) {
            browser.contextMenus.removeAll();
            if (nextplease.prefs.allowcontextmenu) {
                // TODO don't handle Chrome for now, which doesn't support `onShown`
                // https://stackoverflow.com/questions/49466636/updating-context-menu-depending-on-the-clicked-link-in-a-chrome-extension
                if (browser.contextMenus.onShown) {
                    if (await nextplease.hasContextMenuPermissions()) {
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
                    } else {
                        createContextMenuItem({
                            id: "grantPermission",
                            icons: { "16": "../icons/warning-16.svg" },
                            title: browser.i18n.getMessage("contextMenuGrantPermission")
                        });
                    }

                    addListenerIfNeeded(browser.contextMenus.onShown, onShownListener);
                    addListenerIfNeeded(browser.contextMenus.onClicked, onClickedListener);
                }
            } else {
                browser.contextMenus.onShown.removeListener(onShownListener);
                browser.contextMenus.onClicked.removeListener(onClickedListener);
            }
        } else {
            // no permission, do nothing
        }
    }

    nextplease.prefs.$loaded.then(createOrRemoveContextMenu);
    nextplease.prefs.$addObserver(key => {
        if (key === "allowcontextmenu") {
            createOrRemoveContextMenu();
        }
    });

    async function handleContextMenu(info, tab, isShow) {
        if (!await nextplease.hasContextMenuPermissions()) {
            if (!isShow) {
                await browser.permissions.request(nextplease.allTabsPermission);
            }
            return;
        }

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
})();
