///////////////////////////////////////////////////////////////////////////////
//
// This is a Greasemonkey user script.
//
// Netflix Queue Sorter
// Version 1.0, 2008-10-17
// Coded by Maarten van Egmond.  See namespace URL below for contact info.
// Released under the GPL license: http://www.gnu.org/copyleft/gpl.html
//
// ==UserScript==
// @name        Netflix Queue Sorter
// @namespace   http://tenhanna.com/greasemonkey
// @author      Maarten
// @version     1.0
// @description v1.0: Sort your queue by suggested or average rating.  Review the new ordering.  Undo the sort or make it permanent.
// @include     http://www.netflix.com/Queue*
// ==/UserScript==
//
///////////////////////////////////////////////////////////////////////////////
//
// For install, uninstall, and known issues, see the namespace link above.
//
///////////////////////////////////////////////////////////////////////////////
//
// This script allows you to sort your DVD or Instant Queue by suggested rating
// or average rating.  It just updates the list order input boxes and stops
// there.
// This allows you, the user, to review the changes before updating your queue.
// Once you press the Update Queue button, there's no undo.
//
///////////////////////////////////////////////////////////////////////////////

// Singleton pattern.
var NetflixQueueSorter = (function() {
    //
    // Private variables
    //
    var _sortButtons = [];
    var _sortInfo = [];
    var _sorted = false;
    var _getQueue = [];
    var _seriesLookup = {};
    var XHR_DELAY = 500;

    //
    // Private functions
    //

    // This function builds the GUI and adds it to the page body.
    function _buildGui() {
        var elts = document.getElementsByClassName('queueBtnWrapper');
        for (var idx in elts) {
            // Only for the first two instances. Skip the Saved Queue.
            if (idx < 2) {
                // Sort by suggested rating.
                var buttonInfo = _createSortButton(
                       'usrRating', "Sort by Suggested Rating", _reorderQueue);
                _sortButtons.push(buttonInfo);
                elts[idx].appendChild(buttonInfo.button);

                // Sort by average rating.
                buttonInfo = _createSortButton(
                       'avgRating', "Sort by Average Rating", _reorderQueue);
                _sortButtons.push(buttonInfo);
                elts[idx].appendChild(buttonInfo.button);

                // Undo.
                buttonInfo = _createSortButton(
                       'undo', "Undo Sort", _reorderQueue);
                _sortButtons.push(buttonInfo);
                elts[idx].appendChild(buttonInfo.button);
                // Undo button is disabled by default.
                _setButtonState(buttonInfo.button, false);
            }
        }
    }

    function _createSortButton(value, label, onClickFn) {
        var button = document.createElement('button');
        button.setAttribute('type', 'button');
        button.setAttribute('value', value);
        button.setAttribute('style',
                'margin-left: 0.75em; position: relative; top: -6px');
        var buttonText = document.createTextNode(label);
        button.appendChild(buttonText);
        button.addEventListener('click', onClickFn, true);
        return {
            'button': button,
            'text': buttonText
        };
    }

    function _reorderQueue(evt) {
        // Prevent the user from pressing the buttons again.
        for (var idx = 0, len = _sortButtons.length; idx < len; idx++) {
            _setButtonState(_sortButtons[idx].button, false);
        }
        // Disable Update Queue button (well, we're really faking it).
        for (var idx = 1; idx <= 2; idx++) {
            var elt = document.getElementById('updateQueue' + idx);
            elt.src = "http://cdn-0.nflximg.com/us/buttons/queueUpdate/instant_queue_inactive.gif";
            _setButtonState(elt, false);
        }

        // Let GUI redraw buttons.
        var delayed = function() {
            if (_sorted) {
                _undoSort();
            } else {
                var sortByAvgRating = evt.target.value == "avgRating";
                _sortBy(sortByAvgRating);
            }
            _sorted = !_sorted;

            // Enable the buttons again.
            for (var idx = 0, len = _sortButtons.length; idx < len; idx++) {
                var enabled = false;
                if (_sorted) {
                    // Only undo buttons should be enabled.
                    enabled = _sortButtons[idx].button.value == "undo";
                } else {
                    // Only sort buttons should be enabled.
                    enabled = _sortButtons[idx].button.value != "undo";
                }
                _setButtonState(_sortButtons[idx].button, enabled);
            }
        }
        setTimeout(delayed, 0);
    }

    function _setButtonState(button, enabled) {
        if (enabled) {
            button.removeAttribute('disabled');
        } else {
            button.setAttribute('disabled', true);
        }
    }

    function _sortBy(sortByAvgRating) {
        _sortInfo = [];

        _seriesLookup = {};

        // Don't take the whole document.body.innerHTML as text.
        // Luckily there's a div containing just the items we need.
        var text = document.getElementById('dvd-queue').innerHTML;

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

                var ratingType = '';
                var avgRating = 0;

                // Not all movies have avg rating (e.g. 70057842)...
                regex2 = /([eg]):.*?([\d\.]+)/;
                if (regex2.test(avgRatingText)) {
                    ratingType = RegExp.$1;
                    avgRating = RegExp.$2;
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
                // Check if series disc.
                regex2 = /series="(\d+)"/;
                if (regex2.test(seriesInfo)) {
                    var linkId = RegExp.$1;

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
                                'Series info:\n' + seriesInfo +
                                '\nMovie info:\n' + movieInfo);
                    }
                } else {
                    // Unexpected result.
                    alert('Unexpected situation: no series ID found.\n' +
                            'Please let the script owner know.\n\n' +
                            'Series info:\n' + seriesInfo +
                            '\nMovie info:\n' + movieInfo);
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

        if (fixLinks) {
            var linkId = record.link;
            record = {};
            record["usrRating"] = usrRating;
            record["avgRating"] = avgRating;
            _seriesLookup.push(record);
        } else {
            record["usrRating"] = usrRating;
            record["avgRating"] = avgRating;
        }

        if (0 == _getQueue.length) {
            // Processed all items in getQueue; on to next step.
            if (fixLinks) {
                _doActualSort();
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
        _quicksort(_sortInfo, 0, _sortInfo.length, algorithm);

        for (var pos = 0, len = _sortInfo.length; pos < len; pos++) {
            _sortInfo[pos]["sortPos"] = _sortInfo.length - pos;
        }

        _setOrder("origPos");

        // Inform the user that sort has finished and what the next steps are.
        // Let GUI redraw first.
        var delayed = function() {
            alert("Sort completed.\n\nPlease review the new list order by inspecting the numbers in the input fields at the beginning of each row.\nMovies with a high rating should have a lower number than movies with a low rating.\n\nTo permanently save the new list order, press the Update Queue button.  This cannot be undone.\nTo discard the new numbers in the input fields, reload the page, or press the Undo Sort button.");
        }
        setTimeout(delayed, 0);
    }

    function _undoSort() {
        _setOrder("sortPos");
    }

    function _setOrder(sortValue) {
        var elts = document.getElementsByClassName('o');
        // Note: this will return one more disabled item at the end,
        //       but as it's at the end, it does not cause any problem.

        for (var pos = 0, len = _sortInfo.length; pos < len; pos++) {
            // Note: sortValue is 1-based, elts index is 0-based, so sub 1
            var elt = elts[_sortInfo[pos][sortValue] - 1];

            // Set new value.
            elt.value = _sortInfo.length - pos;

            // If value was different than before, mark row as changed.
            elt.focus();
            elt.blur();   // Don't keep focus.
        }

        // Move the page back to the top.
        var elt = document.getElementById('MainQueueForm');
        scroll(elt.offsetLeft, elt.offsetTop - 10);
    }

    ///////////////////////////////////////////////////////////////////////////
    // START - QuickSort
    ///////////////////////////////////////////////////////////////////////////
    // 
    // QuickSort algorithm adapted from
    // http://en.literateprograms.org/Quicksort_(JavaScript)
    // 
    ///////////////////////////////////////////////////////////////////////////
    function _quicksort(array, begin, end, sortValue) {
        if (end - 1 > begin) {
            var pivot = begin + Math.floor(Math.random() * (end - begin));

            pivot = _partition(array, begin, end, pivot, sortValue);

            _quicksort(array, begin, pivot, sortValue);
            _quicksort(array, pivot + 1, end, sortValue);
        }
    }
    function _partition(array, begin, end, pivot, sortValue) {
        var piv = array[pivot][sortValue];
        _swap(array, pivot, end - 1);
        var store = begin;
        var ix;
        for (ix = begin; ix < end - 1; ++ix) {
            if (array[ix][sortValue] <= piv) {
                _swap(array, store, ix);
                ++store;
            }
        }
        _swap(array, end - 1, store);

        return store;
    }
    function _swap(array, a, b) {
        var tmp = array[a];
        array[a] = array[b];
        array[b] = tmp;
    }
    ///////////////////////////////////////////////////////////////////////////
    // END - QuickSort
    ///////////////////////////////////////////////////////////////////////////

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

