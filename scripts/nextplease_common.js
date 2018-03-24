/* eslint no-unused-vars: off */
var nextplease = {};

nextplease.prefs = new Configs({
    allowsubmit: false,
    allownumbershortcuts: true,
    allowcontextmenu: true,
    allowsmartnext: false,
    checkframes: true,
    // TODO add to options.html
    digitDelay: 500,

    prefetch: 2,

    nextregex: "^next(\\s+\\d+)?(\\s+\\w+)?\\s*((>{0,2})|»|>|[\u25B6-\u25BB]|\u2192|\u21A0)\\s*$",
    prevregex: "^((<{0,2})|«|<|[\u25C0-\u25C5]|\u2190|\u219E)\\s*((prev(ious)?(\\s+\\d+)?(\\s+\\w+)?)|back)\\s*$",
    firstregex: "^((<{0,2})|«|<|[\u25C0-\u25C5]|\u2190|\u219E)\\s*(first(\\s+\\d+)?(\\s+\\w+)?)\\s*$",
    lastregex: "^last(\\s+\\d+)?(\\s+\\w+)?\\s*((>{0,2})|»|>|>|[\u25B6-\u25BB]|\u2192|\u21A0)\\s*$",
    galleryregex: "^(.*\\D)(\\d+)((?:\\.\\w+|[\\/])?)$",

    nextphrase: "next|next >|>|next »|»|next >>|>>|more results|newer »|older topics »|next page|go to the next photo in the stream",
    prevphrase: "previous|prev|< previous|previous results|< prev|<|« prev|«|<< prev|<<|« older|« newer topics|previous page|go to the previous photo in the stream",
    firstphrase: "first|< first|first page|« first",
    lastphrase: "last|last >|last page|last »",

    nextimage: "http://g-images.amazon.com/images/G/01/search-browse/button-more-results.gif",
    previmage: "http://g-images.amazon.com/images/G/01/search-browse/button-previous.gif",
    firstimage: "",
    lastimage: "",

    logLevel: 0,

    highlight: false,
    highlightColor: "#ff0000",
    highlightPrefetched: false,
    highlightPrefetchedColor: "#ff6666",

    showAdvanced: false
}, {
    localKeys: []
});

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
    let value = nextplease.prefs[prefName] || "";
    return value.split("|").map((x) => x.toLowerCase().replace(/&pipe;/g, "|"));
}

nextplease.directions = ["Next", "Prev", "First", "Last"];
