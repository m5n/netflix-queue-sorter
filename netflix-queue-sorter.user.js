///////////////////////////////////////////////////////////////////////////////
//
// This is a Greasemonkey user script.
//
// Netflix Queue Sorter
// Version 1.9, 2009-03-16
// Coded by Maarten van Egmond.  See namespace URL below for contact info.
// Released under the GPL license: http://www.gnu.org/copyleft/gpl.html
//
// ==UserScript==
// @name        Netflix Queue Sorter
// @namespace   http://userscripts.org/users/64961
// @author      Maarten
// @version     1.9
// @description v1.9: Sort your Netflix queue by movie title, length, genre, average rating, star/suggested/user rating, availability, or playability.  Includes options to shuffle/randomize or reverse your queue.
// @include     http://www.netflix.com/Queue*
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
/*global alert, clearTimeout, document, GM_registerMenuCommand, GM_xmlhttpRequest, setTimeout */

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
    var XHR_DELAY = 500;

    //
    // Private functions
    //

    function createSortButton(value, label, onClickFn) {
        var button = document.createElement('button');
        button.setAttribute('type', 'button');
        button.setAttribute('value', value);
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
                var span = document.createElement('span');
                span.setAttribute('id', 'gm_progress_' + header.className);
                span.setAttribute('style', 'padding: 0 0 2px 2px');
                div.appendChild(span);
            } else {
                var buttonInfo = createSortButton(
                        options[idx].sort, options[idx].label, reorderQueue);
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
                'label': 'Shuffle'
            },
            {
                'sort': 'reverse',
                'label': 'Reverse'
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
                'label': 'Sort by Title'
            },
            {
                'sort': 'length',
                'label': 'Sort by Length / Display Length'
            }
        ]);
    }

    function addInstantSortOption(header) {
        addOptions(header, [
            {
                'sort': 'playable',
                'label': 'Sort'
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
                'label': 'Sort by Star Rating'
            },
            {
                'sort': 'avgRating',
                'label': 'Sort by Avg Rating'
            }
        ]);
    }

    function addGenreSortOption(header) {
        addOptions(header, [
            {
                'sort': 'genre',
                'label': 'Sort by Genre'
            }
        ]);
    }

    function addAvailabilitySortOption(header) {
        addOptions(header, [
            {
                'sort': 'availability',
                'label': 'Sort by Availability'
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

    function setProgressStatus(id, msg) {
        var elt = document.getElementById('gm_progress_' + id);
        if (elt) {
            elt.innerHTML = msg;
        }
    }

    function setButtonState(button, enabled) {
        if (enabled) {
            button.removeAttribute('disabled');
        } else {
            button.setAttribute('disabled', true);
        }
    }

    function done(enableUpdateQueueButton, firstBox) {
        // Re-enable the sort buttons.
        for (var idx = 0, len = sortButtons.length; idx < len; idx++) {
            setButtonState(sortButtons[idx].button, true);
        }

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
        elts = elts || document.getElementsByClassName('o');

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
        setProgressStatus('tt', '');
        setProgressStatus('st', '');

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
        var elts = document.getElementsByClassName('o');

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
        var elts = document.getElementsByClassName('o');

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
            var pct = 100;
            if (queueIdx < totalQueueCount - 1) {
                pct = ((queueIdx / totalQueueCount) * 100).toFixed(0);
            }
            setProgressStatus('tt', 'Getting length info: ' + pct + '%');

            var url = record.url;
            GM_xmlhttpRequest({
                'method': 'GET',
                'url': url,
                'onload': function (xhr) {
                    parseGetLength(queueIdx, xhr.responseText);
                }
            });
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
        var regex = /id="movielength"(?:.*?\n)*?.*?(\d+?) minutes</;
        if (regex.test(text)) {
            len = RegExp.$1 * 1;   // Convert to number.
        } else {   // Could be a series... take the first episode.
            regex = /Length:<.*?(\d+?) minutes</;
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
 
        // Next item in the queue.
        var delayed = function () {
            getLength(queueIdx + 1);
        };
        setTimeout(delayed, XHR_DELAY);
    }

    function showLength() {
        getQueue = [];

        var elts = document.getElementsByClassName('o');
        for (var idx = 0; idx < elts.length; idx++) {
            var boxName = elts[idx].name;
            var boxId = boxName.substring(2);

            // Some BOBs include length but not all do.  Rather than risking
            // having to make another request, just use the details page which
            // always contains the length.
            // TODO: Once Netflix has updated all BOBs to include length,
            //       switch to BOBs as it is less bytes.

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
            articles = ["A ", "AN ", "THE ", "EL ", "LA ", "LE ", "IL ", "L'"];
            GM_setValue(articlesKey, articles.join(',').toUpperCase());
        }

        var elts = document.getElementsByClassName('o');
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
                var articlesStr = GM_getValue(articlesKey, '').toUpperCase();
                articles = articlesStr.split(',');
                for (var aa = 0; aa < articles.length; aa++) {
                    article = articles[aa].toUpperCase();
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

    function sortByPlayability() {
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

        var sortFn = function (a, b) {
            if (a.play) {
                return 1;
            }
            if (b.play) {
                return -1;
            }
            return 1;   // Keeps non-playable items in current order.
        };
        sortInfo.sort(sortFn);

        setOrder("origPos");
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
        var regex = /name="OR(\d+)"(?:.*?\n)*?.*?class="gn">.*?>(.*?)</g;
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
        var regex = /name="OR(\d+)"(?:.*?\n)*?.*?class="av">(.*?)<\/td/g;
        while (regex.test(text)) {
            var id = RegExp.$1;
            var avail = RegExp.$2;
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

                / (.*?)</.test(a.avail);
                dateA = new Date(RegExp.$1);

                / (.*?)</.test(b.avail);
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

                />.*?>(.*?)</.test(a.avail);
                dateA = new Date(RegExp.$1);

                />.*?>(.*?)</.test(b.avail);
                dateB = new Date(RegExp.$1);

                return dateA.getTime() > dateB.getTime() ? -1 : 1;
            }
            if (a.avail.indexOf('UNTIL') >= 0) {
                return 1;
            }
            if (b.avail.indexOf('UNTIL') >= 0) {
                return -1;
            }

            // Order "wait" as follows: Very Long, Long, Short.
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
            var regex2 = /OR(\d+)(?:.*?\n)*?.*?class="tt".*?<a.*?>(.*?)<\/a>(?:.*?\n)*?.*?width:(.*?)px.*?>(.*?)</;
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
        for (var idx = 0, len = sortButtons.length; idx < len; idx++) {
            setButtonState(sortButtons[idx].button, false);
        }

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
            case 'playable':
                sortByPlayability();
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
            setProgressStatus('st', 'Getting ' + txt + ' info: 100%');
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
        var regex = /rating-.*?<span class=\\"value\\">(.*?)<.*?rating-avg.*?<span class=\\"value\\">(.*?)</;
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
})();
// End singleton pattern.

// Run this script.
NetflixQueueSorter.init();

///////////////////////////////////////////////////////////////////////////////

