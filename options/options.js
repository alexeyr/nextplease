(function () {
    var nextplease = { prefs: {} };

    // TODO common functions, remove duplication
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
        return nextplease.prefs[prefName].split("|").map((x) => x.toLowerCase().replace(/&pipe;/g, "|"));
    }
    // TODO common functions end

    function onError(error) {
        console.error(`Error: ${error}`);
    }

    function loadOptions() {
        let prefElements = $("[data-pref]");

        prefElements.each(function () {
            this.pref = this.getAttribute("data-pref");
        });

        let prefCheckboxes = prefElements.filter("input[type=checkbox]");
        let prefColors = prefElements.filter("input[type=color]");
        let prefSelects = prefElements.filter("select");

        function enableDisableSiblingInputs(elem, value) {
            $(elem).siblings("input").each(function () {
                this.disabled = !value;
            });
        }

        prefCheckboxes.change(function () {
            let value = this.checked;
            setPref(this.pref, value);
            enableDisableSiblingInputs(this, value);
        });

        prefColors.change(function () {
            setPref(this.pref, this.value);
        });

        prefSelects.change(function () {
            setPref(this.pref, this.value);
        });

        function appendOption(listbox, value) {
            listbox[0].values.push(value);
            listbox.append(`<option value="${value}">${value}</option>`);
        }

        function fillListFromPref(type, prefName) {
            let listbox = $(document.getElementById(type + "List"));

            listbox.children("option").remove();

            var values = stringArrayFromPref(prefName);
            listbox[0].values = [];
            for (var i = 0; i < values.length; i++) {
                appendOption(listbox, values[i]);
            }

            let addTextbox = $(document.getElementById(type + "Add"));
            addTextbox.val("").trigger("keyup");
        }

        function setupListAddRemove(type) {
            let isImage = "type" === "image";
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
                appendOption(listbox, addTextbox.val());
                setPrefFromListbox();
                // Why doesn't this work?
                // listbox.find("option:last")[0].scrollIntoView();
                // Working code from https://stackoverflow.com/a/7205792/9204
                let optionTop = listbox.find("option:last").offset().top;
                let listTop = listbox.offset().top;
                listbox.scrollTop(listbox.scrollTop() + optionTop - listTop);
            }

            function setPrefFromListbox() {
                let pref = isImage ? directionImagePref() : directionTextPref();
                let value = listbox[0].values.map(x => x.replace(/\|/g, "&pipe;")).join("|");
                setPref(pref, value);
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
                setPrefFromListbox();
                listbox.trigger("change");
            }
        }

        setupListAddRemove("text");
        setupListAddRemove("image");

        let prefRegexes = $(".regex");

        prefRegexes.keyup(function () {
            var errorMessage;
            try {
                if (this.value.trim()) {
                    new RegExp(this.value);
                    errorMessage = "";
                } else {
                    errorMessage = browser.i18n.getMessage("invalidEmpty");
                }
            } catch (e) {
                errorMessage = browser.i18n.getMessage("optionsRegexInvalid");
            }
            console.log(`errorMessage: ${errorMessage}`);
            this.setCustomValidity(errorMessage);
        });

        var currentDirection;
        function directionRegexPref(direction = currentDirection) { return `${currentDirection}regex`; }
        function directionTextPref(direction = currentDirection) { return `${currentDirection}phrase.expr0`; }
        function directionImagePref(direction = currentDirection) { return `${currentDirection}image.expr0`; }

        $("#matchesDirection").change(function () {
            currentDirection = this.value;
            fillListFromPref("text", directionTextPref());
            fillListFromPref("image", directionImagePref());
            $("#textAdd").val("").trigger("keyup");
            $("#imageAdd").val("").trigger("keyup");
            $("#directionRegex").val(nextplease.prefs[directionRegexPref()]);
        });

        $("#directionRegex").change(function () {
            if (this.checkValidity()) {
                setPref(directionRegexPref(), this.value);
            }
        });

        function setPref(key, value) {
            console.log(`${key} := ${value}`); // comment out later
            nextplease.prefs[key] = value;
        }

        function setFromStored(options) {
            nextplease.prefs = options;
            initDefaultOptions(nextplease.prefs);

            // TODO fill form from nextplease.prefs
            prefCheckboxes.each(function () {
                let value = nextplease.prefs[this.pref];
                this.checked = value;
                $(this).trigger("change");
            });

            prefColors.each(function () {
                this.value = nextplease.prefs[this.pref];
            });

            prefSelects.each(function () {
                this.value = nextplease.prefs[this.pref];
            });

            $("#matchesDirection").val("next").trigger("change");
        }

        $("#restoreAll").click(function () {
            setFromStored({});
        });

        function saveOptions(e) {
            e.preventDefault();
            // for debugging, uncomment next line once this works well
            console.dir(nextplease.prefs);
            // browser.storage.sync.set(nextplease.prefs).catch(onError);
        }

        $("#save").click(saveOptions);

        $("button").click(e => e.preventDefault());

        $("#showAdvanced").change(function () {
            let advancedElements = $(".advanced");
            if (this.checked) {
                advancedElements.show();
            } else {
                advancedElements.hide();
            }
        });

        browser.storage.sync.get(null).then(setFromStored, onError);
    }

    $(loadOptions);
})();
