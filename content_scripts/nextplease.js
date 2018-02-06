(function () {
    /**
     * Check and set a global guard variable.
     * If this content script is injected into the same page again,
     * it will do nothing next time.
     */
    if (window.hasRun) {
        return;
    }
    window.hasRun = true;

    var nextplease = {};

    /**
      * Listen for messages from the popup script.
      */
    browser.runtime.onMessage.addListener((message) => {
        nextplease.openDirection(message.command);
    });

    nextplease.prefService = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService);
    nextplease.bundleService = Components.classes["@mozilla.org/intl/stringbundle;1"].getService(Components.interfaces.nsIStringBundleService);

    nextplease.prefs = nextplease.prefService.getBranch("nextplease.").QueryInterface(Components.interfaces.nsIPrefBranch2);
    nextplease.accelKeyPrefs = nextplease.prefService.getBranch("ui.key.accelKey").QueryInterface(Components.interfaces.nsIPrefBranch2);
    nextplease.strings = nextplease.bundleService.createBundle("chrome://nextplease/locale/nextplease.properties");

    nextplease.isMac = /Mac/i.test(window.navigator.platform);

    switch (nextplease.accelKeyPrefs.getIntPref("")) {
        case KeyEvent.DOM_VK_ALT: nextplease.accelKey = "alt"; break;
        case KeyEvent.DOM_VK_CONTROL: nextplease.accelKey = "control"; break;
        case KeyEvent.DOM_VK_META: nextplease.accelKey = "meta"; break;
        default: nextplease.accelKey = (nextplease.isMac ? "meta" : "control");
    }

    // Strip leading and trailing whitespace from
    // the passed in string and return it.
    nextplease.Trim = function (str) {
        return str.replace(/^\s+/, "").replace(/\s+$/, "");
    };

    nextplease.getModifierPref = function (prefname) {
        // "ctrl" can come from old versions
        return nextplease.prefs.getCharPref(prefname).toLowerCase().replace(/\+/g, " ").replace(nextplease.accelKey, "accel").replace("ctrl", "control");
    };

    nextplease.log = function (message) {
        if (nextplease.DEBUG) {
            console.log("NextPlease: " + message);
            //if (nextplease.DEBUG_FILE && nextplease._outputStream) {
            //    nextplease._outputStream.write(message, message.length);
            //}
        }
    };

    nextplease.logDetail = function (message) {
        if (nextplease.DEBUG_DETAILED) {
            console.debug("NextPlease: " + message);
            //if (nextplease.DEBUG_FILE && nextplease._outputStream) {
            //    nextplease._outputStream.write(message, message.length);
            //}
        }
    };

    nextplease.logError = console.error;

    nextplease.getDirectionString = function (dir) {
        return nextplease.strings.GetStringFromName(dir + "Page1");
    };

    nextplease.confirmRemove = function (phraseOrImage, textOrUrl, currentDirection) {
        var removeConfirmationKey = "remove" + phraseOrImage + "Confirmation";
        var removeConfirmationText =
            nextplease.strings.formatStringFromName(
                removeConfirmationKey,
                [textOrUrl, nextplease.getDirectionString(currentDirection)], 2);
        return window.confirm(removeConfirmationText);
    };

    nextplease.confirmReplace = function (phraseOrImage, textOrUrl, currentDirection, newDirection) {
        var replaceConfirmationKey = "replace" + phraseOrImage + "Confirmation";
        var replaceConfirmationText =
            nextplease.strings.formatStringFromName(
                replaceConfirmationKey,
                [textOrUrl,
                    nextplease.getDirectionString(currentDirection),
                    nextplease.getDirectionString(newDirection)], 3);
        return window.confirm(replaceConfirmationText);
    };

    // Initialize the lookup table from keycode to keyname
    nextplease.KeyCodeToNameMap = {};

    (function () {
        var constName;

        for (constName in KeyEvent) {
            nextplease.KeyCodeToNameMap[KeyEvent[constName]] = constName.replace("DOM_", "");
        }
        nextplease.KeyCodeToNameMap[KeyEvent.DOM_VK_BACK_SPACE] = "DOM_VK_BACK";
    }());

    window.addEventListener("load", function () { nextplease.init(); }, false);
    window.addEventListener("popupshowing", function () { nextplease.showHideMenuItems(); }, false);
    window.addEventListener("load", function (event) { nextplease.loadListener.onLoad(event); }, false);

    nextplease.setUnicharPref = function (aPrefName, aPrefValue) {
        // nextplease.logDetail("setting " + aPrefName + " to " + aPrefValue);
        if (nextplease.prefs) {
            try {
                var str = Components.classes["@mozilla.org/supports-string;1"].createInstance(Components.interfaces.nsISupportsString);
                str.data = aPrefValue;
                nextplease.prefs.setComplexValue(aPrefName, Components.interfaces.nsISupportsString, str);
            } catch (e) {
                nextplease.logError("Failed to set value of " + aPrefName + " to " + aPrefValue);
            }
        } else {
            nextplease.logError("nextplease.prefs is not defined");
        }
    };

    nextplease.getUnicharPref = function (aPrefName) {
        // nextplease.logDetail("getting " + aPrefName);
        if (nextplease.prefs) {
            try {
                return nextplease.prefs.getComplexValue(aPrefName, Components.interfaces.nsISupportsString).data;
            } catch (e) {
                nextplease.logError("Failed to get value for " + aPrefName);
            }
        } else {
            nextplease.logError("nextplease.prefs is not defined");
        }
        return "";
    };

    nextplease.gotHereUsingNextplease = false;

    nextplease.MAX_LINK_NUM = 1000;
    nextplease.MAX_GALLERY_GAP = 20;
    nextplease.MAX_LINKS_TO_CHECK = 1000;
    nextplease.SEARCH_FOR_SUBMIT = 1;

    nextplease.directions = ["Next", "Prev", "First", "Last"];

    nextplease.urlsCache = { first: undefined, last: undefined, size: 0, MAX_SIZE: 1000, map: {} };
    nextplease.currentHostName = location.host;

    nextplease.SEARCH_TYPE = { Next: 1, Prev: 2, First: 3, Last: 4 };
    nextplease.ResultType = { Link: 0, URL: 1, Input: 2, History: 3 };

    nextplease.PREFETCH_ENUM = { No: 0, Yes: 1, Smart: 2 };

    nextplease.highlighted_old_styles = {};

    // This code was stolen from brody on the mozillazine.org forums.
    nextplease.loadListener = {
        onLoad: function (event) {
            getBrowser().addEventListener("DOMContentLoaded", function (event) {
                nextplease.loadListener.onContentLoaded(event);
            }, true);
        },

        onContentLoaded: function (event) {
            var doc = event.originalTarget;

            // When this becomes true it means that 
            // all of the top level document's 
            // subframes have also finished loading 
            if (!this.isTopLevelDocument(doc)) { return; }

            // Log/alert 
            if (nextplease.DEBUG_DETAILED) {
                nextplease.logDetail("loadListener\n" + "DOMContentLoaded\n" + doc.title + "\n" + doc.documentURI);
            }

            nextplease.clearStatusBar();

            // no effect if nextplease.clearStatusBarTimer is invalid
            clearTimeout(nextplease.clearStatusBarTimer);

            nextplease.cacheLinkLocations();

            nextplease.prefetched = {};
            nextplease.unhighlight();

            if (nextplease.prefetchPref === nextplease.PREFETCH_ENUM.Yes) {
                nextplease.prefetch();
            } else if ((nextplease.prefetchPref === nextplease.PREFETCH_ENUM.Smart) && nextplease.gotHereUsingNextplease) {
                nextplease.prefetch();
                nextplease.gotHereUsingNextplease = false;
            }
        },

        isTopLevelDocument: function (aDocument) {
            return (aDocument === aDocument.defaultView.top.document);
        }
    };

    nextplease.prefObserver = {
        QueryInterface: function QueryInterface(aIID) {
            if (aIID.equals(Components.interfaces.nsIObserver) ||
                aIID.equals(Components.interfaces.nsISupportsWeakReference) ||
                aIID.equals(Components.interfaces.nsISupports)) {
                return this;
            } else {
                throw Components.results.NS_NOINTERFACE;
            }
        },

        register: function () {
            nextplease.prefs.addObserver("", this, true);
            nextplease.accelKeyPrefs.addObserver("", this, true);
        },

        observe: function (subject, topic, data) {
            if (topic === "nsPref:changed") {
                nextplease.readPreferences();
            }
        }
    };

    nextplease.prefObserver.register();

    nextplease.validateCache = function () {
        var i, url, urlsCache = nextplease.urlsCache, cachedURLsNum = urlsCache.size;
        var messageLines = ["size=" + cachedURLsNum + "; first=" + urlsCache.first + "; last=" + urlsCache.last], message;

        if (cachedURLsNum > 0) {
            url = urlsCache.first;
            for (i = 0; i < cachedURLsNum; i++ , url = urlsCache.map[url]) {
                messageLines[messageLines.length] = "i=" + i + "; url=" + url + "; urlsCache.map[url]=" + urlsCache.map[url];
                if (!url) {
                    message = messageLines.join("\n\n");
                    nextplease.logError(message);
                    alert(message);
                    return;
                }
            }
            if (url !== urlsCache.last) {
                message = messageLines.join("\n\n");
                nextplease.logError(message);
                alert(message);
                return;
            }
        } else if (urlsCache.first || urlsCache.last) {
            message = messageLines[0];
            alert(message);
            nextplease.logError(message);
        }
    };

    nextplease.addToCache = function (url) {
        var urlToDelete, urlsCache = nextplease.urlsCache, incrSize = true;
        if (url && !urlsCache.map[url]) {
            // nextplease.logDetail("adding " + url + " to image cache");
            if (urlsCache.size === 0) {
                urlsCache.first = url;
                urlsCache.map[url] = url;
                urlsCache.last = url;
                urlsCache.size = 1;
            } else {
                if (urlsCache.size >= urlsCache.MAX_SIZE) {
                    urlToDelete = urlsCache.first;
                    urlsCache.first = urlsCache.map[urlToDelete];
                    delete urlsCache.map[urlToDelete];
                    incrSize = false;
                }

                urlsCache.map[urlsCache.last] = url;
                urlsCache.map[url] = url;
                urlsCache.last = url;
                if (incrSize) {
                    urlsCache.size++;
                }
            }
        } //else {
        //    nextplease.logDetail("" + url + " is already in image cache");
        //}
    };

    nextplease.cacheLinkLocations = function () {
        var i, urlsCache = nextplease.urlsCache;

        nextplease.logDetail("caching image location");
        nextplease.logDetail("there are currently " + urlsCache.size + " image URLs cached");

        var theDocument = window.content.document;
        nextplease.currentHostName = theDocument.location.host;

        var start = new Date();

        var imgElems = theDocument.getElementsByTagName("img"), imgElemsNum = imgElems.length;
        if (imgElems) {
            var numberOfImagesToCheck = Math.min(nextplease.MAX_LINKS_TO_CHECK, imgElemsNum);
            nextplease.logDetail("Checking " + numberOfImagesToCheck + " <img> elements out of " + imgElemsNum + " total.");
            for (i = 0; i < numberOfImagesToCheck; i++) {
                nextplease.addToCache(imgElems[i].src);
            }
        }

        var links = theDocument.getElementsByTagName("a"), linksNum = links.length;
        if (links) {
            var numberOfLinksToCheck = Math.min(nextplease.MAX_LINKS_TO_CHECK, linksNum);
            nextplease.logDetail("Checking " + numberOfLinksToCheck + " <a> elements out of " + linksNum + " total.");
            for (i = 0; i < numberOfLinksToCheck; i++) {
                var linkUrl = links[i].href;
                if (!urlsCache.map[linkUrl]) {
                    // only links from this host are interesting to NextPlease
                    if (links[i].hostname === nextplease.currentHostName) {
                        nextplease.addToCache(linkUrl);
                    }
                } //else {
                //    nextplease.logDetail("" + linkUrl + " is already in image cache");
                //}
            }
        }
        var end = new Date();
        nextplease.logDetail("caching took " + (end.getTime() - start.getTime()) + " ms");

        if (nextplease.DEBUG_DETAILED) {
            nextplease.logDetail("checking cache correctness again");
            nextplease.validateCache();
        }

        nextplease.logDetail("there are currently " + urlsCache.size + " URLs cached");

        // nextplease.logDetail(nextplease.imageLocationArray.toString());
    };

    nextplease.initKey = function (keyId, keyPrefName, modifierPrefName) {
        var modString = nextplease.getModifierPref(modifierPrefName);
        var keyOrCharCode = nextplease.prefs.getIntPref(keyPrefName);
        if (keyOrCharCode === 0) {
            nextplease.prefs.clearUserPref(keyPrefName);
            keyOrCharCode = nextplease.prefs.getIntPref(keyPrefName);
        }
        var isKeyCodePrefName = "iskeycode." + keyPrefName;
        var isKeyCode = nextplease.prefs.getBoolPref(isKeyCodePrefName);
        var enablePrefName = "enable." + keyPrefName;
        var enable = nextplease.prefs.getBoolPref(enablePrefName);
        var keyString;

        var keyElem = document.getElementById(keyId);
        keyElem.setAttribute("modifiers", modString);

        if (isKeyCode) {
            keyString = nextplease.KeyCodeToNameMap[keyOrCharCode];
            keyElem.removeAttribute("key");
            keyElem.setAttribute("keycode", keyString);
        } else {
            keyString = String.fromCharCode(keyOrCharCode);
            keyElem.setAttribute("key", keyString);
            keyElem.removeAttribute("keycode");
        }
        keyElem.setAttribute("disabled", !enable);

        if (enable) {
            nextplease.DisableKey(modString, keyString);
        }
    };

    nextplease.initNumberKeys = function () {
        var modifier = nextplease.getModifierPref("numbermodifier");
        var numberKey, i;
        for (i = 0; i < 10; i++) {
            numberKey = document.getElementById("nextplease" + i + "key");
            numberKey.setAttribute("modifiers", modifier);
            numberKey.setAttribute("disabled", !nextplease.useNumberShortcuts);
            if (nextplease.useNumberShortcuts) {
                nextplease.DisableKey(modifier, "" + i);
            }
        }
    };

    nextplease.readPreferences = function () {
        var i;
        if (!nextplease.prefs) {
            nextplease.logError("nextplease.prefs undefined. This shouldn't happen!");
            nextplease.prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefService).getBranch("nextplease.");
        }

        try {
            nextplease.DEBUG = nextplease.prefs.getBoolPref("log");
            nextplease.DEBUG_DETAILED = nextplease.DEBUG && nextplease.prefs.getBoolPref("log.detailed");

            // nextplease.logDetail("reading preferences");

            nextplease.initKey("nextpleasekey", "nextkey", "keymodifier");
            nextplease.initKey("nextpleaseprevkey", "prevkey", "prevkeymodifier");
            nextplease.initKey("nextpleasefirstkey", "firstkey", "firstkeymodifier");
            nextplease.initKey("nextpleaselastkey", "lastkey", "lastkeymodifier");

            // nextplease.logDetail("keys read");

            nextplease.useSubmit = nextplease.prefs.getBoolPref("allowsubmit");
            nextplease.useNumberShortcuts = nextplease.prefs.getBoolPref("allownumbershortcuts");
            nextplease.useContextMenu = nextplease.prefs.getBoolPref("allowcontextmenu");
            nextplease.useSmartNext = nextplease.prefs.getBoolPref("allowsmartnext");
            nextplease.prefetchPref = nextplease.prefs.getIntPref("prefetch");
            nextplease.useFrames = nextplease.prefs.getBoolPref("checkframes");

            // nextplease.logDetail("bools read");

            var nextRegExString = nextplease.getUnicharPref("nextregex");
            var prevRegExString = nextplease.getUnicharPref("prevregex");
            var firstRegExString = nextplease.getUnicharPref("firstregex");
            var lastRegExString = nextplease.getUnicharPref("lastregex");

            var galleryRegExString = nextplease.getUnicharPref("galleryregex");
            var galleryRegEx = new RegExp(galleryRegExString, "i");
            var matches = galleryRegEx.exec("http://nextplease.mozdev.org/test/test101.jpg");
            if (matches && (matches.length !== 4)) {
                nextplease.logError("Gallery regex test failed!");
                nextplease.prefs.clearUserPref("galleryregex");
                galleryRegExString = nextplease.getUnicharPref("galleryregex");
                galleryRegEx = new RegExp(galleryRegExString, "i");
            }

            nextplease.RegExes = {
                Next: new RegExp(nextRegExString, "i"),
                Prev: new RegExp(prevRegExString, "i"),
                First: new RegExp(firstRegExString, "i"),
                Last: new RegExp(lastRegExString, "i"),
                Gallery: galleryRegEx
            };

            // nextplease.logDetail("regexes read");

            // nextplease.logDetail("gallery regex read");

            nextplease.initNumberKeys();

            nextplease.ImageMap = {};
            nextplease.PhraseMap = {};

            // Read the phrases that specify a next link
            // by reading the preferences or defaults,
            // and put the phrases in a lookup table.
            var addPrefsToMap = function (map, phraseOrImage, direction) {
                var prefbranch = (direction + phraseOrImage).toLowerCase();
                var tempprefname = prefbranch + ".expr0";
                var prefValue = nextplease.getUnicharPref(tempprefname);
                var values = prefValue.split("|");
                var i;
                // nextplease.logDetail("initializing " + prefbranch);
                for (i = 0; i < values.length; i++) {
                    var value = values[i].replace(/&pipe;/g, "|");
                    if (value !== "") {
                        map[value] = direction;
                        // nextplease.logDetail("added "+value+" to "+direction+" "+phraseOrImage);
                    }
                }
                // nextplease.logDetail("finished initializing " + prefbranch);
            };

            for (i = 0; i < nextplease.directions.length; i++) {
                var direction = nextplease.directions[i];
                addPrefsToMap(nextplease.PhraseMap, "Phrase", direction);
                addPrefsToMap(nextplease.ImageMap, "Image", direction);
            }

            nextplease.highlightColor = nextplease.prefs.getBoolPref("highlight") ?
                nextplease.prefs.getCharPref("highlight.color") :
                undefined;
            nextplease.highlightPrefetchedColor = nextplease.prefs.getBoolPref("highlight.prefetched") ?
                nextplease.prefs.getCharPref("highlight.prefetched.color") :
                undefined;

            nextplease.logDetail("preferences read");
        } catch (e) {
            if (!nextplease.retryingToReadPreferences) {
                // nextplease.prefs.resetBranch() isn't implemented according to MDC
                var prefnames = nextplease.prefs.getChildList("", {});
                for (i = 0; i < prefnames.length; i++) {
                    nextplease.prefs.clearUserPref(prefnames[i]);
                }

                var errorMsg = nextplease.strings.GetStringFromName("readingPreferencesFailed");
                alert(errorMsg);
                nextplease.retryingToReadPreferences = true;
                nextplease.readPreferences();
            }
        }
    };

    nextplease.DisableKey = function (modifier, keyString) {
        var conflictingKeys, conflictingKey, conflictingId, conflictingModifier, i;
        if (keyString.indexOf("VK_") >= 0) {
            // nextplease.logDetail("disabling keys conflicting with " + modifier + "+" + nextplease.KeyCodeToNameMap[keycode]);
            conflictingKeys = document.getElementsByAttribute("keycode", keyString);
        } else {
            // nextplease.logDetail("disabling keys conflicting with " + modifier + "+" + key);
            conflictingKeys = document.getElementsByAttribute("key", keyString.toLowerCase());
        }

        var conflictingKeysLength = conflictingKeys.length;
        // nextplease.logDetail(conflictingKeysLength + " keys conflicting with " + modifier + "+" keystring);
        for (i = 0; i < conflictingKeysLength; i++) {
            conflictingKey = conflictingKeys[i];
            conflictingId = conflictingKey.getAttribute("id");
            if (!(/nextplease/.test(conflictingId)) && conflictingKey.hasAttribute("modifiers")) {
                conflictingModifier = conflictingKey.getAttribute("modifiers").replace(nextplease.accelKey, "accel");
                // nextplease.logDetail("potentially conflicting key: " + conflictingId);
                if ((/alt/.test(modifier) === /alt/.test(conflictingModifier)) &&
                    (/control/.test(modifier) === /control/.test(conflictingModifier)) &&
                    (/meta/.test(modifier) === /meta/.test(conflictingModifier)) &&
                    (/shift/.test(modifier) === /shift/.test(conflictingModifier)) &&
                    (/accel/.test(modifier) === /accel/.test(conflictingModifier))) {
                    // conflictingKey.parentNode.removeChild(conflictingKey);
                    conflictingKey.setAttribute("disabled", true);
                    nextplease.log("Disabled conflicting key " + conflictingId);
                }
            }
        }
    };

    nextplease.init = function () {
        nextplease.log("initializing");
        nextplease.retryingToReadPreferences = false;
        nextplease.readPreferences();
        nextplease.statusBar = document.getElementById("nextplease_statusbar_panel");
    };

    nextplease.clearStatusBar = function () {
        if (nextplease.statusBar) {
            nextplease.statusBar.collapsed = true;
            nextplease.statusBar.label = "";
        }
    };

    nextplease.showInStatusBar = function (text) {
        if (nextplease.statusBar) {
            nextplease.statusBar.collapsed = false;
            nextplease.statusBar.label = text;
        }
    };

    nextplease.notifyLinkNotFound = function () {
        nextplease.showInStatusBar(nextplease.strings.GetStringFromName("linkNotFound"));

        nextplease.clearStatusBarTimer = setTimeout(nextplease.clearStatusBar, 5000);
    };

    nextplease.directionFromRel = function (link) {
        // Look for rel attributes for next/prev/first/last
        if (link.rel && link.href) {
            var rel = link.rel.toLowerCase();
            if (rel === "next") {
                nextplease.log('found rel="' + link.rel + '": ' + link.href);
                return "Next";
            } else if ((rel === "prev") || (rel === "previous")) {
                nextplease.log('found rel="' + link.rel + '": ' + link.href);
                return "Prev";
            } else if ((rel === "start") || (rel === "first")) {
                nextplease.log('found rel="' + link.rel + '": ' + link.href);
                return "First";
            } else if ((rel === "end") || (rel === "last")) {
                nextplease.log('found rel="' + link.rel + '": ' + link.href);
                return "Last";
            }
        }
        return undefined;
    };

    nextplease.directionFromText = function (text, direction, prefetching) {
        var i;
        if (text) {
            var direction1 = nextplease.PhraseMap[text];
            if (direction1) {
                nextplease.log('found text match for "' + text + '"');
                return direction1;
            } else {
                if (prefetching) {
                    for (i = 0; i < nextplease.directions.length; i++) {
                        var direction2 = nextplease.directions[i];
                        if (!nextplease.prefetched[direction2] && nextplease.RegExes[direction2].test(text)) {
                            nextplease.log('found regex match for "' + text + '"');
                            return direction2;
                        }
                    }
                } else if (nextplease.RegExes[direction].test(text)) {
                    nextplease.log('found regex match for "' + text + '"');
                    return direction;
                }
            }
        }
        return undefined;
    };

    nextplease.directionFromImage = function (imageElem, direction, prefetching) {
        var imgtext = imageElem.alt ? imageElem.alt : imageElem.title;

        var direction1 = nextplease.ImageMap[imageElem.src];
        if (direction1) {
            nextplease.log("found image match with URL " + imageElem.src);
            if (!prefetching || !nextplease.prefetched[direction1]) {
                return direction1;
            } else {
                return undefined;
            }
        } else {
            return nextplease.directionFromText(imgtext, direction, prefetching);
        }
    };

    nextplease.ignoreRels = function (curWindow) {
        var url = curWindow.location.href;
        // viewtopic.php is used in PHPBB, index.php in SMF
        // both (at least some versions) use <link> tags incorrectly
        return url.match(/(viewtopic|index)\.php/);
    };

    // Looks through all the links on the page
    // and tries to look for one whose text matches
    // one of the phrases or images. If so, it goes to/
    // the corresponding link. 
    // pages with frames.
    nextplease.getLink = function (curWindow, direction) {
        var doc = curWindow.document;
        var i, j;
        var prefetching = (direction === "Prefetch");

        var direction1;

        var text;
        var isInt = /^\s*\[?\s*(\d+)\s*,?\]?\s*$/;

        var pageNumLinks = { Next: null, Prev: null, First: null, Last: null, Tmp: null };

        var firstPageNum;
        var currentPageNum = 100000; // Init to arbitrarily large num
        var tmpPageNum = 100000; // Init to arbitrarily large num
        var greatestNum = 1;
        var insideNumberBlock = false;

        var link;

        var temp;

        if (prefetching) {
            nextplease.logDetail("prefetching...");
        } else {
            nextplease.logDetail("looking for a link...");
        }

        var range = doc.createRange();

        var finishPrefetch = function () {
            return prefetching && nextplease.prefetched.Next && nextplease.prefetched.Prev &&
                nextplease.prefetched.First && nextplease.prefetched.Last;
        };

        if (nextplease.useSmartNext) {
            if (getBrowser().canGoForward) {
                nextplease.log("forward in history");
                link = [nextplease.ResultType.History, 1];
                if (direction === "Next") {
                    return link;
                } else if (prefetching) {
                    nextplease.prefetched.Next = link;
                }
            }

            if (getBrowser().canGoBack) {
                nextplease.log("back in history");
                link = [nextplease.ResultType.History, -1];
                if (direction === "Prev") {
                    return link;
                } else if (prefetching) {
                    nextplease.prefetched.Prev = link;
                }
            }
        }

        if (!nextplease.ignoreRels(curWindow)) {
            // Look for <LINK> tags
            nextplease.logDetail("checking <link> tags");
            var linktags = doc.getElementsByTagName("link"), linktagsNum = linktags.length;

            for (i = 0; i < linktagsNum; i++) {
                link = linktags[i];

                direction1 = nextplease.directionFromRel(link);
                if (direction === direction1) {
                    return [nextplease.ResultType.Link, link];
                } else if (direction1 && prefetching) {
                    nextplease.prefetched[direction1] = [nextplease.ResultType.Link, link];
                    continue;
                }
            }
        }

        if (finishPrefetch()) { return true; }

        // Look for <A HREF="..."> tags
        nextplease.logDetail("checking <a> tags");
        var alinks = doc.links, alinksNum = alinks.length;
        var curWindowUrl = doc.location.href;

        // Search through each link
        for (i = 0; i < alinksNum; i++) {
            link = alinks[i];
            if (link.href === curWindowUrl) {
                continue;
            }

            direction1 = nextplease.directionFromRel(link);
            if (direction === direction1) {
                return [nextplease.ResultType.Link, link];
            } else if (direction1 && prefetching) {
                nextplease.prefetched[direction1] = [nextplease.ResultType.Link, link];
                continue;
            }

            range.selectNode(link);
            text = nextplease.Trim(range.toString());

            if (link.href.indexOf("/dictionary") < 0) {
                direction1 = nextplease.directionFromText(text, direction, prefetching);
                if (direction === direction1) {
                    return [nextplease.ResultType.Link, link];
                } else if (direction1 && prefetching) {
                    nextplease.prefetched[direction1] = [nextplease.ResultType.Link, link];
                    continue;
                }
            }

            direction1 = nextplease.directionFromText(link.title, direction, prefetching);
            if (direction === direction1) {
                return [nextplease.ResultType.Link, link];
            } else if (direction1 && prefetching) {
                nextplease.prefetched[direction1] = [nextplease.ResultType.Link, link];
                continue;
            }

            // See if there's an image tag
            var imgElems = link.getElementsByTagName("img");
            if (imgElems.length > 0) {
                nextplease.logDetail("checking images inside <a>...</a>");
                // If the image matches, go to the URL.
                //alert(imgElems[0].src);
                direction1 = nextplease.directionFromImage(imgElems[0], direction, prefetching);
                if (direction === direction1) {
                    return [nextplease.ResultType.Link, link];
                } else if (direction1 && prefetching) {
                    nextplease.prefetched[direction1] = [nextplease.ResultType.Link, link];
                    continue;
                }
            }

            if (finishPrefetch()) { return true; }

            var intMatches = isInt.exec(text);
            if (intMatches) {
                var linkPageNum = parseInt(intMatches[1], 10);
                // If the number is greater than nextplease.MAX_LINK_NUM
                // and doesn't follow smaller numbers
                // it probably doesn't have anything to do with
                // a next/prev link.
                //    alert(linkPageNum);
                if (insideNumberBlock || (linkPageNum < nextplease.MAX_LINK_NUM)) {
                    nextplease.logDetail("found link number " + linkPageNum + ", checking...");
                    // Try to figure out what the current page and
                    // next/prev links are for pages that just have
                    // numbered links like  1 2 x 4 5. 
                    //     if (linkPageNum === 1) {
                    // We're seeing a number link that is smaller
                    // than a previous one so assume that we're
                    // starting a new set of number links, and
                    // count from the beginning.
                    if (linkPageNum <= tmpPageNum) {
                        nextplease.logDetail("New number block started");
                        insideNumberBlock = true;
                        //    alert(linkPageNum);
                        //    alert(currentPageNum);
                        pageNumLinks.First = link;
                        firstPageNum = linkPageNum;
                        greatestNum = linkPageNum;

                        pageNumLinks.Prev = null;
                        pageNumLinks.Next = null;
                        pageNumLinks.Last = null;
                        currentPageNum = linkPageNum;

                        pageNumLinks.First = link;
                        greatestNum = linkPageNum;
                        pageNumLinks.Last = null;
                        //} else if (currentPageNum === linkPageNum) {
                        //    currentPageNum++;
                        //    pageNumLinks.Prev = link;
                    } else if (tmpPageNum + 1 === linkPageNum) {
                        nextplease.logDetail("next link in number block");
                        pageNumLinks.Last = link;
                    } else if (tmpPageNum + 2 === linkPageNum) {
                        nextplease.logDetail("skipped number" + (tmpPageNum + 1) + " in number block");
                        pageNumLinks.Prev = pageNumLinks.Tmp;
                        pageNumLinks.Next = link;
                        pageNumLinks.Last = link;
                    } else if (insideNumberBlock) {
                        nextplease.logDetail("skipped numbers from " + (tmpPageNum + 1) + " to " + (linkPageNum - 1) + " in number block");
                        pageNumLinks.Last = link;
                    }

                    tmpPageNum = linkPageNum;
                    pageNumLinks.Tmp = link;
                }
            } else {
                if (insideNumberBlock) {
                    nextplease.logDetail("Finished number block");
                    insideNumberBlock = false;
                }
            }
        }

        // next and prev are null so that means
        // we have a solid block of numbers, e.g. 3,4,5,6,...
        if ((pageNumLinks.Next === null) && (pageNumLinks.Prev === null)) {

            // If we start with 1, we're probably on last page.
            // Set prev to be lastPage
            if (firstPageNum === 1) {
                pageNumLinks.Prev = pageNumLinks.Last;
                pageNumLinks.Last = null;
                // If we start with 2, we're probably on first page.
                // Set next to be first page
            } else if (firstPageNum === 2) {
                pageNumLinks.Next = pageNumLinks.First;
                pageNumLinks.First = null;
            } else if (firstPageNum > 2) {
                pageNumLinks.Next = pageNumLinks.First;
                pageNumLinks.Prev = pageNumLinks.Last;
            }
        }

        if (pageNumLinks.First && pageNumLinks.Last && (pageNumLinks.First.text === pageNumLinks.Last.text)) {
            pageNumLinks.First = null;
        }

        nextplease.logDetail("first page seems to be " + pageNumLinks.First);
        nextplease.logDetail("previous page seems to be " + pageNumLinks.Prev);
        nextplease.logDetail("next page seems to be " + pageNumLinks.Next);
        nextplease.logDetail("last page seems to be " + pageNumLinks.Last);

        // Try to find a match using our number algorithm
        if (prefetching) {
            for (i = 0; i < nextplease.directions.length; i++) {
                direction1 = nextplease.directions[i];
                if (!nextplease.prefetched[direction1] && pageNumLinks[direction1]) {
                    nextplease.prefetched[direction1] = [nextplease.ResultType.Link, pageNumLinks[direction1]];
                }
            }
            if (finishPrefetch()) { return true; }
        } else if (pageNumLinks[direction]) { return [nextplease.ResultType.Link, pageNumLinks[direction]]; }

        // Otherwise try looking for next/prev submit buttons 
        // if the user allows it.
        if (nextplease.useSubmit) {
            temp = nextplease.getForm(direction, prefetching);
            if (temp) { return temp; }
        }

        // See if we can increment the URL to get to next/prev/first
        var galleryURL = nextplease.getGalleryNumberURL(curWindow, direction);
        // alert(galleryURL);
        // alert(nextplease.imageLocationArray.length);
        // if (galleryURL) {curWindow.open(galleryURL, "_self", "");}
        if (galleryURL && !prefetching) { return [nextplease.ResultType.URL, galleryURL]; }

        // None of it worked, so make a recursive call to
        // nextplease.getLink on the frame windows.
        if (nextplease.useFrames) {
            var frames = curWindow.frames, framesNum = frames.length;
            for (j = 0; j < framesNum; j++) {
                temp = nextplease.getLink(frames[j], direction);
                if (temp) { return temp; }
            }
        }
        return finishPrefetch();
    };

    nextplease.getGalleryNumberURL = function (curWindow, direction) {
        nextplease.logDetail("trying to change the URL by a suitable number");
        var i;
        // alert(nextplease.imageLocationArray);
        var matches = nextplease.RegExes.Gallery.exec(decodeURI(curWindow.location.href));
        var prefixUrl, suffixUrl, numberUrlPartLength, curNumber, urlNumber, padStr, linkUrl;
        var urlsCache = nextplease.urlsCache;

        if (matches && (matches.length === 4)) {
            prefixUrl = matches[1];
            numberUrlPartLength = matches[2].length;
            suffixUrl = matches[3];
            nextplease.logDetail("URL prefix is " + prefixUrl + ", URL suffix is " + suffixUrl);
            if (direction === "Next") {
                curNumber = parseInt(matches[2], 10);
                for (i = 1; i < nextplease.MAX_GALLERY_GAP; i++) {
                    urlNumber = curNumber + i;
                    padStr = nextplease.padNumber(numberUrlPartLength, urlNumber);
                    linkUrl = prefixUrl + padStr + suffixUrl;
                    if (urlsCache.map[linkUrl]) {
                        nextplease.log("gallery URL found: " + linkUrl);
                        return linkUrl;
                    }
                }
                urlNumber = curNumber + 1;
                padStr = nextplease.padNumber(numberUrlPartLength, urlNumber);
                linkUrl = prefixUrl + padStr + suffixUrl;
                return linkUrl;
            } else if (direction === "Prev") {
                curNumber = parseInt(matches[2], 10);
                var maxToSubtract = Math.min(curNumber, nextplease.MAX_GALLERY_GAP);
                for (i = 1; i <= maxToSubtract; i++) {
                    urlNumber = curNumber - i;
                    padStr = nextplease.padNumber(numberUrlPartLength, urlNumber);
                    linkUrl = prefixUrl + padStr + suffixUrl;
                    if (urlsCache.map[linkUrl]) {
                        nextplease.log("gallery URL found: " + linkUrl);
                        return linkUrl;
                    }
                }
                urlNumber = curNumber - 1;
                if (urlNumber >= 0) {
                    padStr = nextplease.padNumber(numberUrlPartLength, urlNumber);
                    linkUrl = prefixUrl + padStr + suffixUrl;
                    nextplease.log("gallery URL found: " + linkUrl);
                    return linkUrl;
                }
            } else if (direction === "First") {
                urlNumber = 1;
                padStr = nextplease.padNumber(numberUrlPartLength, urlNumber);
                linkUrl = prefixUrl + padStr + suffixUrl;
                nextplease.log("gallery URL found: " + linkUrl);
                return linkUrl;
            }
        }
        return undefined;
    };

    nextplease.padNumber = function (length, newNum) {
        var padStr = "" + newNum;
        var padLen = length - padStr.length;
        var i;
        for (i = 0; i < padLen; i++) {
            padStr = "0" + padStr;
        }
        return padStr;
    };

    // Look through all the HTML inputs for submit buttons
    // that have a value that matches our phrases. If it
    // finds a match, it calls input.click()
    nextplease.getForm = function (direction, prefetching) {
        var finishPrefetch = function () {
            return prefetching && nextplease.prefetched.Next && nextplease.prefetched.Prev &&
                nextplease.prefetched.First && nextplease.prefetched.Last;
        };

        var i, text, direction1;

        nextplease.logDetail("looking for submit buttons");

        // Probably would be a little faster to
        // only check forms, but I'm getting problems
        // with them. I'm not sure if it's only on
        // malformed HTML pages, or if it's a Firefox bug.
        var inputs = window.content.document.getElementsByTagName("input"), inputsNum = inputs.length;

        for (i = 0; i < inputsNum; i++) {
            var input = inputs[i];
            text = nextplease.Trim(input.value);

            direction1 = nextplease.directionFromText(text, direction, prefetching);
            if (direction === direction1) {
                return [nextplease.ResultType.Input, input];
            } else if (direction1 && prefetching) {
                nextplease.prefetched[direction1] = [nextplease.ResultType.Input, input];
            }
        }

        var buttons = window.content.document.getElementsByTagName("button"), buttonsNum = buttons.length;
        var range = document.createRange();

        for (i = 0; i < buttonsNum; i++) {
            var button = buttons[i];
            range.selectNode(button);
            text = nextplease.Trim(range.toString());

            direction1 = nextplease.directionFromText(text, direction, prefetching);
            if (direction === direction1) {
                return [nextplease.ResultType.Input, button];
            } else if (direction1 && prefetching) {
                nextplease.prefetched[direction1] = [nextplease.ResultType.Input, button];
            }

            var imgElems = buttons[i].getElementsByTagName("img");
            if (imgElems.length > 0) {
                nextplease.logDetail("checking images inside <a>...</a>");
                // If the image matches, go to the URL.
                //alert(imgElems[0].src);
                direction1 = nextplease.directionFromImage(imgElems[0], direction, prefetching);
                if (direction === direction1) {
                    return [nextplease.ResultType.Input, button];
                } else if (direction1 && prefetching) {
                    nextplease.prefetched[direction1] = [nextplease.ResultType.Input, button];
                    continue;
                }
            }
        }

        return finishPrefetch();
    };

    nextplease.openResult = function (curWindow, result) {
        if (nextplease.highlightColor) {
            nextplease.highlight(result, nextplease.highlightColor);
        }

        switch (result[0]) {
            case nextplease.ResultType.URL:
                var url = result[1];
                curWindow.open(url, "_self", "");
                return true;
            case nextplease.ResultType.Link:
                var linkNode = result[1];
                if (!linkNode) {
                    nextplease.logError("Tried to open undefined link, this should never happen!");
                    return false;
                }
                // If it's got an onclick attr, then try to 
                // simulate a mouse click to activate link.
                if (linkNode.hasAttribute("onclick")) {
                    // alert(linkNode.getAttribute("onclick"));
                    var e = document.createEvent("MouseEvents");
                    // e.initMouseEvent("click", 1, 1, window, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, linkNode);

                    // From https://developer.mozilla.org/en/DOM/event.initMouseEvent
                    e.initMouseEvent("click", true, true, window,
                        0, 0, 0, 0, 0, false, false, false, false, 0, null);
                    linkNode.dispatchEvent(e);
                } else {
                    curWindow.open(linkNode.href, "_self", "");
                }
                nextplease.gotHereUsingNextplease = true;
                return true;
            case nextplease.ResultType.Input:
                var input = result[1];
                input.click();
                return true;
            case nextplease.ResultType.History:
                var num = result[1];
                curWindow.history.go(num);
                return true;
        }
    };

    // Looks through all the links and finds the link
    // that matches the linkNum (an integer between
    // 1 and 9). If it finds a match, it will go to 
    // that link.
    nextplease.openNumberedLink = function (curWindow, linkNum) {
        var text;
        var isInt = /^\s*\[?\s*(\d+)\s*\]?\s*$/;
        var i, j;

        nextplease.logDetail("looking for a link numbered " + linkNum);
        var alinks = curWindow.document.links;

        // Search through each link
        for (i = alinks.length - 1; i >= 0; i--) {
            var link = alinks[i];

            text = nextplease.Trim(link.text);

            var intMatches = isInt.exec(text);
            if (intMatches) {
                var linkPageNum = parseInt(intMatches[1], 10);
                if (linkPageNum === linkNum) {
                    return nextplease.openResult(curWindow, [nextplease.ResultType.Link, link]);
                    //curWindow.open(link.href, "_self", "");
                    //return true;
                }
            }
        }

        if (nextplease.useFrames) {
            var frames = curWindow.frames;
            for (j = 0; j < frames.length; j++) {
                if (nextplease.openNumberedLink(frames[j], linkNum)) { return true; }
            }
        }

        nextplease.notifyLinkNotFound();
        return false;
    };

    nextplease.openDirection = function (direction) {
        var result = nextplease.prefetched[direction] || nextplease.getLink(window.content, direction);
        if (result) {
            return nextplease.openResult(window.content, result);
        } else {
            nextplease.notifyLinkNotFound();
            return false;
        }
    };

    nextplease.openNextLink = function () {
        nextplease.logDetail("Looking for next link");
        return nextplease.openDirection("Next");
    };

    nextplease.openPrevLink = function () {
        nextplease.logDetail("Looking for prev link");
        return nextplease.openDirection("Prev");
    };

    nextplease.openFirstLink = function () {
        nextplease.logDetail("Looking for first link");
        return nextplease.openDirection("First");
    };

    nextplease.openLastLink = function () {
        nextplease.logDetail("Looking for last link");
        return nextplease.openDirection("Last");
    };

    nextplease.prefetch = function () {
        nextplease.getLink(window.content, "Prefetch");
        if (nextplease.highlightPrefetchedColor) {
            nextplease.highlight(nextplease.prefetched.Next, nextplease.highlightPrefetchedColor);
            nextplease.highlight(nextplease.prefetched.Prev, nextplease.highlightPrefetchedColor);
            nextplease.highlight(nextplease.prefetched.First, nextplease.highlightPrefetchedColor);
            nextplease.highlight(nextplease.prefetched.Last, nextplease.highlightPrefetchedColor);
        }
    };

    // old names retained because of http://www.mousegestures.org/exchange/details.php?mappingID=295
    nextplease.getNextLink = nextplease.openNextLink;
    nextplease.getPrevLink = nextplease.openPrevLink;
    nextplease.getFirstLink = nextplease.openFirstLink;
    nextplease.getLastLink = nextplease.openLastLink;

    nextplease.highlight = function (result, color) {
        if (result) {
            var element;
            switch (result[0]) {
                case nextplease.ResultType.URL:
                    break;
                case nextplease.ResultType.Link:
                case nextplease.ResultType.Input:
                    element = result[1];
                    break;
                // case nextplease.ResultType.History:
                // TODO The forward button doesn't get unhighlighted correctly
                // when it becomes disabled.
                // switch (result[1]) {
                //     case 1: element = document.getElementById("forward-button"); break;
                //     case -1: element = document.getElementById("back-button"); break;
                // }
            }
            if (element) {
                if (!nextplease.highlighted_old_styles[element]) {
                    nextplease.highlighted_old_styles[element] = element.style;
                }
                element.style.background = color;
            }
        }
    };

    nextplease.unhighlight = function () {
        var element;
        for (element in nextplease.highlighted_old_styles) {
            element.style = nextplease.highlighted_old_styles[element];
            delete nextplease.highlighted_old_styles[element];
        }
    };

    nextplease.showHideMenuItems = function () {
        var i, elem;
        var direction, numDirections = nextplease.directions.length;
        var propertyKey;

        var getCMItemByDir = function (direction) {
            var elemId = "nextPleaseAddRemove" + direction;
            return document.getElementById(elemId);
        };

        if (gContextMenu) {
            gContextMenu.showItem("nextplease.topMenu", nextplease.useContextMenu);

            if (nextplease.useContextMenu) {
                if (!gContextMenu.onLink && !gContextMenu.onImage) {
                    gContextMenu.showItem("nextplease-separator", false);
                    gContextMenu.showItem("nextpleaseTextOrURL", false);
                    gContextMenu.showItem("nextPleaseAddRemoveNext", false);
                    gContextMenu.showItem("nextPleaseAddRemovePrev", false);
                    gContextMenu.showItem("nextPleaseAddRemoveFirst", false);
                    gContextMenu.showItem("nextPleaseAddRemoveLast", false);
                } else {
                    var textOrUrl = nextplease.getTextOrUrlUnderPopup();
                    var phraseOrImage = gContextMenu.onImage ? "Image" : "Phrase";
                    document.getElementById("nextpleaseTextOrURL").label = gContextMenu.onImage ? textOrUrl : '"' + textOrUrl + '"';
                    var directionForItem = nextplease[phraseOrImage + "Map"][textOrUrl];
                    for (i = 0; i < numDirections; i++) {
                        direction = nextplease.directions[i];
                        elem = getCMItemByDir(direction);
                        propertyKey = (direction === directionForItem ? "remove" : "add") + phraseOrImage + "ContextMenu";
                        // alert("str = " + nextplease.strings.GetStringFromName(propertyKey) + "; param = " + nextplease.getDirectionString(direction));
                        elem.label = nextplease.strings.formatStringFromName(propertyKey, [nextplease.getDirectionString(direction)], 1);
                    }

                    gContextMenu.showItem("nextplease-separator", true);
                    gContextMenu.showItem("nextpleaseTextOrURL", true);
                    gContextMenu.showItem("nextPleaseAddRemoveNext", true);
                    gContextMenu.showItem("nextPleaseAddRemovePrev", true);
                    gContextMenu.showItem("nextPleaseAddRemoveFirst", true);
                    gContextMenu.showItem("nextPleaseAddRemoveLast", true);
                }
            }
        }
    };

    nextplease.addRemoveCM = function (direction) {
        var phraseOrImage = gContextMenu.onImage ? "Image" : "Phrase";
        var textOrUrl = nextplease.getTextOrUrlUnderPopup();
        var currentDirection = nextplease[phraseOrImage + "Map"][textOrUrl];
        if (currentDirection === direction) { // removing 
            if (nextplease.confirmRemove(phraseOrImage, textOrUrl, currentDirection)) {
                nextplease.addOrRemovePhraseOrImage(currentDirection, textOrUrl, phraseOrImage, "Remove");
            }
        } else if (currentDirection) { // replacing
            if (nextplease.confirmReplace(phraseOrImage, textOrUrl, currentDirection, direction)) {
                nextplease.addOrRemovePhraseOrImage(currentDirection, textOrUrl, phraseOrImage, "Remove");
                nextplease.addOrRemovePhraseOrImage(direction, textOrUrl, phraseOrImage, "Add");
            }
        } else {
            nextplease.addOrRemovePhraseOrImage(direction, textOrUrl, phraseOrImage, "Add");
        }
    };

    nextplease.addOrRemovePhraseOrImage = function (direction, textOrUrl, whichPhraseOrImage, whichAddOrRemove) {
        var prefname, map, logMessage;
        if (whichPhraseOrImage === "Phrase") {
            prefname = direction.toLowerCase() + "phrase";
            map = nextplease.PhraseMap;
            logMessage = (whichAddOrRemove === "Add") ?
                "adding phrase '" + textOrUrl + "' to " + prefname :
                "removing phrase '" + textOrUrl + "' from " + prefname;
            nextplease.logDetail(logMessage);
        } else {
            prefname = direction.toLowerCase() + "image";
            map = nextplease.ImageMap;
            logMessage = (whichAddOrRemove === "Add") ?
                "adding image URL " + textOrUrl + " to " + prefname :
                "removing image URL " + textOrUrl + " from " + prefname;
            nextplease.logDetail(logMessage);
        }

        if (whichAddOrRemove === "Add") {
            if (map[textOrUrl] !== direction) {
                map[textOrUrl] = direction;
                nextplease.addToPrefs(prefname, textOrUrl);
            } else {
                nextplease.log("error: already present in the list!");
            }
        } else {
            if (map[textOrUrl] === direction) {
                delete map[textOrUrl];
                nextplease.removeFromPrefs(prefname, textOrUrl);
            } else {
                nextplease.log("error: not present in the list!");
            }
        }
    };

    nextplease.getTextOrUrlUnderPopup = function () {
        if (gContextMenu && gContextMenu.onLink) {
            if (gContextMenu.onImage) {
                return document.popupNode.src;
            } else {
                var range = document.createRange();
                range.selectNode(document.popupNode);
                return nextplease.Trim(range.toString());
            }
        } else {
            return undefined;
        }
    };

    nextplease.addToPrefs = function (prefbranch, text) {
        nextplease.logDetail("adding " + text + " to " + prefbranch);
        var tempprefname = prefbranch + '.expr0';
        var prefvalue = nextplease.getUnicharPref(tempprefname);
        var resultprefvalue = prefvalue + "|" + text.replace(/\|/g, "&pipe;");

        nextplease.setUnicharPref(tempprefname, resultprefvalue);
    };

    nextplease.removeFromPrefs = function (prefbranch, text) {
        nextplease.logDetail("removing " + text + " from " + prefbranch);
        var tempprefname = prefbranch + '.expr0';
        var prefvalue = nextplease.getUnicharPref(tempprefname);
        var text1 = new RegExp("\\|" + text.replace(/\|/g, "&pipe;") + "(?=\\||$)", "g");
        var resultprefvalue = prefvalue.replace(text1, "");

        nextplease.setUnicharPref(tempprefname, resultprefvalue);
    };

    nextplease.linkNumber = 0;

    nextplease.handleNumberShortcut = function (digit) {
        // no effect if nextplease.NumberShortcutTimer is invalid
        clearTimeout(nextplease.NumberShortcutTimer);

        nextplease.linkNumber = nextplease.linkNumber * 10 + digit;

        nextplease.showInStatusBar(
            nextplease.strings.formatStringFromName("lookingForNumberedLink", [nextplease.linkNumber], 1));

        nextplease.NumberShortcutTimer = setTimeout(nextplease.finishNumberShortcut, 500);
    };

    nextplease.finishNumberShortcut = function () {
        nextplease.openNumberedLink(window.content, nextplease.linkNumber);
        nextplease.linkNumber = 0;
        clearTimeout(nextplease.NumberShortcutTimer);
    };

})();
