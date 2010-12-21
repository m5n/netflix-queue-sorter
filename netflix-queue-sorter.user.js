///////////////////////////////////////////////////////////////////////////////
//
// This is a Greasemonkey user script.
//
// Netflix Queue Sorter
// Version 1.14, 2010-12-21
// Coded by Maarten van Egmond.  See namespace URL below for contact info.
// Released under the GPL license: http://www.gnu.org/copyleft/gpl.html
//
// ==UserScript==
// @name        Netflix Queue Sorter
// @namespace   http://userscripts.org/users/64961
// @author      Maarten
// @version     1.14
// @description v1.14: Sort your Netflix queue by movie title, length, genre, average rating, star/suggested/user rating, availability, or playability.  Includes options to shuffle/randomize or reverse your queue.
// @include     http://movies.netflix.com/Queue*
// ==/UserScript==
//
///////////////////////////////////////////////////////////////////////////////
//
// For install, uninstall, and known issues, see the namespace link above.
//
///////////////////////////////////////////////////////////////////////////////
//
// This script allows you to shuffle (that is: randomize), reverse, or sort
// your DVD or Instant Queue by movie title, length, genre, star rating (that
// is: suggested rating or user rating), average rating, availability, or
// playability.
//
///////////////////////////////////////////////////////////////////////////////

// Satisfy JSLint.
/*global alert, clearTimeout, document, GM_getValue, GM_setValue, GM_registerMenuCommand, GM_xmlhttpRequest, setTimeout */

