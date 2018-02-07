function initDefaultOptions(prefs) {
    function init(key, value) {
        if (prefs[key] === undefined) prefs[key] = value;
    }

    init("allowsubmit", false);
    init("allownumbershortcuts", true);
    init("allowcontextmenu", true);
    init("allowsmartnext", false);
    init("checkframes", true);

    init("prefetch", 2);

    init("nextkey", 39); // KeyEvent.DOM_VK_RIGHT
    init("prevkey", 37); // KeyEvent.DOM_VK_LEFT
    init("firstkey", 38); // KeyEvent.DOM_VK_UP
    init("lastkey", 40); // KeyEvent.DOM_VK_DOWN

    init("iskeycodeNextkey", true);
    init("iskeycodePrevkey", true);
    init("iskeycodeFirstkey", true);
    init("iskeycodeLastkey", true);

    init("keymodifier", "accel shift");
    init("prevkeymodifier", "accel shift");
    init("firstkeymodifier", "accel shift");
    init("lastkeymodifier", "accel shift");
    init("numbermodifier", "alt");

    init("enableNextkey", true);
    init("enablePrevkey", true);
    init("enableFirstkey", true);
    init("enableLastkey", true);

    init("nextregex", "^next(\\s+\\d+)?(\\s+\\w+)?\\s*((>{0,2})|»|>|[\u25B6-\u25BB]|\u2192|\u21A0)\\s*$");
    init("prevregex", "^((<{0,2})|«|<|[\u25C0-\u25C5]|\u2190|\u219E)\\s*((prev(ious)?(\\s+\\d+)?(\\s+\\w+)?)|back)\\s*$");
    init("firstregex", "^((<{0,2})|«|<|[\u25C0-\u25C5]|\u2190|\u219E)\\s*(first(\\s+\\d+)?(\\s+\\w+)?)\\s*$");
    init("lastregex", "^last(\\s+\\d+)?(\\s+\\w+)?\\s*((>{0,2})|»|>|>|[\u25B6-\u25BB]|\u2192|\u21A0)\\s*$");
    init("galleryregex", "^(.*\\D)(\\d+)((?:\\.\\w+|[\\/])?)$");

    init("nextphrase.expr0", "next|next >|>|next »|»|next >>|>>|more results|newer »|older topics »|next page|go to the next photo in the stream");
    init("prevphrase.expr0", "previous|prev|< previous|previous results|< prev|<|« prev|«|<< prev|<<|« older|« newer topics|previous page|go to the previous photo in the stream");
    init("firstphrase.expr0", "first|< first|first page|« first");
    init("lastphrase.expr0", "last|last >|last page|last »");

    init("nextimage.expr0", "http://g-images.amazon.com/images/G/01/search-browse/button-more-results.gif");
    init("previmage.expr0", "http://g-images.amazon.com/images/G/01/search-browse/button-previous.gif");
    init("firstimage.expr0", "");
    init("lastimage.expr0", "");

    init("logLevel", 0);

    init("highlight", false);
    init("highlightColor", "#ff0000");
    init("highlightPrefetched", false);
    init("highlightPrefetchedColor", "#ff6666");
}
