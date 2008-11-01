///////////////////////////////////////////////////////////////////////////////
//
// This is a Greasemonkey user script.
//
// Netflix Queue Sorter
// Version 1.1, 2008-11-01
// Coded by Maarten van Egmond.  See namespace URL below for contact info.
// Released under the GPL license: http://www.gnu.org/copyleft/gpl.html
//
// ==UserScript==
// @name        Netflix Queue Sorter
// @namespace   http://tenhanna.com/greasemonkey
// @author      Maarten
// @version     1.1
// @description v1.1: Randomize or sort your queue by movie title, genre, star rating or average rating.
// @include     http://www.netflix.com/Queue*
// ==/UserScript==
//
///////////////////////////////////////////////////////////////////////////////
//
// For install, uninstall, and known issues, see the namespace link above.
//
///////////////////////////////////////////////////////////////////////////////
//
// This script allows you to randomize or sort your DVD or Instant Queue by
// movie title, genre, star rating (that is: suggested rating or user rating)
// or average rating.
//
///////////////////////////////////////////////////////////////////////////////

// Singleton pattern.
var NetflixQueueSorter = (function() {
    //
    // Private variables
    //
    var _sortButtons = [];
    var _sortInfo = [];
    var _getQueue = [];
    var _seriesLookup = {};
    var XHR_DELAY = 500;

    //
    // Private functions
    //

    // This function builds the GUI and adds it to the page body.
    function _buildGui() {
        var elt = document.getElementById('inqueue-header-row');
        var children = elt.childNodes;
        for (var ii = 0; ii < children.length; ii++) {
            if (children[ii].tagName == "TH") {
                if (children[ii].className == "prmt") {
                    _addRandomizeOption(children[ii]);
                } else if (children[ii].className == "tt") {
                    _addTitleSortOption(children[ii]);
                } else if (children[ii].className == "st") {
                    _addStarSortOption(children[ii]);
                } else if (children[ii].className == "gn") {
                    _addGenreSortOption(children[ii]);
                }
            }
        }
    }

    function _addRandomizeOption(header) {
        _addOptions(header, [
            {
                'sort': 'randomize',
                'label': 'Randomize'
            }
        ]);
    }

    function _addTitleSortOption(header) {
        _addOptions(header, [
            {
                'sort': 'title',
                'label': 'Sort by Title'
            }
        ]);
    }

    function _addStarSortOption(header) {
        _addOptions(header, [
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

    function _addGenreSortOption(header) {
        _addOptions(header, [
            {
                'sort': 'genre',
                'label': 'Sort by Genre'
            }
        ]);
    }

    function _addOptions(header, options) {
        var div = document.createElement('div');

        for (var idx in options) {
            var buttonInfo = _createSortButton(
                    options[idx].sort, options[idx].label, _reorderQueue);
            _sortButtons.push(buttonInfo);
            div.appendChild(buttonInfo.button);
            div.appendChild(document.createElement('br'));
        }
        div.appendChild(document.createElement('br'));

        var headerText = header.childNodes[0];
        header.replaceChild(div, headerText);
        header.appendChild(headerText);
    }

    function _createSortButton(value, label, onClickFn) {
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

    function _setButtonState(button, enabled) {
        if (enabled) {
            button.removeAttribute('disabled');
        } else {
            button.setAttribute('disabled', true);
        }
    }

    function _reorderQueue(evt) {
        // Prevent the user from pressing the buttons again.
        for (var idx = 0, len = _sortButtons.length; idx < len; idx++) {
            _setButtonState(_sortButtons[idx].button, false);
        }

        // Let GUI redraw buttons.
        var delayed = function() {
            switch(evt.target.value) {
                case 'randomize':
                    _randomize();
                    break;
                case 'title':
                    _sortByTitle();
                    break;
                case 'usrRating':
                    _sortByRating(false);
                    break;
                case 'avgRating':
                    _sortByRating(true);
                    break;
                case 'genre':
                    _sortByGenre();
                    break;
            }
        }
        setTimeout(delayed, 0);
    }

    function _randomize() {
        var elts = document.getElementsByClassName('o');

        // Generate a list of random positions.
        var avail = [];
        for (var idx = 0; idx < elts.length; idx++) {
            avail.push(idx);
        }

        for (var idx = 0; idx < elts.length; idx++) {
            // Generate number between 0 and avail.length - 1.
            // Math.random() generates a number between 0 (incl) and 1 (excl).
            var availIdx = Math.floor(Math.random() * avail.length);
            elts[idx].value = avail[availIdx];
            
            // Remove used position from availability array.
            avail.splice(availIdx, 1);
        }

        _done(true, elts[0]);

        // Inform the user that sort has finished and what the next steps are.
        var elt = document.getElementById('updateQueue1');
        alert("Randomize completed.  Now press the " + elt.alt
                + " button to save it.");
    }

    function _sortByTitle() {
        _sortInfo = [];
        var pos = 1;

        var elts = document.getElementsByClassName('o');
        for (var idx = 0; idx < elts.length; idx++) {
            var boxName = elts[idx].name;
            var boxId = boxName.substring(2);
            var titleId = 'b0' + boxId + '_0';
            var titleElt = document.getElementById(titleId);

            var record = {
                    "id": boxId,
                    "title": titleElt.innerHTML.toUpperCase(),
                    "origPos": pos++
            };
            _sortInfo.push(record);
        }

        var sortFn = function(a, b) {
            return a.title > b.title ? -1 : 1;
        }
        _sortInfo.sort(sortFn);

        _setOrder("origPos", elts);
    }

    function _sortByGenre() {
        _sortInfo = [];

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
            _sortInfo.push(record);
        }

        // TODO: fix position of series discs.

        var sortFn = function(a, b) {
            return a.genre > b.genre ? -1 : 1;
        }
        _sortInfo.sort(sortFn);

        _setOrder("origPos");
    }

    function _sortByRating(sortByAvgRating) {
        _sortInfo = [];

        _seriesLookup = {};

        // Don't take the whole document.body.innerHTML as text.
        // Luckily there's a div containing just the items we need.
        var text = document.getElementById('qbody').innerHTML;

        var pos = 1;

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
            var regex2 = /OR(\d+)(?:.*?\n)*?.*?width:(.*?)px.*?>(.*?)</;
            if (regex2.test(movieInfo)) {
                var id = RegExp.$1;
                var usrRating = RegExp.$2 / 95 * 5;   // mask of 95px is 5 stars
                var avgRatingText = RegExp.$3;

                // Not all movies have avg rating (e.g. 70057842),
                // and user-rated movies don't have their avg rating listed.
                var avgRating = 0;
                regex2 = /Average rating:.*?([\d\.]+)/;
                if (regex2.test(avgRatingText)) {
                    avgRating = RegExp.$1;
                }
                // Else missing average rating. Will handle this later.

                var record = {
                    "id": id,
                    "usrRating": usrRating,
                    "avgRating": avgRating,
                    "origPos": pos++
                };
                _sortInfo.push(record);

                // Check if series disc.
                regex2 = /series="(\d+)"/;
                if (regex2.test(seriesInfo)) {
                    var linkId = RegExp.$1;

                    // Don't add "link" key to record, as we're filtering 
                    // on that later.

                    _seriesLookup[linkId] = record;
                }
                // Else it was a non-series movie.  No problem.
            } else {
                var linkId;

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
                    _done(false);
                    return;
                }

                regex2 = /OR(\d+)/;
                if (regex2.test(movieInfo)) {
                    var id = RegExp.$1;

                    var record = {
                        "id": id,
                        "link": linkId,
                        "origPos": pos++
                    };
                    _sortInfo.push(record);
                } else {
                    // Unexpected result.
                    alert('Unexpected situation: no movie ID found.\n' +
                            'Please let the script owner know.\n\n' + 
                            'Position:' + pos + '\n\n' +
                            'Series info:\n' + seriesInfo +
                            '\n\nMovie info:\n' + movieInfo);
                    _done(false);
                    return;
                }
            }
        }

        _getQueue = [];
        var algorithm = sortByAvgRating ? "avgRating" : "usrRating";

        // Make sure all movies have the rating that is being sorted on.
        for (var pos = 0, len = _sortInfo.length; pos < len; pos++) {
            // Only do this for non-links.
            if (!_sortInfo[pos].link) {
                if (!_sortInfo[pos][algorithm]) {
                    _getQueue.push(_sortInfo[pos]);
                }
            }
        }
        if (0 != _getQueue.length) {
            _fixRatings(false, algorithm);
        } else {
            _checkSeriesLinks(algorithm);
        }
    }

    function _fixRatings(fixLinks, algorithm) {
        var record = _getQueue.pop();
        if (!record) {
            // Unexpected result.
            alert('Unexpected situation: no record found in queue.\n' +
                    'Please let the script owner know.\n\n' +
                    'FixLinks: ' + fixLinks + '\nAlgorithm: ' + algorithm);
            _done(false);
            return;
        }

        var id = fixLinks ? record.link : record.id;
        var url = "http://www.netflix.com/JSON/BobMovieHtml?movieid=" + id;
        GM_xmlhttpRequest({
            'method': 'GET',
            'url': url,
            'onload': function(xhr) {
                _parseFixRatings(fixLinks, algorithm, record, xhr.responseText);
            }
        });
    }

    function _parseFixRatings(fixLinks, algorithm, record, text) {
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

        record["usrRating"] = usrRating;
        record["avgRating"] = avgRating;
        if (fixLinks) {
            var linkId = record.link;
            record = {
                "usrRating": usrRating,
                "avgRating": avgRating
            };
            _seriesLookup[linkId] = record;
        }

        if (0 == _getQueue.length) {
            // Processed all items in getQueue; on to next step.
            if (fixLinks) {
                _doActualSort(algorithm);
            } else {
                var delayed = function() { _checkSeriesLinks(algorithm); };
                setTimeout(delayed, XHR_DELAY);
            }
        } else {
            var delayed = function() { _fixRatings(fixLinks, algorithm); };
            setTimeout(delayed, XHR_DELAY);
        }
    }

    function _checkSeriesLinks(algorithm) {
        _getQueue = [];

        // Try to fix series links.
        for (var pos = 0, len = _sortInfo.length; pos < len; pos++) {
            var linkId = _sortInfo[pos].link;
            if (linkId) {
                var record = _seriesLookup[linkId];
                if (record) {
                    _sortInfo[pos]["usrRating"] = record["usrRating"];
                    _sortInfo[pos]["avgRating"] = record["avgRating"];
                } else {
                    _getQueue.push(_sortInfo[pos]);
                }
            }
        }
        if (0 != _getQueue.length) {
            _fixRatings(true, algorithm);
        } else {
            _doActualSort(algorithm);
        }
    }

    function _doActualSort(algorithm) {
        var sortFn = function(a, b) {
            return a[algorithm] > b[algorithm] ? 1 : -1;
        }
        _sortInfo.sort(sortFn);

        _setOrder("origPos");
    }

    function _setOrder(sortValue, elts) {
        var elts = elts || document.getElementsByClassName('o');

        var firstBox, len;
        for (var pos = 0, len = _sortInfo.length; pos < len; pos++) {
            // Note: sortValue is 1-based, elts index is 0-based, so sub 1
            var elt = elts[_sortInfo[pos][sortValue] - 1];

            // Set new value.
            elt.value = _sortInfo.length - pos;

            if (_sortInfo[pos].origPos == 1) {
                firstBox = elt;
            }
        }

        _done(true, firstBox);

        // Inform the user that sort has finished and what the next steps are.
        var elt = document.getElementById('updateQueue1');
        alert("Sort completed.  Now press the " + elt.alt
                + " button to save it.");
     }

     function _done(enableUpdateQueueButton, firstBox) {
        // Re-enable the sort buttons.
        for (var idx = 0, len = _sortButtons.length; idx < len; idx++) {
            _setButtonState(_sortButtons[idx].button, true);
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

    // Return publicly accessible variables and functions.
    return {
        //
        // Public functions
        // (These access private variables and functions through "closure".)
        //

        // Initialize this script.
        init: function() {
            // Build the GUI for this script.
            _buildGui();

            // Now wait for user to press the button.
        }
    };
})();
// End singleton pattern.

// Run this script.
NetflixQueueSorter.init();

///////////////////////////////////////////////////////////////////////////////

