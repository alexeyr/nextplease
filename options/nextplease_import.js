(function () {
    const key = "optionsImportExplanation";
    document.getElementById(key).innerHTML = browser.i18n.getMessage(key);

    const importField = $("#importField");
    // setTimeout to trigger after value changes
    importField.on("paste", () => setTimeout(handleImport, 0));
    importField.on("keypress", e => {
        if (e.keyCode === KeyboardEvent.DOM_VK_ENTER) {
            setTimeout(handleImport, 0);
        }
    });

    function handleImport() {
        const splitText = importField.val().split(";");
        let oldPrefName = splitText.shift();
        const oldPrefString = splitText.join(";");
        let newPrefName;
        let newPrefValue;
        if (!oldPrefName.startsWith("nextplease.")) {
            showError("importErrorBadPreference");
            return;
        } else {
            oldPrefName = oldPrefName.replace("nextplease.", "");
            if (oldPrefName.includes("key") || oldPrefName.includes("modifier")) {
                showError("importErrorKey");
                return;
            } else if (oldPrefName.endsWith("regex")) {
                newPrefName = capitalizeFirstLetter(oldPrefName.replace("regex", "Regex"));
                newPrefValue = oldPrefString;
            } else if (oldPrefName.endsWith(".expr0")) {
                newPrefName = capitalizeFirstLetter(oldPrefName.replace("image", "Image").replace("phrase", "Phrase").replace(".expr0", ""));
                const oldValues = oldPrefString.split("|").filter(x => x).map(x => nextplease.normalize(x.replace("&pipe;", "|")));
                const withoutDuplicates = [...new Set(oldValues)];
                newPrefValue = withoutDuplicates.join("\n");
            } else if (oldPrefName === "prefetch") {
                newPrefName = "prefetch";
                switch (oldPrefString) {
                    case "0":
                        newPrefValue = "no";
                        break;
                    case "1":
                        newPrefValue = "yes";
                        break;
                    case "2":
                        newPrefValue = "smart";
                        break;
                    default:
                        showError("importErrorBadValue");
                        return;
                }
            } else if (oldPrefName === "log") {
                newPrefName = "logLevel";
                newPrefValue = oldPrefString === "true" ? 1 : 0;
            } else if (oldPrefName === "log.detailed") {
                newPrefName = "logLevel";
                newPrefValue = oldPrefString === "true" ? 2 : 1;
            } else {
                newPrefName = oldPrefName.replace(".prefetched", "Prefetched").replace(".color", "Color");
                switch (oldPrefString) {
                    case "true":
                        newPrefValue = true;
                        break;
                    case "false":
                        newPrefValue = false;
                        break;
                    default:
                        if (newPrefName.includes("Color")) {
                            newPrefValue = oldPrefString;
                        }
                }
            }

            if (newPrefName && nextplease.prefs.hasOwnProperty(newPrefName)) {
                showSuccess(nextplease.prefs[newPrefName] !== newPrefValue);
                nextplease.prefs[newPrefName] = newPrefValue;
            } else {
                showError("importErrorNotSupported");
            }
        }
    }

    function showError(key) {
        nextplease.notify({
            id: "importResult",
            titleKey: "optionsImportTitle",
            iconUrl: "/icons/error-16.svg",
            messageKey: "optionsImportError",
            messageArgs: [browser.i18n.getMessage(key)],
            timeout: 2000
        });
        importField.val("");
    }

    function showSuccess(hasChanges) {
        nextplease.notify({
            id: "importResult",
            titleKey: "optionsImportTitle",
            iconUrl: "/icons/check-16.svg",
            messageKey: hasChanges ? "optionsImportSuccessful" : "optionsImportNoChange",
            timeout: 2000
        });
        importField.val("");
    }

    function capitalizeFirstLetter(string) {
        return string.charAt(0).toUpperCase() + string.slice(1);
    }

})();
