(function () {
    const pageNumInput = $("#PageNum");
    const pageNumButton = $("#PageNumButton");

    function goToPage() {
        const pageNumStr = pageNumInput.val();
        console.log(`pageNumStr: "${pageNumStr}"`);
        if (pageNumStr) {
            const pageNum = parseInt(pageNumStr, 10);
            if (pageNum) {
                nextplease.sendMessageToActiveTab({ number: pageNum });
            } else {
                nextplease.notify({
                    titleKey: "pageNumErrorTitle",
                    messageKey: "pageNumErrorMsg",
                    messageArgs: [pageNumStr]
                });
            }
        }
    }

    pageNumInput.keyup((e) => {
        pageNumButton.attr("disabled", !parseInt(pageNumInput.val(), 10));
    });
    pageNumInput.change(goToPage);
    pageNumButton.click(goToPage);

    $("#directions div").click((e) => {
        const direction = e.target.id;
        nextplease.sendMessageToActiveTab({ direction: direction });
    });

    $("#Options").click((e) => browser.runtime.openOptionsPage());

    browser.commands.getAll().then(commands => {
        for (const command of commands) {
            const element = document.getElementById(command.name);
            if (element) {
                if (command.description) {
                    element.title = command.description.replace(/__MSG_(.+?)__/g, aMatched => browser.i18n.getMessage(aMatched.slice(6, -2)));
                }
                if (command.shortcut) {
                    const shortcutText = command.shortcut;
                    // TODO Below doesn't work
                    // const shortcutText = command.shortcut.split("+").map(ShortcutCustomizeUI.getLocalizedKey).join("+");
                    // https://github.com/piroor/webextensions-lib-shortcut-customize-ui/issues/7
                    element.title = `${element.title} (${shortcutText})`;
                }
            }
        }
    });
})();
