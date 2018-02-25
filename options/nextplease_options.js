(function () {
    function loadOptions() {
        function isListbox(elem) {
            return elem.tagName === "SELECT" && elem.attributes["multiple"];
        }

        function isCheckbox(elem) {
            return elem.tagName === "INPUT" && elem.type === "checkbox";
        }

        function isTextbox(elem) {
            return elem.tagName === "INPUT" && elem.type === "text";
        }

        let prefElements = $("[data-pref]");
        let prefsToElements = {};

        prefElements.each(function () {
            this.pref = this.getAttribute("data-pref");
            prefsToElements[this.pref] = this;
        });

        let regexText = document.getElementById("directionRegex");
        let textList = document.getElementById("textList");
        let imageList = document.getElementById("imageList");
    
        nextplease.directions.forEach(direction => {
            let direction1 = direction.toLowerCase();
            prefsToElements[`${direction1}regex`] = regexText;
            prefsToElements[`${direction1}phrase`] = textList;
            prefsToElements[`${direction1}image`] = imageList;
        });

        nextplease.prefs.$addObserver(key => {
            let elem = prefsToElements[key];
            if (elem.pref === key) {
                showPrefInUI(elem);
            }
        });

        prefElements.change(function () {
            // for listboxes, change just means different selection,
            // not value change
            if (!isListbox(this)) {
                setPrefFromUI(this);
            }
            if (isCheckbox(this)) {
                // The checkboxes which have sibling inputs are 
                // the highlight/highlightPrefetched ones.
                // Disable the color inputs if they are unchecked.
                let checked = this.checked;
                $(this).siblings("input").each(function () {
                    this.disabled = !checked;
                });
            }
        });

        function appendOption(listbox, value) {
            listbox.values.push(value);
            listbox.insertAdjacentHTML("beforeend", `<option value="${value}">${value}</option>`);
        }

        function setupListAddRemove(type) {
            let isImage = type === "image";
            let listbox = $(document.getElementById(type + "List"));
            let addTextbox = $(document.getElementById(type + "Add"));
            let addButton = $(document.getElementById(type + "AddButton"));
            let removeButton = $(document.getElementById(type + "RemoveButton"));
            let resetButton = $(document.getElementById(type + "ResetButton"));

            addTextbox.keyup(function (e) {
                if (!isImage) {
                    this.value = this.value.toLowerCase();
                }
                var errorMessage;
                var valid = false;
                if (this.value.trim() === "") {
                    errorMessage = browser.i18n.getMessage("invalidEmpty");
                } else if (listbox[0].values.includes(this.value)) {
                    errorMessage = browser.i18n.getMessage("invalidAlreadyPresent");
                } else {
                    errorMessage = "";
                    valid = true;
                }
                this.setCustomValidity(errorMessage);
                addButton.attr("disabled", !valid);

                if (valid && e.keyCode === KeyboardEvent.DOM_VK_ENTER) {
                    addValue();
                }
            });

            addButton.click(function () {
                addValue();
                addTextbox.trigger("keyup");
            });

            function addValue() {
                appendOption(listbox[0], addTextbox.val());
                setPrefFromUI(listbox[0]);
                // Why doesn't this work?
                // listbox.find("option:last")[0].scrollIntoView();
                // Working code from https://stackoverflow.com/a/7205792/9204
                let optionTop = listbox.find("option:last").offset().top;
                let listTop = listbox.offset().top;
                listbox.scrollTop(listbox.scrollTop() + optionTop - listTop);
            }

            listbox.change(function () {
                removeButton.attr("disabled", selectedOptions().length === 0);
            });

            removeButton.click(removeSelectedValues);
            listbox.keyup(function (e) {
                if (e.keyCode === KeyboardEvent.DOM_VK_BACK_SPACE || e.keyCode === KeyboardEvent.DOM_VK_DELETE) {
                    removeSelectedValues();
                }
            });

            function selectedOptions() {
                return listbox.find(":selected");
            }

            function removeSelectedValues() {
                selectedOptions().remove();
                listbox[0].values = listbox.find("option").get().map(x => x.value);
                setPrefFromUI(listbox[0]);
                listbox.trigger("change");
            }

            resetButton.click(() => resetPref(listbox[0].pref));
        }

        function resetPref(key) {
            nextplease.prefs[key] = nextplease.prefs.$default[key];
        }

        setupListAddRemove("text");
        setupListAddRemove("image");
        $("#regexResetButton").click(() => resetPref(directionRegexPref()));
        $("#galleryRegexResetButton").click(() => resetPref("galleryregex"));

        let prefRegexes = $(".regex");

        prefRegexes.keyup(function () {
            var errorMessage;
            try {
                if (this.value.trim()) {
                    let regex = new RegExp(this.value);
                    if (this.pref === "galleryregex") {
                        var matches = regex.exec("http://nextplease.mozdev.org/test/test101.jpg");
                        if (!matches || (matches.length !== 4)) {
                            errorMessage = browser.i18n.getMessage("invalidGallery");
                        } else {
                            errorMessage = "";
                        }
                    } else {
                        errorMessage = "";
                    }
                } else {
                    errorMessage = browser.i18n.getMessage("invalidEmpty");
                }
            } catch (e) {
                errorMessage = browser.i18n.getMessage("optionsRegexInvalid");
            }
            this.setCustomValidity(errorMessage);
        });

        var currentDirection;
        function directionRegexPref(direction = currentDirection) { return `${direction}regex`; }
        function directionTextPref(direction = currentDirection) { return `${direction}phrase`; }
        function directionImagePref(direction = currentDirection) { return `${direction}image`; }

        function setPrefKey(elem, prefKey) {
            elem.pref = prefKey;
            showPrefInUI(elem);
        }

        $(".direction input").change(function () {
            if (this.checked) {
                currentDirection = this.value;

                setPrefKey(textList, directionTextPref());
                setPrefKey(imageList, directionImagePref());
                setPrefKey(regexText, directionRegexPref());

                // clear the textbox
                $(".addTextbox").val("").trigger("keyup");
            }
        });

        function setPrefFromUI(elem) {
            let isValid = !elem.checkValidity || elem.checkValidity();
            if (isValid) {
                let prefExists = nextplease.prefs.hasOwnProperty(elem.pref);
                if (prefExists) {
                    var value;
                    if (isListbox(elem)) {
                        value = elem.values.map(x => x.replace(/\|/g, "&pipe;")).join("|");
                    } else if (isCheckbox(elem)) {
                        value = elem.checked;
                    } else {
                        value = elem.value;
                    }
                    // requires all values to be primitives!
                    if (nextplease.prefs[elem.pref] !== value) {
                        nextplease.prefs[elem.pref] = value;
                    }
                }
            }
        }

        function showPrefInUI(elem) {
            let value = nextplease.prefs[elem.pref];
            if (isListbox(elem)) {
                showListPref(elem);
            } else if (isCheckbox(elem)) {
                elem.checked = value;
            } else {
                elem.value = value;
            }
            let jqElem = $(elem);
            jqElem.trigger("change");
            if (isTextbox(elem)) {
                jqElem.trigger("keyup");
            }
        }

        function showListPref(listbox) {
            $(listbox).children("option").remove();

            var values = stringArrayFromPref(listbox.pref);
            listbox.values = [];
            for (var i = 0; i < values.length; i++) {
                appendOption(listbox, values[i]);
            }
        }

        $("#restoreAll").click(function () {
            nextplease.prefs.$reset();
            // $reset doesn't notify observers
            loadOptions();
        });

        $("button").click(e => e.preventDefault());

        $("#showAdvanced").change(function () {
            let advancedElements = $(".advanced");
            if (this.checked) {
                advancedElements.show();
            } else {
                advancedElements.hide();
            }
        });

        function onOptionsLoaded() {
            prefElements.each(function () { showPrefInUI(this); });

            let checkedDirection = $("input[name=directions]:checked");
            checkedDirection.trigger("change");
        }

        nextplease.prefs.$loaded.then(onOptionsLoaded, nextplease.logError);
    }

    ShortcutCustomizeUI.build().then(list => {
        let shortcutsDiv = document.getElementById("shortcuts");
        let message = browser.i18n.getMessage("optionsKeyShortcuts") + 
            (ShortcutCustomizeUI.available ? "" : ` ${browser.i18n.getMessage("optionsKeyShortcutsUnavailable")}`);
        shortcutsDiv.insertAdjacentHTML("afterbegin", `<label>${message}</label>`);
        shortcutsDiv.appendChild(list);
    });

    $(loadOptions);
})();
