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

    function getLinkNumber(text) {
        const intMatches = /^\s*\[?\s*(\d+)\s*,?\]?\s*$/.exec(text);
        return intMatches ? parseInt(intMatches[1], 10) : undefined;
    }

    nextplease.prefetched = {};
    for (const key of ["PhraseMap", "ImageMap", "RegExes"]) {
        nextplease[key] = nextplease.key || {};
    }

    // Listen for messages from the popup and from commands
    browser.runtime.onMessage.addListener((message) => {
        nextplease.log(`Handling message ${JSON.stringify(message)}`);

        if (message.direction) {
            nextplease.openDirection(message.direction);
        } else if (message.number) {
            nextplease.openNumberedLink(window, message.number);
        } else if (message.digit) {
            nextplease.handleNumberShortcut(message.digit);
        }
    });

    function onOptionsLoaded() {
        nextplease.readPreferences();

        nextplease.cacheLinkLocations();

        nextplease.prefetched = {};
        nextplease.unhighlight();

        const prefetch = nextplease.prefs.prefetch;
        if (prefetch === "yes") {
            nextplease.prefetch();
        } else if ((prefetch === "smart") && nextplease.gotHereUsingNextplease) {
            nextplease.prefetch();
            nextplease.gotHereUsingNextplease = false;
        }
    }

    function debounce(fn, delay) {
        var timer = null;
        return function () {
            var context = this, args = arguments;
            clearTimeout(timer);
            timer = setTimeout(function () {
                fn.apply(context, args);
            }, delay);
        };
    }

    nextplease.prefs.$loaded.then(onOptionsLoaded);
    nextplease.prefs.$addObserver(key => {
        if (key !== "showAdvanced") {
            debounce(onOptionsLoaded, 250);
        }
    });

    nextplease.gotHereUsingNextplease = false;

    nextplease.urlsCache = { first: undefined, last: undefined, size: 0, MAX_SIZE: 1000, map: {} };
    nextplease.currentHostName = location.host;

    nextplease.ResultType = { Link: 0, URL: 1, Input: 2, History: 3 };

    nextplease.highlighted_old_styles = {};

    browser.storage.onChanged.addListener((changes, areaName) => {
        nextplease.readPreferences();
    });

    nextplease.validateCache = function () {
        const urlsCache = nextplease.urlsCache, cachedURLsNum = urlsCache.size;
        let messageLines = [`size=${cachedURLsNum}; first=${urlsCache.first}; last=${urlsCache.last}`];

        if (cachedURLsNum > 0) {
            let url = urlsCache.first;
            for (let i = 0; i < cachedURLsNum; i++ , url = urlsCache.map[url]) {
                messageLines.push(`i=${i}; url=${url}; urlsCache.map[url]=${urlsCache.map[url]}`);
                if (!url) {
                    nextplease.logError(messageLines.join("\n\n"));
                    return;
                }
            }
            if (url !== urlsCache.last) {
                nextplease.logError(messageLines.join("\n\n"));
                return;
            }
        } else if (urlsCache.first || urlsCache.last) {
            nextplease.logError(messageLines[0]);
        }
    };

    nextplease.addToCache = function (url) {
        const urlsCache = nextplease.urlsCache;
        let incrSize = true;
        if (url && !urlsCache.map[url]) {
            if (urlsCache.size === 0) {
                urlsCache.first = url;
                urlsCache.map[url] = url;
                urlsCache.last = url;
                urlsCache.size = 1;
            } else {
                if (urlsCache.size >= urlsCache.MAX_SIZE) {
                    const urlToDelete = urlsCache.first;
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
        }
    };

    nextplease.cacheLinkLocations = function () {
        var i, urlsCache = nextplease.urlsCache;

        nextplease.logDetail("caching image location");
        nextplease.logDetail(`there are currently ${urlsCache.size} image URLs cached`);

        var theDocument = window.document;
        nextplease.currentHostName = window.location.host;

        var start = new Date();

        const MAX_LINKS_TO_CHECK = 1000;

        var imgElems = theDocument.getElementsByTagName("img"), imgElemsNum = imgElems.length;
        if (imgElems) {
            var numberOfImagesToCheck = Math.min(MAX_LINKS_TO_CHECK, imgElemsNum);
            nextplease.logDetail(`Checking ${numberOfImagesToCheck} <img> elements out of ${imgElemsNum} total.`);
            for (i = 0; i < numberOfImagesToCheck; i++) {
                nextplease.addToCache(imgElems[i].src);
            }
        }

        var links = theDocument.getElementsByTagName("a"), linksNum = links.length;
        if (links) {
            var numberOfLinksToCheck = Math.min(MAX_LINKS_TO_CHECK, linksNum);
            nextplease.logDetail(`Checking ${numberOfLinksToCheck} <a> elements out of ${linksNum} total.`);
            for (i = 0; i < numberOfLinksToCheck; i++) {
                var linkUrl = links[i].href;
                if (!urlsCache.map[linkUrl]) {
                    // only links from this host are interesting to NextPlease
                    if (links[i].hostname === nextplease.currentHostName) {
                        nextplease.addToCache(linkUrl);
                    }
                }
            }
        }
        var end = new Date();
        nextplease.logDetail("caching took " + (end.getTime() - start.getTime()) + " ms");

        if (nextplease.prefs.logLevel > 1) {
            nextplease.logDetail("checking cache correctness again");
            nextplease.validateCache();
        }
    };

    nextplease.readPreferences = function () {
        try {
            nextplease.RegExes = {};

            nextplease.directions.forEach(initRegexFromPref);
            initRegexFromPref("Gallery");

            initExactMatches("Phrase");
            initExactMatches("Image");
        } catch (e) {
            nextplease.logError(e);
        }

        function initRegexFromPref(direction) {
            let prefKey = direction + "Regex";
            let regex = nextplease.prefs[prefKey];
            try {
                regex = new RegExp(regex, "i");
            } catch (e) {
                nextplease.logError(`nextplease.prefs.${prefKey}="${regex}" is not a regex`);
                regex = new RegExp(nextplease.prefs.$default[prefKey], "i");
            }
            nextplease.RegExes[direction] = regex;
        }

        // Read the phrases that specify a next link
        // by reading the preferences or defaults,
        // and put the phrases in a lookup table.
        function initExactMatches(phraseOrImage) {
            const map = {};
            for (const direction of nextplease.directions) {
                const prefName = direction + phraseOrImage;
                for (const value of stringArrayFromPref(prefName)) {
                    // already normalized
                    if (value) {
                        map[value] = direction;
                    }
                }
            }
            nextplease[phraseOrImage + "Map"] = map;
        }

    };

    nextplease.notifyLinkNotFound = function () {
        nextplease.notify({ messageKey: "linkNotFound" });
    };

    nextplease.directionFromRel = function (link) {
        // Look for rel attributes for next/prev/first/last
        if (link.rel && link.href) {
            const rel = link.rel.toLowerCase();
            if (rel === "next") {
                nextplease.log(`found rel="${link.rel}": ${link.href}`);
                return "Next";
            } else if ((rel === "prev") || (rel === "previous")) {
                nextplease.log(`found rel="${link.rel}": ${link.href}`);
                return "Prev";
            } else if ((rel === "first") || (rel === "start") || (rel === "begin")) {
                nextplease.log(`found rel="${link.rel}": ${link.href}`);
                return "First";
            } else if ((rel === "end") || (rel === "last")) {
                nextplease.log(`found rel="${link.rel}": ${link.href}`);
                return "Last";
            }
        }
        return undefined;
    };

    nextplease.directionFromText = function (text, direction, prefetching) {
        function testRegex(direction) {
            const regex = nextplease.RegExes[direction];
            return regex && regex.test(text);
        }

        if (text) {
            text = nextplease.normalize(text);
            const direction1 = nextplease.PhraseMap[text];
            if (direction1) {
                nextplease.log(`found text match for "${text}"`);
                return direction1;
            } else if (prefetching) {
                for (const direction2 of nextplease.directions) {
                    if (!nextplease.prefetched[direction2] && testRegex(direction2)) {
                        nextplease.log(`found regex match for "${text}"`);
                        return direction2;
                    }
                }
            } else if (testRegex(direction)) {
                nextplease.log(`found regex match for "${text}"`);
                return direction;
            }
        }
        return undefined;
    };

    nextplease.directionFromImage = function (imageElem, direction, prefetching) {
        const direction1 = nextplease.ImageMap[imageElem.src];
        if (direction1) {
            nextplease.log("found image match with URL " + imageElem.src);
            if (!prefetching || !nextplease.prefetched[direction1]) {
                return direction1;
            } else {
                return undefined;
            }
        } else {
            const imgtext = imageElem.alt || imageElem.title;

            return nextplease.directionFromText(imgtext, direction, prefetching);
        }
    };

    nextplease.ignoreRels = function (curWindow) {
        const url = curWindow.location.href;
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
        var prefetching = (direction === "Prefetch");

        var direction1;

        var text;

        var pageNumLinks = { Next: null, Prev: null, First: null, Last: null, Tmp: null };

        var firstPageNum;

        const MAX_LINK_NUM = 10000;

        var tmpPageNum = MAX_LINK_NUM;
        var insideNumberBlock = false;

        var link;

        var temp;

        const range = doc.createRange();

        function finishPrefetch() {
            return prefetching && nextplease.prefetched.Next && nextplease.prefetched.Prev &&
                nextplease.prefetched.First && nextplease.prefetched.Last;
        }

        if (!nextplease.ignoreRels(curWindow)) {
            // Look for <LINK> tags
            nextplease.logDetail("checking <link> tags");
            const linktags = doc.getElementsByTagName("link"), linktagsNum = linktags.length;

            for (let i = 0; i < linktagsNum; i++) {
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
        for (let i = 0; i < alinksNum; i++) {
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
            text = range.toString().trim();

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
                direction1 = nextplease.directionFromImage(imgElems[0], direction, prefetching);
                if (direction === direction1) {
                    return [nextplease.ResultType.Link, link];
                } else if (direction1 && prefetching) {
                    nextplease.prefetched[direction1] = [nextplease.ResultType.Link, link];
                    continue;
                }
            }

            if (finishPrefetch()) { return true; }

            const linkPageNum = getLinkNumber(text);
            if (linkPageNum) {
                // If the number is greater than MAX_LINK_NUM
                // and doesn't follow smaller numbers
                // it probably doesn't have anything to do with
                // a next/prev link.
                //    nextplease.logDetail(linkPageNum);
                if (insideNumberBlock || (linkPageNum < MAX_LINK_NUM)) {
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
                        firstPageNum = linkPageNum;

                        pageNumLinks.First = link;
                        pageNumLinks.Prev = null;
                        pageNumLinks.Next = null;
                        pageNumLinks.Last = null;
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
            for (let i = 0; i < nextplease.directions.length; i++) {
                direction1 = nextplease.directions[i];
                if (!nextplease.prefetched[direction1] && pageNumLinks[direction1]) {
                    nextplease.prefetched[direction1] = [nextplease.ResultType.Link, pageNumLinks[direction1]];
                }
            }
            if (finishPrefetch()) { return true; }
        } else if (pageNumLinks[direction]) {
            return [nextplease.ResultType.Link, pageNumLinks[direction]];
        }

        // Otherwise try looking for next/prev submit buttons
        // if the user allows it.
        if (nextplease.prefs.allowsubmit) {
            nextplease.logDetail("looking for submit buttons");

            // Look through all the HTML inputs for submit buttons
            // that have a value that matches our phrases. If it
            // finds a match, it calls input.click()
            function getForm() {
                // Probably would be a little faster to
                // only check forms, but I'm getting problems
                // with them. I'm not sure if it's only on
                // malformed HTML pages, or if it's a Firefox bug.
                const inputs = document.getElementsByTagName("input");

                for (const input of inputs) {
                    text = input.value.trim();

                    direction1 = nextplease.directionFromText(text, direction, prefetching);
                    if (direction === direction1) {
                        return [nextplease.ResultType.Input, input];
                    } else if (direction1 && prefetching) {
                        nextplease.prefetched[direction1] = [nextplease.ResultType.Input, input];
                    }
                }

                const buttons = document.getElementsByTagName("button");
                const range = document.createRange();

                for (const button of buttons) {
                    range.selectNode(button);
                    text = range.toString().trim();

                    direction1 = nextplease.directionFromText(text, direction, prefetching);
                    if (direction === direction1) {
                        return [nextplease.ResultType.Input, button];
                    } else if (direction1 && prefetching) {
                        nextplease.prefetched[direction1] = [nextplease.ResultType.Input, button];
                    }

                    var imgElems = button.getElementsByTagName("img");
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
            }

            temp = getForm();
            if (temp) { return temp; }
        }

        if (!prefetching) {
            // See if we can increment the URL to get to next/prev/first
            const galleryURL = nextplease.getGalleryNumberURL(curWindow, direction);
            if (galleryURL) {
                return [nextplease.ResultType.URL, galleryURL];
            }
        }

        // None of it worked, so make a recursive call to
        // nextplease.getLink on the frame windows.
        if (nextplease.prefs.checkframes) {
            const frames = curWindow.frames, framesNum = frames.length;
            for (let j = 0; j < framesNum; j++) {
                temp = nextplease.getLink(frames[j], direction);
                if (temp) { return temp; }
            }
        }
        return finishPrefetch();
    };

    nextplease.getGalleryNumberURL = function (curWindow, direction) {
        nextplease.logDetail("trying to change the URL by a suitable number");
        const matches = nextplease.RegExes.Gallery && nextplease.RegExes.Gallery.exec(decodeURI(curWindow.location.href));

        if (matches && (matches.length === 4)) {
            const prefixUrl = matches[1];
            const numberUrlPartLength = matches[2].length;
            const suffixUrl = matches[3];
            nextplease.logDetail("URL prefix is " + prefixUrl + ", URL suffix is " + suffixUrl);

            const MAX_GALLERY_GAP = 20;

            let curNumber, urlNumber, linkUrl;

            function makeLinkUrl() {
                let padStr = "" + urlNumber;
                const padLen = numberUrlPartLength - padStr.length;
                for (let i = 0; i < padLen; i++) {
                    padStr = "0" + padStr;
                }
                return prefixUrl + padStr + suffixUrl;
            }

            if (direction === "Next") {
                curNumber = parseInt(matches[2], 10);
                for (let i = 1; i < MAX_GALLERY_GAP; i++) {
                    urlNumber = curNumber + i;
                    linkUrl = makeLinkUrl();
                    if (nextplease.urlsCache.map[linkUrl]) {
                        nextplease.log("gallery URL found: " + linkUrl);
                        return linkUrl;
                    }
                }
                urlNumber = curNumber + 1;
                linkUrl = makeLinkUrl();
                return linkUrl;
            } else if (direction === "Prev") {
                curNumber = parseInt(matches[2], 10);
                const maxToSubtract = Math.min(curNumber, MAX_GALLERY_GAP);
                for (let i = 1; i <= maxToSubtract; i++) {
                    urlNumber = curNumber - i;
                    linkUrl = makeLinkUrl();
                    if (nextplease.urlsCache.map[linkUrl]) {
                        nextplease.log("gallery URL found: " + linkUrl);
                        return linkUrl;
                    }
                }
                urlNumber = curNumber - 1;
                if (urlNumber >= 0) {
                    linkUrl = makeLinkUrl();
                    nextplease.log("gallery URL found: " + linkUrl);
                    return linkUrl;
                }
            } else if (direction === "First") {
                urlNumber = 1;
                linkUrl = makeLinkUrl();
                nextplease.log("gallery URL found: " + linkUrl);
                return linkUrl;
            }
        }
        return undefined;
    };

    nextplease.openResult = function (curWindow, result) {
        if (nextplease.prefs.highlight) {
            nextplease.highlight(result, nextplease.prefs.highlightColor);
        }

        switch (result[0]) {
            case nextplease.ResultType.URL: {
                const url = result[1];
                curWindow.location.href = url;
                return true;
            }
            case nextplease.ResultType.Link: {
                const linkNode = result[1];
                if (!linkNode) {
                    nextplease.logError("Tried to open undefined link, this should never happen!");
                    return false;
                }
                // If it's got an onclick attr, then try to
                // simulate a mouse click to activate link.
                if (linkNode.hasAttribute("onclick")) {
                    const e = document.createEvent("MouseEvents");

                    // From https://developer.mozilla.org/en/DOM/event.initMouseEvent
                    e.initMouseEvent("click", true, true, window,
                        0, 0, 0, 0, 0, false, false, false, false, 0, null);
                    linkNode.dispatchEvent(e);
                } else {
                    curWindow.location.href = linkNode.href;
                }
                nextplease.gotHereUsingNextplease = true;
                return true;
            }
            case nextplease.ResultType.Input: {
                const input = result[1];
                input.click();
                return true;
            }
            case nextplease.ResultType.History: {
                const num = result[1];
                curWindow.history.go(num);
                return true;
            }
        }
    };

    // Looks through all the links and finds the link
    // that matches the linkNum (an integer between
    // 1 and 9). If it finds a match, it will go to
    // that link.
    nextplease.openNumberedLink = function (curWindow, linkNum) {
        nextplease.logDetail("looking for a link numbered " + linkNum);
        const alinks = curWindow.document.links;

        // Search through each link
        for (let i = alinks.length - 1; i >= 0; i--) {
            const link = alinks[i];

            const linkPageNum = getLinkNumber(link.text.trim());
            if (linkPageNum === linkNum) {
                return nextplease.openResult(curWindow, [nextplease.ResultType.Link, link]);
            }
        }

        if (nextplease.prefs.checkframes) {
            const frames = curWindow.frames;
            for (let j = 0; j < frames.length; j++) {
                if (nextplease.openNumberedLink(frames[j], linkNum)) { return true; }
            }
        }

        nextplease.notifyLinkNotFound();
        return false;
    };

    nextplease.openDirection = function (direction) {
        const result = nextplease.prefetched[direction] || nextplease.getLink(window, direction);
        if (result) {
            return nextplease.openResult(window, result);
        } else {
            nextplease.notifyLinkNotFound();
            return false;
        }
    };

    nextplease.prefetch = function () {
        nextplease.log("Prefetching");
        nextplease.getLink(window, "Prefetch");
        if (nextplease.prefs.highlightPrefetched) {
            const color = nextplease.prefs.highlightPrefetchedColor;
            for (const direction of nextplease.directions) {
                if (nextplease.prefetched[direction]) {
                    nextplease.highlight(nextplease.prefetched[direction], color);
                }
            }
        }
    };

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
        for (const element in nextplease.highlighted_old_styles) {
            element.style = nextplease.highlighted_old_styles[element];
            delete nextplease.highlighted_old_styles[element];
        }
    };

    nextplease.linkNumber = 0;

    nextplease.NumberShortcutTimer = null;
    nextplease.handleNumberShortcut = function (digit) {
        // no effect if nextplease.NumberShortcutTimer is null
        clearTimeout(nextplease.NumberShortcutTimer);

        nextplease.linkNumber = nextplease.linkNumber * 10 + digit;

        nextplease.notify({
            id: "lookingForNumberedLink",
            messageKey: "lookingForNumberedLink",
            messageArgs: [nextplease.linkNumber],
            timeout: nextplease.prefs.digitDelay
        });

        nextplease.NumberShortcutTimer = setTimeout(nextplease.finishNumberShortcut, nextplease.prefs.digitDelay);
    };

    nextplease.finishNumberShortcut = function () {
        nextplease.openNumberedLink(window, nextplease.linkNumber);
        nextplease.linkNumber = 0;
        clearTimeout(nextplease.NumberShortcutTimer);
    };

})();
