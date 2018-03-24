function sendMessageToActiveTab(message) {
    browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
        var active_tab = tabs[0];
        if (active_tab) {
            browser.tabs.sendMessage(active_tab.id, message);
        } else {
            nextplease.log("No active tab");
        }
    }).catch(reportExecuteScriptError);
}

/**
 * There was an error executing the script.
 * Display the popup's error message, and hide the normal UI.
 */
function reportExecuteScriptError(error) {
    document.querySelector("#popup-content").classList.add("hidden");
    document.querySelector("#error-content").classList.remove("hidden");
    console.error(error);
}

(function () {
    const pageNumInput = $("#PageNum");
    const pageNumButton = $("#PageNumButton");

    function goToPage() {
        const pageNumStr = pageNumInput.val();
        console.log(`pageNumStr: "${pageNumStr}"`);
        if (pageNumStr) {
            const pageNum = parseInt(pageNumStr, 10);
            if (pageNum) {
                sendMessageToActiveTab({ number: pageNum });
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
        sendMessageToActiveTab({ direction: direction });
    });

    $("#Options").click((e) => browser.runtime.openOptionsPage());
})();
