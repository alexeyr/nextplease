// from https://github.com/christiankaindl/trello-super-powers/blob/63e3eb22e5c26e7b6109b08452bebec5801e77e3/translate.js
(/**
* Translate an HTML page with the i18n API
*
* @param {string} property Name of the HTML attribute used for localization
*/
function translate(property = 'data-i18n') {
    let translateables = document.querySelectorAll(`[${property}]`);

    for (let i = 0; i < translateables.length; i++) {
        let string = translateables[i].getAttribute(property);
        let message = browser.i18n.getMessage(string);
        if (message) {
            translateables[i].textContent = message;
        }
    }
})();
