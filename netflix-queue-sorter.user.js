///////////////////////////////////////////////////////////////////////////////
//
// This is a Greasemonkey user script.
//
// Netflix Queue Sorter
// Version 0.2, 2008-10-11
// Coded by Maarten van Egmond.  See namespace URL below for contact info.
// Released under the GPL license: http://www.gnu.org/copyleft/gpl.html
//
// ==UserScript==
// @name        Netflix Queue Sorter
// @namespace   http://tenhanna.com/greasemonkey
// @author      Maarten
// @version     0.2
// @description v0.2: Sort your queue by user or average rating.  Review the new ordering.  Save it.
// @include     http://www.netflix.com/Queue*
// ==/UserScript==
//
///////////////////////////////////////////////////////////////////////////////
//
// For install, uninstall, and known issues, see the namespace link above.
//
///////////////////////////////////////////////////////////////////////////////
//
// This script allows you to sort your DVD or Instant Queue by user rating or 
// average rating.  It just updates the list order input boxes and stops there.
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

    //
    // Private functions
    //

    // This function builds the GUI and adds it to the page body.
    function _buildGui() {
        var elts = document.getElementsByClassName('queueBtnWrapper');
        for (var idx in elts) {
            // Only for the first two instances. Skip the Saved Queue.
            if (idx < 2) {
                // Sort by user rating.
                var buttonInfo = _createSortButton(
                       'usrRating', "Sort by User Rating", _reorderQueue);
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
        for (var idx = 0; idx < _sortButtons.length; idx++) {
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
            for (var idx = 0; idx < _sortButtons.length; idx++) {
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

        // Don't take the whole document.body.innerHTML as text.
        // Luckily there's a div containing just the items we need.
        var text = document.getElementById('dvd-queue').innerHTML;

        var pos = 1;

        // In JavaScript, "everything until and including a newline" is
        // represented as the expression "(?:.*?\n)*?".  So that matches
        // wherever you are in the string until the end-of-line, and any
        // lines underneath it.  To continue matching on another line,
        // skip into the line first using ".*?".
        var regex = /OR(\d+)(?:.*?\n)*?.*?width:(.*?)px.*?([eg]):\s(.*?)</g;
        while (regex.test(text)) {
            var id = RegExp.$1;
            var usrRating = RegExp.$2 / 95 * 5;   // mask of 95px is 5 stars
            var ratingType = RegExp.$3;
            var avgRating = RegExp.$4;
            _sortInfo.push({
                "id": id,
                "usrRating": usrRating,
                "avgRating": avgRating,
                "origPos": pos++
            });
        }

        var algorithm = sortByAvgRating ? "avgRating" : "usrRating";
        _quicksort(_sortInfo, 0, _sortInfo.length, algorithm);

        for (pos = 0; pos < _sortInfo.length; pos++) {
            _sortInfo[pos]["sortPos"] = _sortInfo.length - pos;
        }

        _setOrder("origPos");
    }

    function _undoSort() {
        _setOrder("sortPos");
    }

    function _setOrder(sortValue) {
        var elts = document.getElementsByClassName('o');
        // Note: this will return one more disabled item at the end,
        //       but as it's at the end, it does not cause any problem.

        for (var pos = 0; pos < _sortInfo.length; pos++) {
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

