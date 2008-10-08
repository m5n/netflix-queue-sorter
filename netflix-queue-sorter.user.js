///////////////////////////////////////////////////////////////////////////////
//
// This is a Greasemonkey user script.
//
// Netflix Queue Sorter
// Version 0.1, 2008-10-07
// Coded by Maarten van Egmond.  See namespace URL below for contact info.
// Released under the GPL license: http://www.gnu.org/copyleft/gpl.html
//
// ==UserScript==
// @name        Netflix Queue Sorter
// @namespace   http://tenhanna.com/greasemonkey
// @author      Maarten
// @version     0.1
// @description v0.1: Sort your queue.  Preview the new order.  Save it.
// @include     http://www.netflix.com/Queue*
// ==/UserScript==
//
///////////////////////////////////////////////////////////////////////////////
//
// For install, uninstall, and known issues, see the namespace link above.
//
///////////////////////////////////////////////////////////////////////////////
//
// This script allows you to sort your DVD or Instant Queue.  
// It is strongly recommended you inspect the new ordering before making it
// permanent via the Update Queue button.
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
                var buttonInfo = _createSortButton();
                _sortButtons.push(buttonInfo);
                elts[idx].appendChild(buttonInfo.button);
            }
        }
    }

    function _createSortButton() {
        var button = document.createElement('button');
        button.setAttribute('type', 'button');
        button.setAttribute('style',
                'margin-left: 1em; position: relative; top: -6px');
        var buttonText = document.createTextNode("Sort By Rating");
        button.appendChild(buttonText);
        button.addEventListener('click', _reorderQueue, true);
        return {
            'button': button,
            'text': buttonText
        };
    }

    function _reorderQueue() {
        // Prevent the user from pressing the buttons again.
        for (var idx = 0; idx < _sortButtons.length; idx++) {
            _setButtonState(_sortButtons[idx].button, false);
        }

        // Let GUI redraw buttons.
        var delayed = function() {
            if (_sorted) {
                _undoSort();
            } else {
                _sortByRating();
            }
            _sorted = !_sorted;

            // Change the button text and enable the buttons again.
            for (var idx = 0; idx < _sortButtons.length; idx++) {
                _replaceButtonText(_sortButtons[idx]);
                _setButtonState(_sortButtons[idx].button, true);
            }
        }
        setTimeout(delayed, 0);
    }

    function _replaceButtonText(buttonInfo) {
        var oldElt = buttonInfo.text;
        buttonInfo.text = document.createTextNode(
                _sorted ? "Undo Sort" : "Sort By Rating");
        buttonInfo.button.replaceChild(buttonInfo.text, oldElt);
    }

    function _setButtonState(button, enabled) {
        if (enabled) {
            button.removeAttribute('disabled');
        } else {
            button.setAttribute('disabled', true);
        }
    }

    function _sortByRating() {
        _sortInfo = [];

        var pos = 1;

        // In JavaScript, "everything until and including a newline" is
        // represented as the expression "(?:.*?\n)*?".  So that matches
        // wherever you are in the string until the end-of-line, and any
        // lines underneath it.  To continue matching on another line,
        // skip into the line first using ".*?".
        var regex = /(OR\d+)(?:.*?\n)*?.*?width:(.*?)px.*?([eg]):\s(.*?)</g;
        while (regex.test(document.body.innerHTML)) {
            var name = RegExp.$1;
            var usrRating = RegExp.$2 / 95 * 5;   // mask of 95px is 5 stars
            var ratingType = RegExp.$3;
            var avgRating = RegExp.$4;
            _sortInfo.push({
                "name": name,
                "usrRating": usrRating,
                "avgRating": avgRating,
                "origPos": pos++
            });
        }

        _quicksort(_sortInfo, 0, _sortInfo.length, "usrRating");

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
            elts[_sortInfo[pos][sortValue] - 1].value = _sortInfo.length - pos;
        }
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

