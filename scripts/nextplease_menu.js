document.addEventListener("contextmenu", e => {
    let target = e.target;
    let contextType;
    let value;
    let isImage = false;
    while (!((isImage = target.tagName === "IMG") || target.href || target.onclick) && target.parentElement) {
        target = target.parentElement;
    }
    if (isImage) {
        contextType = "Image";
        value = target.src;
    } else {
        contextType = "Phrase";
        const range = document.createRange();
        range.selectNode(target);
        value = range.toString().trim() || target.alt || target.title;
    }

    browser.runtime.sendMessage({
        contextType: contextType,
        value: value
    });
});
