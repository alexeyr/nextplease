(function () {
    var nextplease = {prefs: {}};

    function onError(error) {
        console.error(`Error: ${error}`);
    }

    function saveOptions(e) {
        e.preventDefault();
        // TODO fill nextplease.prefs from form
        browser.storage.sync.set(nextplease.prefs).catch(onError);
    }

    function restoreOptions() {

        function setFromStored(result) {
            nextplease.prefs = result;
            initDefaultOptions(nextplease.prefs);
            // TODO fill form from nextplease.prefs
        }

        browser.storage.sync.get(null).then(setFromStored, onError);
    }

    document.addEventListener("DOMContentLoaded", restoreOptions);
    document.querySelector("form").addEventListener("submit", saveOptions);
})();
