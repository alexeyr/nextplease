function listenForClicks() {
    document.addEventListener("click", (e) => {
        browser.tabs.query({active: true, currentWindow: true}).then((tabs) => {
            var active_tab = tabs[0];

            alert(e.target.id);
            // browser.tabs.sendMessage(active_tab.id, {
            //     command: e.target.id,
            //     url: active_tab.url
            // })
        })
    });
}

/**
 * There was an error executing the script.
 * Display the popup's error message, and hide the normal UI.
 */
function reportExecuteScriptError(error) {
    document.querySelector("#popup-content").classList.add("hidden");
    document.querySelector("#error-content").classList.remove("hidden");
    console.error(`Failed to execute NextPlease content script: ${error.message}`);
}

browser.tabs.executeScript({ file: "/content_scripts/nextplease.js" })
    .then(listenForClicks)
    .catch(reportExecuteScriptError);