// Singleton pattern.
var NetflixQueueSorter = (function () {
    //
    // Private variables
    //
    var sortButtons = [];
    var sortInfo = [];
    var getQueue = [];
    var totalQueueCount = 0;
    var seriesLookup = {};
    var cancelledSort = false;
    var XHR_DELAY = 500;

    //
    // Private functions
    //

    // Add support for document.getElementsByClassName, e.g. for FF2.
    function customGetElementsByClassName(elt, tag, name) {
        if ("undefined" === typeof elt.getElementsByClassName) {
            var result = [];

            if (undefined === tag) { 
                alert('Internal error: must pass tag name!');
            } else {
                var elts = elt.getElementsByTagName(tag);
                for (var ii = 0; ii < elts.length; ii++) {
                    if (elts[ii].className === name) {
                        result.push(elts[ii]);
                    }
                }
            }

            return result;
        } else {
            return elt.getElementsByClassName(name);
        }
    }

    // To somewhat synchronize AJAX calls and the cancelling of the sort,
    // the button click will just set the flag, and only after the last 
    // AJAX result is processed will the cancel command itself be processed.
    function cancelSort() {
        cancelledSort = true;
    }
    function realCancelSort() {
        // Clear the status message, since we're done.
        clearProgressStatus();

        // Re-enable the sort buttons.
        setSortButtonState(true);
    }

    function createSortButton(value, label, title, onClickFn) {
        var button = document.createElement('button');
        button.setAttribute('type', 'button');
        button.setAttribute('value', value);
        button.setAttribute('title', title);
        button.setAttribute('style', 'font-size: smaller');
        var buttonText = document.createTextNode(label);
        button.appendChild(buttonText);
        button.addEventListener('click', onClickFn, true);
        return {
            'button': button,
            'text': buttonText
        };
    }

    function addOptions(header, options) {
        var div = document.createElement('div');

        for (var idx = 0; idx < options.length; idx++) {
            if (options[idx].isProgress) {
                // Progress feedback area.
                var span = document.createElement('span');
                span.setAttribute('id', 'gm_progress_' + header.className);
                span.setAttribute('style', 'padding: 0 0 2px 2px');
                div.appendChild(span);
                span = document.createElement('span');
                span.setAttribute('id',
                        'gm_progress_cancel_' + header.className);
                span.setAttribute('style',
                        'padding: 0 0 2px 7px; visibility: hidden');
                span.appendChild(document.createTextNode('['));
                // Cancel button.
                var link = document.createElement('a');
                link.setAttribute('style', 'cursor: pointer');
                link.appendChild(document.createTextNode('cancel'));
                link.addEventListener('click', cancelSort, true);
                span.appendChild(link);
                span.appendChild(document.createTextNode(']'));
                div.appendChild(span);
            } else {
                var buttonInfo = createSortButton(
                        options[idx].sort, options[idx].label,
                        options[idx].title, reorderQueue);
                sortButtons.push(buttonInfo);
                div.appendChild(buttonInfo.button);
            }
            div.appendChild(document.createElement('br'));
        }
        div.appendChild(document.createElement('br'));

        var headerText = header.childNodes[0];
        header.replaceChild(div, headerText);
        header.appendChild(headerText);
    }

    function addOrderSortOption(header) {
        addOptions(header, [
            {
                'sort': 'shuffle',
                'label': 'Shuffle',
                'title': 'Shuffles your queue into a random order.'
            },
            {
                'sort': 'reverse',
                'label': 'Reverse',
                'title': 'Reverses the current list order.'
            }
        ]);
    }

    function addTitleSortOption(header) {
        addOptions(header, [
            {
                'isProgress': true 
            },
            {
                'sort': 'title',
                'label': 'Sort by Title',
                'title': 'Alphabetically sorts your queue by movie title.'
            },
            {
                'sort': 'length',
                'label': 'Sort by Length / Display Length',
                'title': 'Displays the length of each movie and sorts your ' +
                        'queue by length from short to long.'
            }
        ]);
    }

    function addInstantSortOption(header) {
        addOptions(header, [
            {
                'sort': 'instantTop',
                'label': '/\\',
                'title': 'Move instantly playable movies to the top of your ' +
                        'queue.'
            },
            {
                'sort': 'instantBottom',
                'label': '\\/',
                'title': 'Move instantly playable movies to the bottom of ' +
                        'your queue.'
            }
        ]);
    }

    function addStarSortOption(header) {
        addOptions(header, [
            {
                'isProgress': true 
            },
            {
                'sort': 'usrRating',
                'label': 'Sort by Star Rating',
                'title': 'Sorts all movies by star rating from high to low.'
            },
            {
                'sort': 'avgRating',
                'label': 'Sort by Avg Rating',
                'title': 'Sorts all movies by average rating from high to low.'
            }
        ]);
    }

    function addGenreSortOption(header) {
        addOptions(header, [
            {
                'sort': 'genre',
                'label': 'Sort by Genre',
                'title': 'Alphabetically sorts your queue by genre.'
            }
        ]);
    }

    function addAvailabilitySortOption(header) {
        addOptions(header, [
            {
                'sort': 'availability',
                'label': 'Sort by Availability',
                'title': 'Moves the most desirable movies to the top of ' +
                        'your queue.'
            }
        ]);
    }

    // This function builds the GUI and adds it to the page body.
    function buildGui() {
        var elt = document.getElementById('inqueue-header-row');
        var children = elt.childNodes;
        for (var ii = 0; ii < children.length; ii++) {
            if (children[ii].tagName === "TH") {
                if (children[ii].className === "prmt") {
                    addOrderSortOption(children[ii]);
                } else if (children[ii].className === "tt") {
                    addTitleSortOption(children[ii]);
                } else if (document.URL.indexOf('inqt=wn') < 0 &&
                        // Not instant so allow sort by playability.
                        children[ii].className === "wn") {
                    addInstantSortOption(children[ii]);
                } else if (children[ii].className === "st") {
                    addStarSortOption(children[ii]);
                } else if (children[ii].className === "gn") {
                    addGenreSortOption(children[ii]);
                } else if (children[ii].className === "av") {
                    addAvailabilitySortOption(children[ii]);
                }
            }
        }
    }

    function setProgressStatus(id, msg, canCancel) {
        canCancel = undefined === canCancel;   // Init.

        var elt = document.getElementById('gm_progress_' + id);
        if (elt) {
            elt.innerHTML = msg;
        }

        elt = document.getElementById('gm_progress_cancel_' + id);
        elt.style.visibility = canCancel ? 'visible' : 'hidden';
    }

    function clearProgressStatus() {
        setProgressStatus('tt', '', false);
        setProgressStatus('st', '', false);
    }

    function setButtonState(button, enabled) {
        if (enabled) {
            button.removeAttribute('disabled');
        } else {
            button.setAttribute('disabled', true);
        }
    }

    function setSortButtonState(enabled) {
        for (var idx = 0, len = sortButtons.length; idx < len; idx++) {
            setButtonState(sortButtons[idx].button, enabled);
        }
    }

    function done(enableUpdateQueueButton, firstBox) {
        // Re-enable the sort buttons.
        setSortButtonState(true);

        // Enable the Update Queue button.
        if (firstBox) {
            firstBox.focus();   // This will enable the button.
            firstBox.blur();   // Don't interfere with keyboard navigation.

            // The focus() above will also color the row, so remove that.
            // (Either color all changed rows (see v1.0), or none.)
            var row = document.getElementById('firstqitem');
            if (row) {
                row.className = row.className.replace('bgreorder', '');
            }
        }
    }

    function setOrder(sortValue, elts) {
        elts = elts || customGetElementsByClassName(document, 'input', 'o');

        var elt, firstBox, len, pos;
        for (pos = 0, len = sortInfo.length; pos < len; pos++) {
            // Note: sortValue is 1-based, elts index is 0-based, so sub 1
            elt = elts[sortInfo[pos][sortValue] - 1];

            // Set new value.
            elt.value = sortInfo.length - pos;

            if (sortInfo[pos].origPos === 1) {
                firstBox = elt;
            }
        }

        // Clear the status message, since we're done.
        clearProgressStatus();

        done(true, firstBox);

        // Inform the user that sort has finished and what the next steps are.
        elt = document.getElementById('updateQueue1');
        alert("Sort completed.  Now press the " + elt.alt +
                " button to save it.");
    }

    function doActualSort(algorithm) {
        var sortFn = function (a, b) {
            if (a[algorithm] === b[algorithm]) {
                return a.title > b.title ? -1 : 1;
            }
            return a[algorithm] > b[algorithm] ? 1 : -1;
        };
        sortInfo.sort(sortFn);

        setOrder("origPos");
    }

    // Return publicly accessible variables and functions.
    function reverse() {
        var elts = customGetElementsByClassName(document, 'input', 'o');

        var maxIdx = Math.floor(elts.length / 2);
        for (var idx = 0; idx < maxIdx; idx++) {
            var otherIdx = elts.length - idx - 1;

            // Swap the values.
            var tmp = elts[otherIdx].value;
            elts[otherIdx].value = elts[idx].value;
            elts[idx].value = tmp;
        }

        done(true, elts[0]);

        // Inform the user that sort has finished and what the next steps are.
        var elt = document.getElementById('updateQueue1');
        alert("Reversal completed.  Now press the " + elt.alt +
                " button to save it.");
    }

    function shuffle() {
        var idx;
        var elts = customGetElementsByClassName(document, 'input', 'o');

        // Generate a list of random positions.
        var slots = [];
        for (idx = 0; idx < elts.length; idx++) {
            slots.push(idx);
        }

        for (idx = 0; idx < elts.length; idx++) {
            // Generate number between 0 and slots.length - 1.
            // Math.random() generates a number between 0 (incl) and 1 (excl).
            var slotsIdx = Math.floor(Math.random() * slots.length);
            elts[idx].value = slots[slotsIdx];
            
            // Remove used position from slots array.
            slots.splice(slotsIdx, 1);
            // Note: if splice turns out to be expensive, we could just move
            // the slotsIdx value to the front of the array and keep a pointer
            // to the end of the "used" positions.
        }

        done(true, elts[0]);

        // Inform the user that sort has finished and what the next steps are.
        var elt = document.getElementById('updateQueue1');
        alert("Shuffle completed.  Now press the " + elt.alt +
                " button to save it.");
    }

    function sortByLength() {
        sortInfo = [];
        var pos = 1;

        for (var idx = 0; idx < getQueue.length; idx++) {
            var qq = getQueue[idx];

            var record = {
                "id": qq.boxId,
                "len": qq.len,
                "origPos": pos++
            };
            sortInfo.push(record);
        }

        var sortFn = function (a, b) {
            return a.len > b.len ? -1 : 1;
        };
        sortInfo.sort(sortFn);

        setOrder("origPos");
    }

    function getLength(queueIdx) {
        if (queueIdx < totalQueueCount) {
            var record = getQueue[queueIdx];
            if (!record) {
                // Unexpected result.
                alert('Unexpected situation: no record found in queue.\n' +
                        'Please let the script owner know.\n\n' +
                        'GetLength: ' + queueIdx + ' out of ' +
                        totalQueueCount);
                done(false);
                return;
            }

            // Update progress.
            if (queueIdx < totalQueueCount - 1) {
                var pct = ((queueIdx / totalQueueCount) * 100).toFixed(0);
                setProgressStatus('tt', 'Getting length info: ' + pct + '%');
            } else {
                setProgressStatus('tt', 'Getting length info: 100%', false);
            }

            // Since user can cancel and then re-start the sort, check if 
            // length was already added.  Code here mimics parseGetLength.
            var elt = document.getElementById(record.titleId);
            elt = elt.parentNode;
            if (/^<code><b>\[\d+:\d+/.test(elt.innerHTML)) {
                // Next item in the queue.
                getLength(queueIdx + 1);
            } else {
                var url = record.url;
                GM_xmlhttpRequest({
                    'method': 'GET',
                    'url': url,
                    'onload': function (xhr) {
                        parseGetLength(queueIdx, xhr.responseText);
                    }
                });
            }
        } else {
            // Now we can sort.
            sortByLength();
        }
    }

    function parseGetLength(queueIdx, text) {
        // Use low value to make them appear on top if length cannot be
        // retrieved.
        var len = -Infinity;
        var readableLen = " N/A ";
        var isEpisode = false;

        // In JavaScript, "everything until and including a newline" is
        // represented as the expression "(?:.*?\n)*?".  So that matches
        // wherever you are in the string until the end-of-line, and any
        // lines underneath it.  To continue matching on another line,
        // skip into the line first using ".*?".
        var regex = /="duration"(?:.*?\n)*?.*?(\d+?) minutes</;
        if (regex.test(text)) {
            len = RegExp.$1 * 1;   // Convert to number.
        } else {   // Could be a series... take the first episode.
            regex = /="duration(?:.*?\n)*?.*?(\d+?) min[su]/;
            if (regex.test(text)) {
                len = RegExp.$1 * 1;   // Convert to number.
                isEpisode = true;
            }
            // Else no match... use high default values.
        }

        // Store value in minutes for sort cycle happening later.
        getQueue[queueIdx].len = len * 1;

        if (-Infinity !== len) {
            // Format minutes in something more readable.
            var hh = Math.floor(len / 60);
            var mm = len - (hh * 60);
            readableLen = hh + ":" + (mm < 10 ? "0" : "") + mm;
        }

        // Add duration to text in title column.
        var elt = document.getElementById(getQueue[queueIdx].titleId);
        elt = elt.parentNode;   // Use parent node to avoid linking time.
        elt.innerHTML = '<code><b>[' + readableLen + (isEpisode ? '+' : '') +
                ']</b> </code>' + elt.innerHTML;
 
        if (cancelledSort) {
            realCancelSort();
        } else {
            // Next item in the queue.
            var delayed = function () {
                getLength(queueIdx + 1);
            };
            setTimeout(delayed, XHR_DELAY);
        }
    }

    function showLength() {
        getQueue = [];

        var elts = customGetElementsByClassName(document, 'input', 'o');
        for (var idx = 0; idx < elts.length; idx++) {
            var boxName = elts[idx].name;
            var boxId = boxName.substring(2);

            // Some BOBs include length but not all do.  Rather than risking
            // having to make another request, just use the details page which
            // always contains the length.
            // TODO: Once Netflix has updated all BOBs to include length,
            //       (only series discs don't have it yet) switch to BOBs
            //       as it is less bytes.

            // If a movie is both at home and in the queue, or a movie has been
            // watched but is still in the queue, there is both _0 and _1.
            // There's even been a _2.  Only the highest ending is in the
            // sortable table and the length is added to that element.
            var ii = 0;
            var href, titleId, titleElt;
            while (titleElt =
                    document.getElementById('b0' + boxId + '_' + ii)) {
                titleId = 'b0' + boxId + '_' + ii;
                href = titleElt.href;
                ii++;
            }

            // Save time in the sort cycle by storing the boxId right now,
            // and by storing the length in minutes in the queue records when
            // the length is retrieved.  Otherwise the sort cycle would need
            // to figure all of that out again.
            var record = {
                "boxId": boxId,       // needed for sort cycle
                "titleId": titleId,   // needed to add length in UI
                "url": href           // the URL that has the length info
                // (added later: length in minutes)
            };
            getQueue.push(record);
        }

        totalQueueCount = getQueue.length;
        if (0 !== totalQueueCount) {
            getLength(0);
        } else {
            sortByLength();
        }
    }

    function sortByTitle() {
        var articles;
        sortInfo = [];
        var pos = 1;

        var articlesKey = 'sortByTitle.articles';
        var ignoreArticlesKey = 'sortByTitle.ignoreArticles';
        var ignoreArticles = GM_getValue(ignoreArticlesKey);
        if (undefined === ignoreArticles) {
            // Use true as default as Netflix ignores articles too.
            ignoreArticles = true;

            // Store keys so that users can change it via about:config.
            GM_setValue(ignoreArticlesKey, ignoreArticles);
            // The articles are used "as-is", so there must be a space after
            // each one in most cases.  To avoid typos in the default, use [].
            articles = [
                "A ",
                "AN ",
                "THE ",
                "EL ",
                "LA ",
                "LE ",
                "LES ",
                "IL ",
                "L'"
            ];
            GM_setValue(articlesKey, articles.join(',').toUpperCase());
        }

        var elts = customGetElementsByClassName(document, 'input', 'o');
        for (var idx = 0; idx < elts.length; idx++) {
            var boxName = elts[idx].name;
            var boxId = boxName.substring(2);
            // If a movie is both at home and in the queue, or a movie has been
            // watched but is still in the queue, there is both _0 and _1.
            // Here we either one works.
            var titleId = 'b0' + boxId + '_0';
            var titleElt = document.getElementById(titleId);

            var title = titleElt.innerHTML.toUpperCase();
            if (ignoreArticles) {
                // Get the articles, but default to empty string.
                var articlesStr = GM_getValue(articlesKey, '') || '';
                articlesStr = articlesStr.toUpperCase();
                articles = articlesStr.split(',');
                for (var aa = 0; aa < articles.length; aa++) {
                    var article = articles[aa].toUpperCase();
                    if (0 === title.indexOf(article)) {
                        // Move article to the end of the string.
                        title = title.substring(article.length) +
                                ', ' + article;
                        break;
                    }
                }
            }

            var record = {
                "id": boxId,
                "title": title,
                "origPos": pos++
            };
            sortInfo.push(record);
        }

        var sortFn = function (a, b) {
            return a.title > b.title ? -1 : 1;
        };
        sortInfo.sort(sortFn);

        setOrder("origPos", elts);
    }

    function sortByPlayability(moveToTop) {
        sortInfo = [];

        // Don't take the whole document.body.innerHTML as text.
        // Luckily there's a div containing just the items we need.
        var text = document.getElementById('qbody').innerHTML;

        var pos = 1;

        // In JavaScript, "everything until and including a newline" is
        // represented as the expression "(?:.*?\n)*?".  So that matches
        // wherever you are in the string until the end-of-line, and any
        // lines underneath it.  To continue matching on another line,
        // skip into the line first using ".*?".
        var regex = /name="OR(\d+)"(?:.*?\n)*?.*?class="wn">(.*?)<\/td/g;
        while (regex.test(text)) {
            var id = RegExp.$1;
            var playable = RegExp.$2.length !== 0;
            var record = {
                "id": id,
                "play": playable,
                "origPos": pos++
            };
            sortInfo.push(record);
        }

        // TODO: fix position of series discs.

        var sortVal = moveToTop ? 1 : -1;
        var sortFn = function (a, b) {
            if (a.play && b.play) {
                return 1;   // Keeps playable items in current order.
            }
            if (a.play) {
                return sortVal;
            }
            if (b.play) {
                return -sortVal;
            }
            return 1;   // Keeps non-playable items in current order.
        };
        sortInfo.sort(sortFn);

        setOrder("origPos");
    }

    function moveInstantTop() {
        sortByPlayability(true);
    }

    function moveInstantBottom() {
        sortByPlayability(false);
    }

    function sortByGenre() {
        sortInfo = [];

        // Don't take the whole document.body.innerHTML as text.
        // Luckily there's a div containing just the items we need.
        var text = document.getElementById('qbody').innerHTML;

        var pos = 1;

        // In JavaScript, "everything until and including a newline" is
        // represented as the expression "(?:.*?\n)*?".  So that matches
        // wherever you are in the string until the end-of-line, and any
        // lines underneath it.  To continue matching on another line,
        // skip into the line first using ".*?".
        var regex = /name="OR(\d+)"(?:.*?\n)*?.*?class="genre".*?>(.*?)</g;
        while (regex.test(text)) {
            var id = RegExp.$1;
            var genre = RegExp.$2;
            var record = {
                "id": id,
                "genre": genre.toUpperCase(),
                "origPos": pos++
            };
            sortInfo.push(record);
        }

        // TODO: fix position of series discs.

        var sortFn = function (a, b) {
            return a.genre > b.genre ? -1 : 1;
        };
        sortInfo.sort(sortFn);

        setOrder("origPos");
    }

    function sortByAvailability() {
        sortInfo = [];

        // Don't take the whole document.body.innerHTML as text.
        // Luckily there's a div containing just the items we need.
        var text = document.getElementById('qbody').innerHTML;

        var pos = 1;

        // In JavaScript, "everything until and including a newline" is
        // represented as the expression "(?:.*?\n)*?".  So that matches
        // wherever you are in the string until the end-of-line, and any
        // lines underneath it.  To continue matching on another line,
        // skip into the line first using ".*?".
        var regex = /name="OR(\d+)"(?:.*?\n)*?.*?class="(av|km)[ "].*?>(.*?)<\/td/g;
        while (regex.test(text)) {
            var id = RegExp.$1;
            var avail = RegExp.$3;
            var record = {
                "id": id,
                "avail": avail.toUpperCase(),
                "origPos": pos++
            };
            sortInfo.push(record);
        }

        // TODO: fix position of series discs.

        var sortFn = function (a, b) {
            var dateA, dateB;

            // DVD Queue: "To be released" should always be on top.
            if (a.avail.indexOf('RELEASES') >= 0 &&
                    b.avail.indexOf('RELEASES') >= 0) {
                // Sort by date.

                /(\d+\/\d+\/\d+)</.test(a.avail);
                dateA = new Date(RegExp.$1);

                /(\d+\/\d+\/\d+)</.test(b.avail);
                dateB = new Date(RegExp.$1);

                return dateA.getTime() > dateB.getTime() ? -1 : 1;
            }
            if (a.avail.indexOf('RELEASES') >= 0) {
                return 1;
            }
            if (b.avail.indexOf('RELEASES') >= 0) {
                return -1;
            }

            // Instant Queue: "Available until" should always be on top.
            // 
            if (a.avail.indexOf('UNTIL') >= 0 &&
                    b.avail.indexOf('UNTIL') >= 0) {
                // Sort by date.

                /(\d+\/\d+\/\d+)/.test(a.avail);
                dateA = new Date(RegExp.$1);

                /(\d+\/\d+\/\d+)/.test(b.avail);
                dateB = new Date(RegExp.$1);

                return dateA.getTime() > dateB.getTime() ? -1 : 1;
            }
            if (a.avail.indexOf('UNTIL') >= 0) {
                return 1;
            }
            if (b.avail.indexOf('UNTIL') >= 0) {
                return -1;
            }

            // Order "wait" as: Very Long, Long, Short, Now, Unavailable.
            if (a.avail.indexOf('VERY') >= 0) {
                return 1;
            }
            if (b.avail.indexOf('VERY') >= 0) {
                return -1;
            }
            if (a.avail.indexOf('LONG') >= 0) {
                return 1;
            }
            if (b.avail.indexOf('LONG') >= 0) {
                return -1;
            }
            if (a.avail.indexOf('SHORT') >= 0) {
                return 1;
            }
            if (b.avail.indexOf('SHORT') >= 0) {
                return -1;
            }
            if (a.avail.indexOf('NOW') >= 0) {
                return 1;
            }
            if (b.avail.indexOf('NOW') >= 0) {
                return -1;
            }
            if (a.avail.indexOf('UNAVAILABLE') >= 0) {
                return 1;
            }
            if (b.avail.indexOf('UNAVAILABLE') >= 0) {
                return -1;
            }

            // All other cases.
            return 1;   // Keeps rest of items in current order.
        };
        sortInfo.sort(sortFn);

        setOrder("origPos");
    }

    function matchForNetflixRatingGranulizer(pos, seriesInfo, movieInfo) {
        var regex2 = /OR(\d+)(?:.*?\n)*?.*?class="tt".*?<a.*?>(.*?)<\/a>(?:.*?\n)*?.*?stars_.*?_(.*?).gif.*?>(.*?)</;
        if (regex2.test(movieInfo)) {
            var id = RegExp.$1;
            var title = RegExp.$2;
            var usrRating = RegExp.$3 / 10;   // The img tag has rating * 10.

            // The average rating is never there. Will handle this later.
            var avgRating = '';

            var record = {
                "id": id,
                "title": title,
                "usrRating": usrRating,
                "avgRating": avgRating,
                "origPos": pos++
            };
            sortInfo.push(record);

            // Check if series disc.
            regex2 = /series="(\d+)"/;
            if (regex2.test(seriesInfo)) {
                var linkId = RegExp.$1;

                // Don't add "link" key to record, as we're filtering 
                // on that later.

                seriesLookup[linkId] = record;
            }
            // Else it was a non-series movie.  No problem.

            return true;
        }
        return false;
    }

    function sortByRating(sortByAvgRating) {
        var id, linkId, pos, len, record, title;

        sortInfo = [];

        seriesLookup = {};

        // Don't take the whole document.body.innerHTML as text.
        // Luckily there's a div containing just the items we need.
        var text = document.getElementById('qbody').innerHTML;

        pos = 1;

        // In JavaScript, "everything until and including a newline" is
        // represented as the expression "(?:.*?\n)*?".  So that matches
        // wherever you are in the string until the end-of-line, and any
        // lines underneath it.  To continue matching on another line,
        // skip into the line first using ".*?".
        var regex = /<tr(.*?)>((?:.*?\n)*?.*?)<td class="gn">/g;
        while (regex.test(text)) {
            var seriesInfo = RegExp.$1;
            var movieInfo = RegExp.$2;

            // Check if non-series disc, or first-in-series disc.
            // Users that have the Netflix Rating Granulizer script installed
            // will have different markup, so need to check that first.
            if (matchForNetflixRatingGranulizer(pos, seriesInfo, movieInfo)) {
                // Yes, user also has the NRG script installed.
                pos++;
                continue;
            }
            // Now we know there's no altered markup, so deal with standard
            // Netflix markup.
            var regex2 = /OR(\d+)(?:.*?\n)*?.*?class="tt".*?<a.*?>(.*?)<\/a>(?:.*?\n)*?.*?sbmf-(.*?)".*?>(.*?)</;
            if (regex2.test(movieInfo)) {
                id = RegExp.$1;
                title = RegExp.$2;
                var usrRating = RegExp.$3 / 95 * 5;   // mask of 95px is 5 stars
                var avgRatingText = RegExp.$4;

                // Not all movies have avg rating (e.g. 70057842),
                // and user-rated movies don't have their avg rating listed.
                var avgRating = 0;
                regex2 = /Average rating:.*?([\d\.]+)/;
                if (regex2.test(avgRatingText)) {
                    avgRating = RegExp.$1;
                }
                // Else missing average rating. Will handle this later.

                record = {
                    "id": id,
                    "title": title,
                    "usrRating": usrRating,
                    "avgRating": avgRating,
                    "origPos": pos++
                };
                sortInfo.push(record);

                // Check if series disc.
                regex2 = /series="(\d+)"/;
                if (regex2.test(seriesInfo)) {
                    linkId = RegExp.$1;

                    // Don't add "link" key to record, as we're filtering 
                    // on that later.

                    seriesLookup[linkId] = record;
                }
                // Else it was a non-series movie.  No problem.
            } else {
                // Check if series disc.
                regex2 = /series="(\d+)"/;
                if (regex2.test(seriesInfo)) {
                    linkId = RegExp.$1;
                } else if (regex2.test(movieInfo)) {
                    // If one disc of a series is at home, and the other is 
                    // still in the queue, the one in the queue will not have
                    // a rating.
                    // If the series disc in the queue is the first movie in
                    // the queue, all info will be in the movieInfo, not the
                    // seriesInfo... this is that case.
                    linkId = RegExp.$1;
                } else {
                    // Unexpected result.
                    alert('Unexpected situation: no series ID found.\n' +
                            'Please let the script owner know.\n\n' +
                            'Position:' + pos + '\n\n' +
                            'Series info:\n' + seriesInfo +
                            '\n\nMovie info:\n' + movieInfo);
                    done(false);
                    return;
                }

                regex2 = /OR(\d+)(?:.*?\n)*?.*?class="tt".*?<a.*?>(.*?)<\/a>/;
                if (regex2.test(movieInfo)) {
                    id = RegExp.$1;
                    title = RegExp.$2;

                    record = {
                        "id": id,
                        "title": title,
                        "link": linkId,
                        "origPos": pos++
                    };
                    sortInfo.push(record);
                } else {
                    // Unexpected result.
                    alert('Unexpected situation: no movie ID found.\n' +
                            'Please let the script owner know.\n\n' + 
                            'Position:' + pos + '\n\n' +
                            'Series info:\n' + seriesInfo +
                            '\n\nMovie info:\n' + movieInfo);
                    done(false);
                    return;
                }
            }
        }

        getQueue = [];
        var algorithm = sortByAvgRating ? "avgRating" : "usrRating";

        // Make sure all movies have the rating that is being sorted on.
        for (pos = 0, len = sortInfo.length; pos < len; pos++) {
            // Only do this for non-links.
            if (!sortInfo[pos].link) {
                if (!sortInfo[pos][algorithm]) {
                    getQueue.push(sortInfo[pos]);
                }
            }
        }
        totalQueueCount = getQueue.length;
        if (0 !== totalQueueCount) {
            fixRatings(false, algorithm);
        } else {
            checkSeriesLinks(algorithm);
        }
    }

    function reorderQueue(evt) {
        // Prevent the user from pressing the buttons again.
        setSortButtonState(false);

        // Reset sort options.
        cancelledSort = false;

        // Let GUI redraw buttons.
        var delayed = function () {
            switch (evt.target.value) {
            case 'reverse':
                reverse();
                break;
            case 'shuffle':
                shuffle();
                break;
            case 'length':
                showLength();
                break;
            case 'title':
                sortByTitle();
                break;
            case 'instantTop':
                moveInstantTop();
                break;
            case 'instantBottom':
                moveInstantBottom();
                break;
            case 'usrRating':
                sortByRating(false);
                break;
            case 'avgRating':
                sortByRating(true);
                break;
            case 'genre':
                sortByGenre();
                break;
            case 'availability':
                sortByAvailability();
                break;
            }
        };
        setTimeout(delayed, 0);
    }

    function fixRatings(fixLinks, algorithm) {
        var record = getQueue.pop();
        if (!record) {
            // Unexpected result.
            alert('Unexpected situation: no record found in queue.\n' +
                    'Please let the script owner know.\n\n' +
                    'FixLinks: ' + fixLinks + '\nAlgorithm: ' + algorithm);
            done(false);
            return;
        }

        // Update progress.
        var txt = fixLinks ? 'series' : 'movie';
        if (0 !== getQueue.length) {
            var pct = ((1 - getQueue.length / totalQueueCount) * 100).toFixed(0);
            setProgressStatus('st', 'Getting ' + txt + ' info: ' + pct + '%');
        } else {
            setProgressStatus('st', 'Getting ' + txt + ' info: 100%', false);
        }

        var id = fixLinks ? record.link : record.id;
        var url = "http://www.netflix.com/JSON/BobMovieHtml?movieid=" + id;
        GM_xmlhttpRequest({
            'method': 'GET',
            'url': url,
            'onload': function (xhr) {
                parseFixRatings(fixLinks, algorithm, record, xhr.responseText);
            }
        });
    }

    function parseFixRatings(fixLinks, algorithm, record, text) {
        // Use value > 5 to make them appear on top if rating cannot be
        // retrieved.
        var usrRating = 100;
        var avgRating = 100;

        // JSON is returned, so escape quotes.
        var regex = /starbar-.*?<span class=\\"rating\\">(.*?)<.*?starbar-avg.*?<span class=\\"rating\\">(.*?)</;
        if (regex.test(text)) {
            usrRating = RegExp.$1;
            avgRating = RegExp.$2;
        } 
        // Else no match... use high default values.

        record.usrRating = usrRating;
        record.avgRating = avgRating;
        if (fixLinks) {
            var linkId = record.link;
            record = {
                "usrRating": usrRating,
                "avgRating": avgRating
            };
            seriesLookup[linkId] = record;
        }

        if (cancelledSort) {
            realCancelSort();
        } else {
            var delayed;
            if (0 === getQueue.length) {
                // Processed all items in getQueue; on to next step.
                if (fixLinks) {
                    doActualSort(algorithm);
                } else {
                    delayed = function () {
                        checkSeriesLinks(algorithm);
                    };
                    setTimeout(delayed, XHR_DELAY);
                }
            } else {
                delayed = function () {
                    fixRatings(fixLinks, algorithm);
                };
                setTimeout(delayed, XHR_DELAY);
            }
        }
    }

    function checkSeriesLinks(algorithm) {
        getQueue = [];

        // Try to fix series links.
        for (var pos = 0, len = sortInfo.length; pos < len; pos++) {
            var linkId = sortInfo[pos].link;
            if (linkId) {
                var record = seriesLookup[linkId];
                if (record) {
                    sortInfo[pos].usrRating = record.usrRating;
                    sortInfo[pos].avgRating = record.avgRating;
                } else {
                    getQueue.push(sortInfo[pos]);
                }
            }
        }
        totalQueueCount = getQueue.length;
        if (0 !== getQueue.length) {
            fixRatings(true, algorithm);
        } else {
            doActualSort(algorithm);
        }
    }

    return {
        //
        // Public functions
        // (These access private variables and functions through "closure".)
        //

        // Initialize this script.
        init: function () {
            // Build the GUI for this script.
            buildGui();

            // Now wait for the user to press a button.
        }
    };
}());
// End singleton pattern.

// Run this script.
NetflixQueueSorter.init();

///////////////////////////////////////////////////////////////////////////////

