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
})();
