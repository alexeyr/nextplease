// from https://github.com/christiankaindl/trello-super-powers/blob/63e3eb22e5c26e7b6109b08452bebec5801e77e3/translate.js

// for debugging options page
// console.log("Document before translate:"); console.log(document.body.innerHTML);
(function translate(property = "data-i18n") {
    let labels = document.getElementsByTagName("label");
    for (let i = 0; i < labels.length; i++) {
        let labelFor = labels[i].htmlFor;
        if (labelFor) {
            let elem = document.getElementById(labelFor);
            if (elem)
                elem.label = labels[i];
        }
    }

    let translateables = document.querySelectorAll(`[${property}]`);

    for (let i = 0; i < translateables.length; i++) {
        let translateable = translateables[i];
        let string = translateable.getAttribute(property);
        let message = browser.i18n.getMessage(string) || `Add to messages.json: ${string}`;

        if (translateable.label) {
            translateable.label.textContent = message;
        } else if (translateable.tagName === "INPUT") {
            translateable.value = message;
        } else {
            translateable.textContent = message;
        }
    }

    // TODO add text translation (for options page), see https://stackoverflow.com/questions/23759703/jquery-find-text-and-replace-with-html
})();
// console.log("Document after translate:"); console.log(document.body.innerHTML);