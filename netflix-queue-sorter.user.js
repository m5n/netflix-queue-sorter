///////////////////////////////////////////////////////////////////////////////
//
// This is a Greasemonkey user script.
//
// Netflix Queue Sorter
// Version 2.2 2011-01-12
// Coded by Maarten van Egmond.  See namespace URL below for contact info.
// Released under the GPL license: http://www.gnu.org/copyleft/gpl.html
//
// ==UserScript==
// @name        Netflix Queue Sorter
// @namespace   http://userscripts.org/users/64961
// @author      Maarten
// @version     2.2
// @description v2.2: Fully configurable multi-column sorter for your Netflix queue. Includes shuffle, reverse, and sort by star rating, average rating, title, length, year, genre, format, availability, playability, language, etc.
// @include     http://movies.netflix.com/Queue*
// @include     http://www.netflix.com/Queue*
// @include     http://movies.netflix.ca/Queue*
// @include     http://www.netflix.ca/Queue*
// Google Chrome uses @match in stead of @include.
// @match       http://movies.netflix.com/Queue*
// @match       http://www.netflix.com/Queue*
// @match       http://movies.netflix.ca/Queue*
// @match       http://www.netflix.ca/Queue*
// ==/UserScript==
//
///////////////////////////////////////////////////////////////////////////////
//
// For install, uninstall, and known issues, see the namespace link above.
//
///////////////////////////////////////////////////////////////////////////////
//
// This script adds to your Netflix queue pages a fully configurable
// multi-column sorter.  It allows you to shuffle (randomize), reverse, and
// sort your DVD or Instant Queue by star rating (suggested rating or
// user rating), average rating, title, length, year, genre, format,
// availability, playability, language, etc.
//
///////////////////////////////////////////////////////////////////////////////
/*global ActiveXObject, alert, clearTimeout, confirm, console, document, GM_deleteValue, GM_getValue, GM_log, GM_setValue, GM_xmlhttpRequest, localStorage, setTimeout, window, XMLHttpRequest */   // Satisfy JSLint.

// JSLint would like us to insert the "use strict" pragma as the first
// statement of a function. Since GM scripts already get wrapped to limit their
// exposure, there's no need to do that here.
// See http://www.yuiblog.com/blog/2010/12/14/strict-mode-is-coming-to-town/
"use strict";



// TODO: FUTURE: check TODO list and forum discussions for more work
// TODO: FUTURE: Make this script run in Opera and IE!



// Development-only code for developing and testing outside of the GM env.
/*
var gmCache = {
    'debug-mode': true,   // Always true for development mode.
    'auto-update': false   // Always false for development mode.
};
function GM_getValue(key) {
    return gmCache[key];
}
function GM_setValue(key, value) {
    gmCache[key] = value;
}
function GM_xmlhttpRequest(config) {
    // Thanks, http://www.quirksmode.org/js/xmlhttp.html
    var urlMap,
        XMLHttpFactories = [
            function () {
                return new XMLHttpRequest();
            },
            function () {
                return new ActiveXObject("Msxml2.XMLHTTP");
            },
            function () {
                return new ActiveXObject("Msxml3.XMLHTTP");
            },
            function () {
                return new ActiveXObject("Microsoft.XMLHTTP");
            }
        ];

    function createXMLHTTPObject() {
        var xmlhttp = false,
            i;

        for (i = 0; i < XMLHttpFactories.length; i += 1) {
            try {
                xmlhttp = XMLHttpFactories[i]();
            } catch (e) {
                continue;
            }
            break;
        }
        return xmlhttp;
    }

    function sendRequest(url, callback, method, postData, onError,
                onReadyStateChange) {
        var req = createXMLHTTPObject();
        if (!req) {
            return;
        }
        req.open(method, url, true);
        req.setRequestHeader('User-Agent', 'XMLHTTP/1.0');
        if (postData) {
            req.setRequestHeader('Content-type',
                    'application/x-www-form-urlencoded');
        }
        req.onreadystatechange = function () {
            // GM result object.
            var response = {
                status: req.status,
                statusText: req.statusText,
                readyState: req.readyState,
                responseText: req.responseText,
                responseHeaders: req.responseHeaders,
                finalUrl: url
            };

            if (onReadyStateChange) {
                onReadyStateChange(response);
            }

            if (req.readyState !== 4) {
                return;
            }
            if (req.status !== 200 && req.status !== 304) {
                if (onError) {
                    onError(response);
                }
                return;
            }

            callback(response);
        };
        if (req.readyState === 4) {
            return;
        }
        req.send(postData);
    }

    urlMap = {
        'http://userscripts.org/scripts/show/35183': 'us.org.html',
        'http://movies.netflix.com/Movie/60028867': '60028867.html',
        'http://movies.netflix.com/Movie/60028868': '60028868.html',
        'http://movies.netflix.com/Movie/70023939': '70023939.html'
    };
    if (urlMap[config.url]) {
        config.url = urlMap[config.url];
    }

    sendRequest(config.url, config.onload, config.method, config.data,
            config.onerror, config.onreadystatechange);
}
*/



/*
This class defines a data retriever object.

A data retriever defines a set of data points it is capable of retrieving and
is used by the queue manager to fetches data for a given set of movies.

It is expected that child classes override only those Retriever's function
that would otherwise throw an error.  The QueueManager only may override
other Retriever functions.

The config object passed here must be an object containing as keys the fields
this retriever can fetch data for, each mapped to a set of properties.
The set of properties MUST include the following:
- selectable - if this field should be selectable by the user
               (this is handy for fields that a retriever needs internally
               but if needed can easily be exposed to the user)
- extractFn  - the function used to extract the value
- display    - the display text to show to the user
Any other properties may exist, but are for the retriever's internal use only.
*/
var Retriever = function (id, config) {
    var field,
        selectableDataPoints = {};

    // Make sure this constructor works when called w/o arguments.
    if (undefined === config) {
        // Assume we're called by a subclass' prototype initialization.
        return;
    }

    for (field in config) {
        if (config.hasOwnProperty(field)) {
            // Sanity check to make sure config is what we expect.
            if (undefined === config[field].selectable ||
                    undefined === config[field].extractFn ||
                    undefined === config[field].display) {
                throw new Error(id + ': error in retriever config');
            }

            // Collect data points exposed to user.
            if (config[field].selectable) {
                selectableDataPoints[field] = config[field].display;
            }
        }
    }

    this.id = id;
    this.selectableDataPoints = selectableDataPoints;
    this.allDataPointConfig = config;

    // Debug mode.
    this.isDebug = false;   // Initialized in initConfigOptions().
};

// XHR delay to avoid bombarding the servers with requests.
// See http://developer.netflix.com/docs/Security for limits.
Retriever.XHR_DELAY = 1000 / 4;   // 4 requests per second, in milliseconds

Retriever.prototype = {
    debug: function (msg) {
        // Do this check only once and redefine function.
        if ("undefined" !== typeof GM_log) {
            Retriever.prototype.debug = function (msg) {
                // See http://wiki.greasespot.net/GM_log for how to make msgs
                // appear.
                GM_log(msg);
            };
        } else if ("undefined" !== typeof console) {
            Retriever.prototype.debug = function (msg) {
                console.log(msg);
            };
        } else {
            Retriever.prototype.debug = function (msg) {
                alert(msg);
            };
        }

        // Call the new verion.
        this.debug(msg);
    },

    // Trims leading and trailing space off of a string.
    trim: function (str) {
        // Thanks, http://javascript.crockford.com/remedial.html
        return str.replace(/^\s*(\S*(?:\s+\S+)*)\s*$/, "$1");
    },

    // Adds an event listener to an element.
    customAddEventListener: function (elt, type, handler) {
        // Check this only once and then redefine this function.
        if (elt.addEventListener) {
            Retriever.prototype.customAddEventListener = function (
                    elt, type, handler) {
                elt.addEventListener(type, handler, false);
            };
        } else if (elt.attachEvent) {
            Retriever.prototype.customAddEventListener = function (
                    elt, type, handler) {
                elt.attachEvent("on" + type, handler);
            };
        }

        // Call the new version.
        this.customAddEventListener(elt, type, handler);
    },

    // Replaces "{key}" substrings with their associated value.
    substituteVars: function (str, kvPairs) {
        // Thanks, http://javascript.crockford.com/remedial.html
        return str.replace(/\{([^\{\}]*)\}/g,
            function (a, b) {
                var r = kvPairs[b];
                return typeof r === 'string' || typeof r === 'number' ? r : a;
            }
        );
    },

    // Tests if a given element has a specific class or not.
    hasClass: function (elt, cl) {
        var re = new RegExp('\\b' + cl + '\\b');
        return re.test(elt.getAttribute('class'));
    },

    // Wrapper around GM_g/setValue for ease of use and to support browsers
    // which do not yet support GM_g/setValue, such as Chrome.
    // Thanks, http://devign.me/greasemonkey-gm_getvaluegm_setvalue-functions-for-google-chrome/
    // See also: http://code.google.com/p/chromium/issues/detail?id=33089
    getCacheValue: function (key, defaultValue) {
        var value;

        if ("undefined" !== typeof GM_getValue &&
                // Chrome defines this function, but it just outputs a msg.
                GM_getValue.toString().indexOf("not supported") < 0) {
            value = GM_getValue(key);
        } else if ("undefined" !== typeof localStorage) {
            value = localStorage[key];
        }

        if (undefined !== value) {
            value = JSON.parse(value);
        } else if (undefined !== defaultValue) {
            value = defaultValue;
            // To avoid adding to browser cache, don't store default value.
            // Default values are set and changed via the config UI only.
            //this.setCacheValue(key, value);
        }
        return value;
    },
    setCacheValue: function (key, value) {
        if ("undefined" !== typeof GM_setValue &&
                // Chrome defines this function, but it just outputs a msg.
                GM_setValue.toString().indexOf("not supported") < 0) {
            GM_setValue(key, JSON.stringify(value));
        } else if ("undefined" !== typeof localStorage) {
            localStorage[key] = JSON.stringify(value);
        }
    },
    deleteCacheValue: function (key) {
        if ("undefined" !== typeof GM_deleteValue &&
                // Chrome defines this function, but it just outputs a msg.
                GM_deleteValue.toString().indexOf("not supported") < 0) {
            GM_deleteValue(key);
        } else if ("undefined" !== typeof localStorage) {
            delete localStorage[key];
        }
    },

    // Returns a unique identified for this retriever.
    getId: function () {
        return this.id;
    },

    // Returns only the user-facing sortable fields.
    getSelectableDataPoints: function () {
        return this.selectableDataPoints;
    },

    // Returns all sortable fields.
    getAllDataPointConfig: function () {
        return this.allDataPointConfig;
    },

    // Allows the retriever to massage any data before it is displayed.
    // (This is supposed to be quick; no XHRs here.)
    initCachedData: function (cachedData) {
        throw new Error('Missing implementation of initCachedData');
    },

    // Indicates if this retriever is able to retrieve data for the given
    // config.
    canRetrieveData: function (fields) {
        var ff,
            result = false;

        if (undefined === this.allDataPointConfig) {
            throw new Error('Retriever not initialized');
        }

        // Don't care about IDs being selectable or not so use
        // allDataPointConfig.
        for (ff = 0; ff < fields.length; ff += 1) {
            if (undefined !== this.allDataPointConfig[fields[ff]]) {
                result = true;
                break;
            }
        }

        return result;
    },

    // Default sort function; sorts numbers sequentially and strings
    // alphabetically.
    defaultSortFn: function (a, b) {
        var result;

        // TODO: PERFORMANCE: split this into numeric and string sort fn to
        // avoid so many ifs.
        if (typeof a === Number && typeof b === Number) {
            result = a - b;

        // Missing optional values should always go at the end.
        } else if (undefined !== a && undefined === b) {
            result = 1;
        } else if (undefined === a && undefined !== b) {
            result = -1;

        // Standard lexicographical order.
        } else {
            if (a === b) {
                result = 0;
            } else if (a < b) {
                result = -1;
            } else {
                result = 1;
            }
        }

        return result;
    },

    // Custom sort function; sorts values according to the given order.
    // Does a date compare for dates (order should contain "{date}" for date
    // comparison), but otherwise does an exact match; caller should make sure
    // to pass case agnostic strings.
    customOrderSortFn: function (a, b, order) {
        var aIdx = Number.MAX_VALUE,
            bIdx = Number.MAX_VALUE,
            dateA,
            dateB,
            idx,
            vv;

        // This function should also support values that are an array of values.
        if ('object' !== typeof a) {
            a = [ a ];
        }
        if ('object' !== typeof b) {
            b = [ b ];
        }

        for (idx = 0; idx < order.length &&
                (Number.MAX_VALUE === aIdx || Number.MAX_VALUE === bIdx);
                idx += 1) {
            // Compare all of a's values.
            for (vv = 0; Number.MAX_VALUE === aIdx && vv < a.length; vv += 1) {
                if (/\{date\}/i.test(order[idx])) {
                    if (/(\d+\/\d+\/\d+)/.test(a[vv])) {
                        dateA = new Date(RegExp.$1);
                        aIdx = idx;
                        break;
                    }
                    // Else no date, no match, no idx set.
                } else {
                    if (order[idx] === a[vv]) {
                        aIdx = idx;
                        break;
                    }
                }
            }
            // Compare all of b's values.
            for (vv = 0; Number.MAX_VALUE === bIdx && vv < b.length; vv += 1) {
                if (/\{date\}/i.test(order[idx])) {
                    if (/(\d+\/\d+\/\d+)/.test(b[vv])) {
                        dateB = new Date(RegExp.$1);
                        bIdx = idx;
                        break;
                    }
                    // Else no date, no match, no idx set.
                } else {
                    if (order[idx] === b[vv]) {
                        bIdx = idx;
                        break;
                    }
                }
            }
        }

        // Handle date order if both values are dates.
        if (undefined !== dateA && undefined !== dateB) {
            aIdx = dateA.getTime();
            bIdx = dateB.getTime();
        }

        // Lower index goes before higher index.
        return bIdx - aIdx;
    },

    // Child classes use this method to retrieve data for one movie only.
    // The Retriever base class will take care of putting all data for all
    // movies together and calling back to the Queue Manager.
    asyncRetrieveMovieData: function (fields, cache, callback) {
        throw new Error('Missing implementation of asyncRetrieveMovieData');
    },

    asyncRetrieveData: function (idx, fields, cachedData, checkin, callback) {
        var self = this;

        // Find the next one we shouldn't skip.
        while (idx < cachedData.length &&
                cachedData[idx]['skip-' + this.id]) {
            delete cachedData[idx]['skip-' + this.id];
            idx += 1;
        }

        // All done?
        if (idx >= cachedData.length) {
            // Make sure to set "this" to this retriever object.
            callback.call(this);
            return;
        }

        this.asyncRetrieveMovieData(fields, cachedData[idx], function () {
            if (self.isDebug) {
                self.debug('Retrieved movie data: ' +
                        JSON.stringify(cachedData[idx]));
            }

            // TODO: FUTURE: use custom events instead.
            var cancelled = checkin(idx);
            if (cancelled) {
                self.asyncRetrieveData(cachedData.length, fields, cachedData,
                        checkin, callback);
                return;
            }

            // Next, but don't overload servers and don't delay if no next.
            if (idx + 1 >= cachedData.length) {
                self.asyncRetrieveData(idx + 1, fields, cachedData,
                        checkin, callback);
            } else {
                setTimeout(function () {
                    self.asyncRetrieveData(idx + 1, fields, cachedData,
                            checkin, callback);
                }, Retriever.XHR_DELAY);
                // TODO: FUTURE: this is not making N reqs/sec as it does not
                // include the time spent call to Netflix itself
            }
        });
    },

    // Returns data for the given config.
    // Note: all queue fields will be present in cachedData.
    retrieveData: function (fields, cachedData, checkin, callback) {
        // Note: Naturally using cached data is preferred for performance
        // reasons.  Periodically, though, the latest data could be fetched to
        // update the cache.  The decision whether or not to refresh the cache
        // is left up to the user through a config option.
        // By default, cached data for a movie will remain for as long as that
        // movie is in the queue.

        // Note: this periodic refetch decision must stay on retriever level,
        // as some retrievers always can return the latest data w/o penalty,
        // e.g. queueRetriever.

        var forceRefresh = this.getCacheValue('force-refresh', false),
            fieldsToRetrieve = [],
            ff,
            cc,
            ii;

        // First make sure there was a purpose for this retriever being called.
        for (ff = 0; ff < fields.length; ff += 1) {
            if (undefined !== this.allDataPointConfig[fields[ff]]) {
                fieldsToRetrieve.push(fields[ff]);
            }
        }
        if (0 === fieldsToRetrieve.length) {
            throw new Error(this.id + ': no fields to retrieve; why was ' +
                    'this retriever called? (fields: ' +
                    JSON.stringify(fields) + ')');
        }

        // Note: to avoid creating new data structures, we will just use
        // cachedData but mark those that can be skipped.  We need to mark
        // those to skip otherwise we'd have to do more work if forcedRefresh
        // is true (i.e. mark all records as "don't skip").
        // We do have to make sure to remove the markings to prevent them from
        // being cached.
        // Also, so as to not conflict with any other retrieval that may be
        // going on in parallel, use a marker specific to this retriever.
        if (false === forceRefresh) {
            // Only if not doing a complete refresh, add markings.
            for (ii = 0; ii < cachedData.length; ii += 1) {
                // Only get data for this ID if the cache is incomplete.
                cc = cachedData[ii];
                cc['skip-' + this.id] = true;

                for (ff = 0; ff < fieldsToRetrieve.length; ff += 1) {
                    if (undefined === cc[fieldsToRetrieve[ff]]) {
                        delete cc['skip-' + this.id];
                        break;
                    }
                }
            }
        }

        // Now that marking has been done based on fields to retrieve, we can
        // do optimizations.

        // Always retrieve all fields so that they can be cached.
        // Note: only retrieve selectable fields; backup fields will be pulled
        // as needed.
        fieldsToRetrieve = [];
        for (ff in this.selectableDataPoints) {
            if (this.selectableDataPoints.hasOwnProperty(ff)) {
                fieldsToRetrieve.push(ff);
            }
        }

        // Now go fetch the data for these IDs.
        this.asyncRetrieveData(0, fieldsToRetrieve, cachedData, checkin,
                callback);
    }
};



/*
This retriever fetches data from a Netflix details page.
*/
var NetflixDetailsPageRetriever = function () {
    var config = {
        /*
        data point         | fn to get value from tr elt          | expose to user?  | display string
        */

        // Fields that sometimes cannot be retrieved from the queue itself
        // e.g. because of series discs.
        // These are for internal-use only.
        // Their name must be queue field name + '2'.
        starRating2:       { extractFn: 'extractStarRating2',       selectable: false, display: 'Star Rating (Backup)' },

        // All other fields that only appear on the details page.
        year:              { extractFn: 'extractYear',              selectable:  true, display: 'Year' },
        language:          { extractFn: 'extractLanguage',          selectable:  true, display: 'Language' },
        length:            { extractFn: 'extractLength',            selectable:  true, display: 'Length' },
        avgRating:         { extractFn: 'extractAvgRating',         selectable:  true, display: 'Average Rating' },
        mpaaRating:        { extractFn: 'extractMpaaRating',        selectable:  true, display: 'MPAA Rating' },
        commonSenseRating: { extractFn: 'extractCommonSenseRating', selectable:  true, display: 'Common Sense Rating' },
        numRatings:        { extractFn: 'extractNumRatings',        selectable:  true, display: 'Number of Ratings' },
        numDiscs:          { extractFn: 'extractNumDiscs',          selectable:  true, display: 'Number of Discs' },
        mediaFormat:       { extractFn: 'extractMediaFormat',       selectable:  true, display: 'Media Format' },
        dateAdded:         { extractFn: 'extractDateAdded',         selectable:  true, display: 'Date Added' }
    };

// TODO: FUTURE: is DVD release date available somewhere on Netflix?  Other?

// TODO: FUTURE: different formats have different properties (e.g. length)
//       --> add preferred format (maybe based on format sort setting)
//       well, instant queue always uses instant length
//       Check extractMediaFormat; there are named anchors with details
//       just use .parentNode to find the top and then look at the dd/dt.

    Retriever.call(this, 'netflix-details-page', config);
};

// Netflix movie details URL.
// Note: Chrome does not support cross-domain XHR so need to use server name!
NetflixDetailsPageRetriever.DETAILS_PAGE_URL =
        'http://' + window.location.host + '/Movie/{movieId}';

NetflixDetailsPageRetriever.prototype = new Retriever();

NetflixDetailsPageRetriever.prototype.initCachedData = function (cachedData) {
    // No init needed as this retriever has no fields which values expire.
};

NetflixDetailsPageRetriever.prototype.extractRating = function (dom, idx) {
    // There are two ratings here, so pick the right one.
    // idx 0: star rating
    // idx 1: avg rating.
    // <span class="rating">3.7 stars</span>
    // 
    // Some movie don't have a star rating, e.g.
    // http://www.netflix.com/Movie/70077737?trkid=226871
    var rating,
        elts = dom.getElementsByClassName('rating'),
        txt;

    if (elts.length > idx) {
        txt = elts[idx].innerHTML;

        if (/([\d\.]+)/.test(txt)) {
            rating = Number(RegExp.$1);
        }
    }

    return rating;
};

NetflixDetailsPageRetriever.prototype.extractStarRating2 = function (id, dom) {
    return this.extractRating(dom, 0);
};

NetflixDetailsPageRetriever.prototype.extractAvgRating = function (id, dom) {
    return this.extractRating(dom, 1);
};

NetflixDetailsPageRetriever.prototype.extractYear = function (id, dom) {
    // <span class="year">1999</span>
    return parseInt(dom.getElementsByClassName('year')[0].innerHTML, 10);
};

// Extract a definition-term's data (<dt><dd>).
NetflixDetailsPageRetriever.prototype.extractDdElt = function (dom, dtVal) {
    var dts = dom.getElementsByTagName('dt'),
        dds = dom.getElementsByTagName('dd'),
        ii,
        ddElt;

    for (ii = 0; ii < dts.length; ii += 1) {
        if (dts[ii].innerHTML === dtVal) {
            ddElt = dds[ii];
            break;
        }
    }

    return ddElt;
};

NetflixDetailsPageRetriever.prototype.extractLanguage = function (id, dom) {
    // <dt>Language:</dt>
    // <dd>French</dd>
    var langElt = this.extractDdElt(dom, 'Language:'),
        language;

    if (undefined === langElt) {
        language = 'English';
    } else {
        language = langElt.innerHTML;
    }

    return language;
};

NetflixDetailsPageRetriever.prototype.extractLength = function (id, dom) {
    // Some discs have no length, e.g.
    // http://movies.netflix.com/Movie/Frontier-House-Disc-2/60028868?trkid=226871
    // instead, they have "2 discs" as the value for "duration".

    var elts = dom.getElementsByClassName('duration'),
        ee,
        txt,
        len;

    // Movies soon-to-be-released may not have a length yet.
    if (elts.length > 0) {
        txt = elts[0].innerHTML;
        if (/(\d+) minutes/.test(txt)) {
            len = parseInt(RegExp.$1, 10);
        } else if (/(\d+) discs/.test(txt)) {
            // Find duration of first episode, if any.
            // Skip first elt as we already looked at that.
            for (ee = 1; ee < elts.length; ee += 1) {
                if (elts[ee].getAttribute('class').indexOf('ep-1') >= 0) {
                    // Unwatched episode contain just '54 minutes', but if user
                    // started watching the episode, "4 of 53 mins watched".
                    if (/(\d+) min/.test(elts[ee].innerHTML)) {
                        len = parseInt(RegExp.$1, 10);
                        break;
                    }
                }
            }
        }
    }

    return len;
};

NetflixDetailsPageRetriever.prototype.extractMaturityRating = function (
            dom, className) {
    var ee,
        rating,
        elts = dom.getElementsByClassName('maturityRating');

    for (ee = 0; ee < elts.length; ee += 1) {
        if (elts[ee].getAttribute('class').indexOf(className) >= 0) {
            rating = elts[ee].getElementsByTagName('a')[0].innerHTML;
            break;
        }
    }

    return rating;
};

NetflixDetailsPageRetriever.prototype.extractMpaaRating = function (id, dom) {
    // <div class="maturityRating certRating  clearfix">
    //     <a href="http://www.netflix.com/Help?id=1632" class="value">NR</a>
    //     <p>
    //         Not rated. This movie has not been rated.
    //     </p>
    // </div>
    
    // Movies.n.c uses certRating, but www.n.c uses mpaaRating.
    var rating = this.extractMaturityRating(dom, 'certRating');
    if (undefined === rating) {
        rating = this.extractMaturityRating(dom, 'mpaaRating');
    }
    return rating;
};

NetflixDetailsPageRetriever.prototype.extractCommonSenseRating = function (
            id, dom) {
    // <div class="maturityRating csmRating csmRating-IFFY clearfix">
    //     <a href="http://movies.netflix.com/Movie/Fantastic_Planet/17968278?csm=true" class="value">12</a>
    //     <p>
    //         Common Sense rating
    //         <a href="http://movies.netflix.com/Movie/Fantastic_Planet/17968278?csm=true" id="cs-show-btn">Iffy for 12+</a>
    //     </p>
    // </div>
    return this.extractMaturityRating(dom, 'csmRating');
};

NetflixDetailsPageRetriever.prototype.extractNumRatings = function (id, dom) {
    // <div class="starbar starbar-avg stbrWrapStc">
    //     <p class="label">Average of 54,945 ratings:</p>
    //     <span class="rating">3.9 stars</span>
    // </div>
    var num,
        elt,
        txt;

    elt = dom.getElementsByClassName('starbar-avg')[0];
    txt = elt.getElementsByTagName('p')[0].innerHTML;

    if (/([\d\,]+)/.test(txt)) {
        txt = RegExp.$1;
        txt = txt.replace(/,/g, '');
        num = parseInt(txt, 10);
    }

    return num;
};

NetflixDetailsPageRetriever.prototype.extractNumDiscs = function (id, dom) {
    // Some discs have no length, e.g.
    // http://movies.netflix.com/Movie/Frontier-House-Disc-2/60028868?trkid=226871
    // instead, they have "2 discs" as the value for "duration".

    var elts = dom.getElementsByClassName('duration'),
        txt,
        num = 1;   // Default to 1.

    // Movies soon-to-be-released may not have a length yet.
    if (elts.length > 0) {
        txt = elts[0].innerHTML;
        if (/(\d+) discs/.test(txt)) {
            num = parseInt(RegExp.$1, 10);
        }
    }

    return num;
};

NetflixDetailsPageRetriever.prototype.extractMediaFormat = function (id, dom) {
    // <dt>Format:</dt>
    // <dd>
    //     <a href="#mdp-media-DD">DVD</a>,
    //     <a href="#mdp-media-BR">Blu-ray</a>&nbsp;and
    //     <a href="#mdp-media-ED">streaming</a>
    //     (HD available)
    // </dd>
    //
    // or
    //
    // <dt>Format:</dt>
    // <dd>
    //     DVD and Blu-ray available 1/18/2011
    // </dd>
    //
    // or
    //
    // <dt>Format:</dt>
    // <dd>
    //     <span class="relDVDavailMsg">DVD availability date unknown</span>, <span class="relstreamingavailMsg">streaming available 1/7/2011</span>
    // </dd>
    //
    // Capitalization may differ, e.g. "Streaming" if streaming only.
    var formatElt = this.extractDdElt(dom, 'Format:'),
        formats = [];

    if (undefined === formatElt) {
        throw new Error(id + ': format not found');
    } else {
        // Check DVD availability.
        if (/DVD/.test(formatElt.innerHTML) &&
                !/DVD availability date unknown/.test(formatElt.innerHTML)) {
            formats.push('DVD');
        }

        // Check Blu-ray availability.
        if (/Blu-ray/.test(formatElt.innerHTML)) {
            formats.push('BLU-RAY');
        }

        // Check Streaming availability.
        if (/[sS]treaming/.test(formatElt.innerHTML)) {
            formats.push('STREAMING');
        }

        // Check HD availability.
        if (/HD/.test(formatElt.innerHTML)) {
            formats.push('HD');
        }
    }

    return formats;
};

NetflixDetailsPageRetriever.prototype.extractDateAdded = function (id, dom) {
    // <div class="module module-relationship">
    //     <div class="bd clearfix">
    //         <p>Added  to your DVD Queue at position 227 on 10/15/2010</p>
    //         ...
    //     </div>
    // </div>

    var elt = dom.getElementsByClassName('module-relationship')[0];

    // Note: to make sort faster, we should return time in seconds here, but
    // that makes the movie info display not readable.  Opt for readability.
    if (/(\d+\/\d+\/\d+)/.test(elt.innerHTML)) {
        return RegExp.$1;
    }
};

NetflixDetailsPageRetriever.prototype.asyncRetrieveMovieData = function (
        fields, cache, callback) {
    var self = this,
        url = this.substituteVars(
                NetflixDetailsPageRetriever.DETAILS_PAGE_URL,
                { movieId: cache.movieId });

    function parsePage(response) {
        var ff,
            extractFnStr,
            extractVal,
            dom;

        // Convert to DOM.
        // TODO: PERFORMANCE: if this turns out to be expensive, an
        //       alternative is to search response.responseText via regexes,
        //       and may also not be that great in performance.  DOM is easier
        //       to code though.
        dom = document.createElement('div');
        dom.innerHTML = response.responseText;

        // Note: we're extracting only what we need, one field at a time.
        // If this turns out to be a performance bottleneck, a possible
        // improvement can be to retrieve all possible fields in one go, and
        // then extract what is needed from there.
        for (ff = 0; ff < fields.length; ff += 1) {
            // Extract the data point from the page.
            // Note: No need to check if this retriever supports the field, as
            // retrieveData made sure to pass the right fields only.
            extractFnStr = self.allDataPointConfig[fields[ff]].extractFn;
            extractVal = self[extractFnStr](cache.movieId, dom);
            // Storing undefined values will mess things up when we're merging
            // data with this.cachedData later.
            if (undefined !== extractVal) {
                cache[fields[ff]] = extractVal;
            }
        }

        callback.call(self);
    }

    GM_xmlhttpRequest({
        method: 'GET',
        url: url,
        onload: parsePage,
        onerror: parsePage   // Only added for development mode.
    });
};



/*
This object is a wrapper around the Netflix queue and drives the Netflix Queue
Sorter script.

It utilizes a (hardcoded) list of data point retrievers to (a) determine the
total set of sortable fields, and (b) to fetch the data needed to perform a
sort operation.
As it wraps the Netflix queue, this object is a retriever itself.

As a performance improvement, it will manage previously retrieved data by
utilizing the GM settings as a persistant storage.
*/
var QueueManager = function () {
    var config = {
        /*
        data point    | fn to get value from tr elt     | no err if empty? | shown in q? | expose to user?  | display string
        */
        order:        { extractFn: 'extractOrder',        maybeEmpty: false, shown:  true, selectable:  true, display: 'List Order' },
        movieId:      { extractFn: 'extractMovieId',      maybeEmpty: false, shown: false, selectable:  false, display: 'Movie ID' },
        seriesId:     { extractFn: 'extractSeriesId',     maybeEmpty:  true, shown: false, selectable:  false, display: 'Series ID' },
        title:        { extractFn: 'extractTitle',        maybeEmpty: false, shown:  true, selectable:  true, display: 'Movie Title' },
        playability:  { extractFn: 'extractPlayability',  maybeEmpty:  true, shown:  true, selectable:  true, display: 'Playability' },
        starRating:   { extractFn: 'extractStarRating',   maybeEmpty: false, shown:  true, selectable:  true, display: 'Star Rating' },
        genre:        { extractFn: 'extractGenre',        maybeEmpty: false, shown:  true, selectable:  true, display: 'Genre' },
        availability: { extractFn: 'extractAvailability', maybeEmpty: false, shown:  true, selectable:  true, display: 'Availability' }
    };

    // The list of data point retrievers.
    this.allNonQueueRetrievers = [
        new NetflixDetailsPageRetriever()
    ];

    // Lookup needed for all sorts but independent of a specific sort.
    // This is the set of queue fields in array form.
    this.allQueueFieldsArray = [];

    // The Netflix update queue button.
    this.updateQueueButton = null;   // Initialized in showUi().

    // The sort progress status element.
    this.statusElt = null;   // Initialized in showUi().

    // Timer ID for clearing the status area when the user cancels a sort.
    this.clearStatusTimerId = undefined;   // Initialized in doCancelSort().

    // Indication of whether or not user cancelled a sort.
    this.cancelled = false;

    // To switch back and forth between normal UI and sort-in-progress UI,
    // we need to remember the icon display states.
    this.iconDisplayStates = {};

    // A local copy of the cached (non-queue) retriever data, to avoid
    // de/serializing this potentially big object.
    this.cachedData = {};   // Initialized in showCachedData().

    // Should a button press auto-update the queue?
    this.autoUpdate = true;   // Initialized in initConfigOptions().

    Retriever.call(this, 'netflix-queue', config);
};

// These are the queue types Netflix exposes.
QueueManager.QUEUE_DVD = 'dvd';
QueueManager.QUEUE_INSTANT = 'instant';

// Use numeric values for the sort directions to avoid an IF condition and
// a string comparison in the sort function.
QueueManager.SORT_ASC = 1;
QueueManager.SORT_DESC = -1;

QueueManager.prototype = new Retriever();

QueueManager.prototype.initConfigOptions = function () {
    var rr;

    this.isDebug = this.getCacheValue('debug-mode', false);
    // Also apply to all retrievers.
    for (rr = 0; rr < this.allNonQueueRetrievers.length; rr += 1) {
        this.allNonQueueRetrievers[rr].isDebug = this.isDebug;
    }

    this.autoUpdate = this.getCacheValue('auto-update', true);
};

QueueManager.prototype.createSortIndependentLookups = function () {
    var ii;

    // Note: these lookups cannot be created in the constructor as they make
    // use of variables that are set in the base constructor, e.g.
    // this.allDataPointConfig.  This is why we're "delaying" that init.

    // Lookup needed for all sorts but independent of a specific sort.
    // This is the set of queue fields in array form.
    for (ii in this.allDataPointConfig) {
        if (this.allDataPointConfig.hasOwnProperty(ii)) {
            this.allQueueFieldsArray.push(ii);
        }
    }
};

// Readily retrievable queue data should not pollute cachedData.  The manager
// should never call this function and we should let the base class throw an
// exception if it is called.
/*
QueueManager.prototype.initCachedData = function (cachedData) {
    // Not needed as all queue data is already visible. 
};
*/

QueueManager.prototype.canRetrieveData = function (fields) {
    // Override default; the manager should always use the latest queue data.
    return true;
};

QueueManager.prototype.extractMovieId = function (trElt) {
    return Number(trElt.getAttribute('data-mid'));
};

QueueManager.prototype.extractSeriesId = function (trElt) {
    var value = trElt.getAttribute('series');
    return value ? Number(value) : undefined;
};

QueueManager.prototype.extractOrder = function (trElt) {
    // User could have changed the numbers in the order fields,
    // so don't use value in text field.  The hidden field has
    // the original order value.
    var elts = trElt.getElementsByClassName('pr'),
        ee,
        result;

    elts = elts[0].getElementsByTagName('input');
    for (ee = 0; ee < elts.length; ee += 1) {
        if ('hidden' === elts[ee].getAttribute('type')) {
            result = Number(elts[ee].value);
            break;
        }
    }

    if (undefined === result) {
        throw new Error('Could not extract order: ' + trElt.innerHTML);
    }

    return result;
};

QueueManager.prototype.extractTitle = function (trElt) {
    // Do some initialization the first time this function is called.

    var
        self = this,

        // Use true as default as Netflix' sorts ignore articles too.
        ignoreArticles = this.getCacheValue('ignore-articles', true),

        // The articles are used "as-is", so there must be a space after
        // each one in most cases.
        // Note: as of v2.x, users can no longer customize the articles.
        articles = [
            'A ',
            'AN ',
            'THE ',
            'EL ',
            'LA ',
            'LE ',
            'LES ',
            'IL ',
            'L\''
        ];

    function convertTitle(title) {
        var aa,
            re,
            article;

        if (ignoreArticles) {
            for (aa = 0; aa < articles.length; aa += 1) {
                article = articles[aa];
                re = new RegExp('^' + article, 'i');
                if (re.test(title)) {
                    // Move article to the end of the string.
                    title = title.substring(article.length) + ', ' +
                            self.trim(title.substring(0, article.length));
                    break;
                }
            }
        }

        // Note: to avoid extra work in the sort fn, convert to a
        // case-insensitive string comparison format here.
        // This is needed as not all movie titles (esp. foreign ones) use
        // the same word capitalization.
        return title.toUpperCase();
    }

    // Now redefine this function.
    QueueManager.prototype.extractTitle = function (trElt) {
        var elt = trElt.getElementsByClassName('tt')[0];
        elt = elt.getElementsByClassName('mdpLink')[0];
        return convertTitle(elt.innerHTML);
    };

    // And call it.
    return this.extractTitle(trElt);
};

// Returns "Now" for playable movies, "" for non-playable movies,
// and a date string of format d/m/yy or "Coming soon" for 
// soon-to-be-playable movies.
// TODO: FUTURE: ideally this fn returns a Date object if the extracted value
//       is a date to avoid work in sort fn.  However,
//       JSON.parse(JSON.stringify(new Date())) does not return a Date object.
//       Can we make this work?
QueueManager.prototype.extractPlayability = function (trElt) {
    var elt = trElt.getElementsByClassName('wn')[0],
        // Note: to avoid extra work in the sort fn, convert to a
        // case-insensitive string comparison format here.
        value = elt.innerHTML.trim().toUpperCase(),
        result;

    if (value.indexOf('<A ') >= 0) {
        result = 'NOW';
    } else {
        result = value.length > 0 ? value : undefined;
    }

    return result;
};

// Returns the numeric star rating, or throws an exception if 
// the rating cannot be extracted.
QueueManager.prototype.extractStarRating = function (trElt) {
    var elt = trElt.getElementsByClassName('st')[0];

    elt = elt.getElementsByClassName('stbrMaskFg')[0];
    if (undefined !== elt) {
        if (/sbmf-(\d+)/.test(elt.getAttribute('class'))) {
            return Number(RegExp.$1) / 10;
        } else {
            throw new Error('Could not extract star rating');
        }
    }
    // Else could be a series disc; will be retrieved later.
};

QueueManager.prototype.extractGenre = function (trElt) {
    var elt = trElt.getElementsByClassName('gn')[0],
        elt2;

    // Movies.n.c has genre class, but www.n.c has just a elt.
    elt2 = elt.getElementsByClassName('genre')[0];
    if (!elt2) {
        elt2 = elt.getElementsByTagName('a')[0];
    }

    return elt2.innerHTML;
};

// Extracts availability indication; could be a date of format m/dd/yyyy.
// TODO: FUTURE: ideally this fn returns a Date object if the extracted value
//       is a date to avoid work in sort fn.  However,
//       JSON.parse(JSON.stringify(new Date())) does not return a Date object.
//       Can we make this work?
QueueManager.prototype.extractAvailability = function (trElt) {
    var result,
        elt = trElt.getElementsByClassName('av')[0];

    // Movies.n.c uses av elt for Unavailable items, but www.n.c uses km elt.
    if (!elt) {
        if (trElt.getElementsByClassName('km')[0]) {
            result = 'N/A';
        }
    } else {
        // Movies.n.c uses em class, but www.n.c uses em elt.
        if (this.hasClass(elt, 'em')) {
            // There's a value here.

            // Note: to avoid extra work in the sort fn, convert to a
            // case-insensitive string comparison format here.
            result = elt.innerHTML.trim().toUpperCase();
            if (/UNAVAILABLE/.test(result)) {
                // To avoid conflicts with AVAILABLE text search, use N/A.
                result = 'N/A';
            }
        } else if (elt.getElementsByTagName('em').length > 0) {
            result = elt.getElementsByTagName('em')[
                    0].innerHTML.trim().toUpperCase();
        }
    }

    return result;
};

QueueManager.prototype.applyToSelectedRowsOnly = function (value) {
    var elt = document.getElementById('nqs-use-sort-limit-rows');
    if (undefined !== value) {
        // Setter.
        elt.checked = value;
    } else {
        // Getter.
        return elt.checked;
    }
};

QueueManager.prototype.inputValueAsInt = function (id, value) {
    var elt = document.getElementById(id);
    if (undefined !== value) {
        // Setter.
        elt.value = value + 1;
    } else {
        // Getter.
        return (elt && /^\d+$/.test(elt.value)) ?
                parseInt(elt.value, 10) - 1 : undefined;
    }
};

QueueManager.prototype.minSelectedRowIndex = function (value) {
    return this.inputValueAsInt('nqs-sort-limit-row-min', value);
};

QueueManager.prototype.maxSelectedRowIndex = function (value) {
    return this.inputValueAsInt('nqs-sort-limit-row-max', value);
};

QueueManager.prototype.getListOrderInputs = function () {
    return document.getElementsByClassName('o');
};

QueueManager.prototype.getTrEltForListOrderInput = function (orderElt) {
    return orderElt.parentNode.parentNode;
};

QueueManager.prototype.getListTrElts = function () {
    // There is no good selector, so use order field.
    var ee,
        trElts = [],
        orderElts = this.getListOrderInputs();

    for (ee = 0; ee < orderElts.length; ee += 1) {
        trElts.push(this.getTrEltForListOrderInput(orderElts[ee]));
    }

    return trElts;
};

// Reverses the ordering of the given data array.
// Note: changes the given data array in place.
QueueManager.prototype.doReverse = function (data) {
    var maxIdx,
        otherIdx,
        idx,
        tmp;

    maxIdx = Math.floor(data.length / 2);
    for (idx = 0; idx < maxIdx; idx += 1) {
        otherIdx = data.length - 1 - idx;

        // Swap the array elements.
        tmp = data[idx];
        data[idx] = data[otherIdx];
        data[otherIdx] = tmp;
    }
};

// Shuffles the ordering of the given data array.
// Note: changes the given data array in place.
QueueManager.prototype.doShuffle = function (data) {
    var idx,
        slots = [],
        newData = [],
        slotsIdx;

    // Generate a list of positions to choose from.
    for (idx = 0; idx < data.length; idx += 1) {
        slots.push(idx);
    }

    for (idx = 0; idx < data.length; idx += 1) {
        // Choose the next position at random.
        // Generate number between 0 and slots.length - 1.
        // Math.random() generates a number between 0 (incl) and 1 (excl).
        slotsIdx = Math.floor(Math.random() * slots.length);
        newData[idx] = data[slots[slotsIdx]];

        // Remove used position from slots array, in effect making sure that
        // index into the data array is not used again.
        slots.splice(slotsIdx, 1);
        // Note: if splice turns out to be expensive, we could just move
        // the slotsIdx value to the front of the array and keep a pointer
        // to the end of the "used" positions.
    }

    // Copy the new data back into the data array.
    for (idx = 0; idx < data.length; idx += 1) {
        data[idx] = newData[idx];
    }
};

QueueManager.prototype.retrieveData = function (fields, cachedData,
        checkin, callback) {
    var extractFnStr,
        extractVal,
        trElts,
        minRow,
        maxRow,
        ff,
        rr,
        result,
        data;

    // Note: because all data can be retrieved from the queue without XHRs,
    // don't use cacheData unless it is proven to be a bottleneck.

    // Retrieve the tr elts.
    trElts = this.getListTrElts();

    if (this.isDebug) {
        this.debug('Retrieved ' + trElts.length + ' <tr> elts');
    }

    // Check if user want to limit the sort to a range of rows.
    // Note: validateUserInput() already made sure the option and entered
    // limits are valid.
    if (this.applyToSelectedRowsOnly()) {
        minRow = this.minSelectedRowIndex();
        maxRow = this.maxSelectedRowIndex();
    } else {
        minRow = 0;
        maxRow = trElts.length - 1;
    }

    // Note: we're extracting only what we need, one field at a time.
    // If this turns out to be a performance bottleneck, a possible
    // improvement can be to retrieve all possible fields in one go, and then
    // extract what is needed from there.

    result = [];
    for (rr = minRow; rr <= maxRow; rr += 1) {
        data = {};
        for (ff = 0; ff < fields.length; ff += 1) {
            if (undefined !== this.allDataPointConfig[fields[ff]]) {
                // Extract the data point from the queue.
                extractFnStr = this.allDataPointConfig[fields[ff]].extractFn;
                extractVal = this[extractFnStr](trElts[rr]);
                // Storing undefined values will mess things up when we're
                // merging data with this.cachedData later.
                if (undefined !== extractVal) {
                    data[fields[ff]] = extractVal;
                }
            }
        }

        result.push(data);
    }

    // Make sure to set "this" to this retriever object.
    callback.call(this, result);
};

QueueManager.prototype.getSortFn = function (buttonConfig) {
    var self = this;

    return function (a, b) {
        var result = 0,
            level = 0,
            order,
            field,
            sortFn;

        // Custom order of values, if any.
        if (undefined !== buttonConfig.cacheKey) {
            // Order is customizable.
            order = self.getCacheValue(buttonConfig.cacheKey,
                    buttonConfig.defaultOrder);
        } else {
            // Not customizable, use default order.
            order = buttonConfig.defaultOrder;
        }

        while (0 === result && level < buttonConfig.fields.length) {
            field = buttonConfig.fields[level];
            sortFn = self[buttonConfig.sortFns[level]];

            result = sortFn(a[field], b[field], order);

            // Note: the values of asc (1) and desc (-1) were specifically
            // chosen to make this statement as efficient as possible.
            result *= buttonConfig.dirs[level];

            level += 1;
        }
        return result;
    };
};

// The cache argument should be an array of objects each containing an "order"
// property representing the original order.
QueueManager.prototype.commitSort = function (cache) {
    var oElts,
        rr,
        minRow,
        maxRow,
        idx,
        origOrder,
        orderChanged;

    if (this.isDebug) {
        this.debug('sorted cache:\n' + JSON.stringify(cache));
    }

    // Going to apply new order and save undo state; user can no longer cancel.
    this.switchToNoMoreCancelMode();

    oElts = this.getListOrderInputs();
    if (this.applyToSelectedRowsOnly()) {
        minRow = this.minSelectedRowIndex();
        maxRow = this.maxSelectedRowIndex();

        // Save min/max row so they can be displayed when the page loads.
        this.setCacheValue('last-min-row-' + this.getQueueId(), minRow);
        this.setCacheValue('last-max-row-' + this.getQueueId(), maxRow);
    } else {
        minRow = 0;
        maxRow = oElts.length - 1;

        // Don't save min/max row.
        this.deleteCacheValue('last-min-row-' + this.getQueueId());
        this.deleteCacheValue('last-max-row-' + this.getQueueId());
    }

    // Save current order for undo purposes.
    origOrder = {};
    for (rr = 0; rr < oElts.length; rr += 1) {
        origOrder[this.extractMovieId(this.getTrEltForListOrderInput(
                oElts[rr]))] = rr + 1;   // Don't use value in text field!
    }
    if (this.isDebug) {
        this.debug('original order:\n' + JSON.stringify(origOrder));
    }
    this.setCacheValue('undo-order-' + this.getQueueId(), origOrder);

    // Apply new sort order.
    orderChanged = false;
    for (idx = 0, rr = minRow; rr <= maxRow; rr += 1, idx += 1) {
        if (cache[idx].order !== rr + 1) {   // Don't use value in text field!
            orderChanged = true;
        }
        // Always override possibly user-changed order value.
        oElts[cache[idx].order - 1].value = rr + 1;
    }

    if (orderChanged) {
        // TODO: FUTURE: is this really needed?  reload does not work?
        this.setCacheValue('reload-trigger', true);   // TODO: NOW: remove trigger
        // Make Netflix realize the ordering has changed.
        // (Do this for one row only, otherwise it slows down too much.)
        // Unfortunately focusing an input moves the page down to that input.
        // Since the user is most likely near the top of the page (that's where
        // the sort button was pressed), find the highest changed row.
        /*
        for (rr = minRow; rr <= maxRow; rr += 1) {
            if (rr + 1 !== oElts[rr].value) {   // Don't use value in text field!
                oElts[rr].focus();   // Could move page down.
                oElts[rr].blur();
                oElts[0].focus();   // Moves page back up.
                oElts[0].blur();
                break;   // Only do this once.
            }
        }
        */
        if (this.autoUpdate) {
            this.setStatus('[Reloading page...]');
            // TODO: NOW: using form submit does not require row change trigger above.
            //this.updateQueueButton.click();
            document.getElementById('MainQueueForm').submit();
        } else {
            this.switchToUserMode();
            this.setStatus('[Click "' + this.getUpdateButtonText() + '".]');
        }
    } else {
        this.switchToUserMode();
        this.setStatus('[Order unchanged.]');
    }
};

QueueManager.prototype.doSort = function (cache, configObj) {
    if (this.isDebug) {
        this.debug('\nDo sort.');
    }

    this.setStatus('[Sorting...]');

    // Sort the data.
    cache = cache.sort(this.getSortFn(configObj));

    this.commitSort(cache);
};

// Returns a map from backup field name -> original field name.
QueueManager.prototype.determineBackupFields = function (fields) {
    var backupFields = {},
        backupFieldsEmpty = true,
        ff,
        rr,
        field,
        config;

    for (ff = 0; ff < fields.length; ff += 1) {
        field = fields[ff];
        if (undefined !== this.allDataPointConfig[field]) {
            // This is a queue field that needs to be retrieved.  Check if it
            // has a backup.
            for (rr = 0; rr < this.allNonQueueRetrievers.length; rr += 1) {
                config = this.allNonQueueRetrievers[
                        rr].getAllDataPointConfig();
                if (undefined !== config[field + '2']) {
                    backupFields[field + '2'] = field;
                    backupFieldsEmpty = false;
                    break;
                }
            }
        }
    }
    
    return backupFieldsEmpty ? undefined : backupFields;
};

QueueManager.prototype.determineSeriesLookup = function (data, backupFields) {
    var rr,
        ff,
        ok,
        origField,
        seriesLookup = {};

    for (rr = 0; rr < data.length; rr += 1) {
        // If this row was part of a series, save its info for later.
        if (undefined !== data[rr].seriesId) {
            // Find the row that has all series info.
            // Usually, the first series disc has all the info, the others
            // don't.  But if one disc of a series is at home and the other is
            // still in the queue, the one in the queue will not have the info.
            // So, only take this as the source of truth if it has all info
            // we need.
            ok = true;
            for (ff in backupFields) {
                if (backupFields.hasOwnProperty(ff)) {
                    origField = backupFields[ff];
                    if (undefined === data[rr][origField]) {
                        ok = false;
                        break;
                    }
                }
            }
            if (ok) {
                seriesLookup[data[rr].seriesId] = data[rr];
            }
        }
    }

    return seriesLookup;
};

QueueManager.prototype.retrieveExternalData = function (sortableData,
            configObj, retrievers, allDoneCallback) {
    var toInvoke = [],
        pending = [],
        newCache,
        oldData,
        aa,
        ii,
        progressBaseLine,
        checkin,
        retrieveDataCallback,
        self;

    // Now we've retrieved all data from the queue itself and we're about
    // to call external retrievers (if any).  The 'sortableData' variable
    // containing the queue data tells the retrievers for which movies (which
    // IDs) to retrieve data.
    // We will now add any cached data we had before to 'sortableData' so that
    // each external retriever can decide if it even has to retrieve data.
    // Once all data from all external retrievers has come back, a new version
    // of this.cachedData can be generated and stored.  (Because 
    // this.cachedData does not contain readily available queue data, there is
    // no need to do anything with it here.)

    // Merge any previously retrieved data from this.cachedData into
    // sortableData.
    // Note: this.cachedData was initialized by init().
    for (ii = 0; ii < sortableData.length; ii += 1) {
        oldData = this.cachedData[sortableData[ii].movieId];
        if (undefined !== oldData) {
            for (aa in oldData) {
                if (oldData.hasOwnProperty(aa)) {
                    sortableData[ii][aa] = oldData[aa];
                }
            }
        }
    }
    if (this.isDebug) {
        this.debug('data for retrievers:\n' + JSON.stringify(sortableData));
    }


    // Don't invoke retrievers immediately as we could end up with a race
    // condition where the retriever invoked already comes back before
    // the next retriever is invoked, causing the manager to conclude
    // there's no pending callback.
    // Don't use just one variable for toInvoke and pending because fast
    // retrievers will change toInvoke.length before the invoke loop has
    // had a chance to complete.
    // Note: just assigning pending = toInvoke does not work.
    for (ii = 0; ii < retrievers.length; ii += 1) {
        toInvoke.push(retrievers[ii]);
        pending.push(retrievers[ii]);
    }

    if (0 === pending.length) {
        // So far we've only retrieved data from the queue itself, which does
        // not belong in this.cachedData.  So, no need to update anything.
        // Note: if we don't pass "this", this becomes "window" in the cb fn.
        // TODO: FUTURE: why doesn't "this" stay "this"?
        allDoneCallback.call(this, sortableData, configObj);
        return;
    }

    if (this.isDebug) {
        this.debug('\nFetch retriever data.');
    }

    self = this;
    if (this.applyToSelectedRowsOnly()) {
        newCache = this.cachedData;   // Update data in existing cache.
    } else {
        newCache = {};   // Replace existing cache.
    }

    // The check-in function is a means for the retriever to report progress to
    // the queue manager, and for the queue manager to notify the retriever of
    // and additional instructions, such as the command to cancel.
    progressBaseLine = 0;
    checkin = function (idx) {
        if (false === self.cancelled) {
            // Manager updates progress based on retriever's report.
            self.setStatus('[Retrieving data... ' + Math.floor(
                    progressBaseLine + 100 * (idx + 1) / sortableData.length) +
                    '%]');
        }

        // Manager lets retriever know if it should abort its processing.
        return self.cancelled;
    };

    retrieveDataCallback = function () {
        var cc,
            dd,
            pp,
            cancelled,
            found,
            key;

        found = false;
        for (pp = 0; pp < pending.length; pp += 1) {
            // Remove pending status for this retriever.
            if (this.getId() === pending[pp].getId()) {
                pending.splice(pp, 1);
                found = true;
                break;
            }
        }
        if (!found) {
            throw new Error('No callback was pending for ' + this.getId());
        }

        progressBaseLine = 100 * (1 - pending.length / toInvoke.length);
        cancelled = checkin(0);
        if (cancelled) {
            return;
        }

        // Sortable data is now updated with the retrieved data.

        if (this.isDebug) {
            this.debug(this.getId() + ': sortableData is now:\n' +
                    JSON.stringify(sortableData));
        }

        // Merge retrieved data into cache.  Always overwrite any old data.
        // Note: sortableData has queue data as well, which does not belong in
        // the cache.
        for (pp = 0; pp < sortableData.length; pp += 1) {
            // Apply to newCache.
            cc = newCache[sortableData[pp].movieId];
            if (undefined === cc) {
                cc = {};
                newCache[sortableData[pp].movieId] = cc;
            }
            for (dd in sortableData[pp]) {
                if (sortableData[pp].hasOwnProperty(dd) &&
                        // Note: "this" = current retriever,
                        // "self" = queue manager.
                        undefined === self.allDataPointConfig[dd]) {
                    cc[dd] = sortableData[pp][dd];
                }
            }
        }
        if (this.isDebug) {
            this.debug(this.getId() + ': newCache is now:\n' +
                    JSON.stringify(newCache));
        }

        if (0 === pending.length) {
            if (this.isDebug) {
                this.debug('\nAll callbacks received.');
            }

            // We now have the latest data, so persist it for next time.
            // Note: "this" = current retriever, "self" = queue manager.
            self.setStatus('[Updating cache...]');
            self.cachedData = newCache;

            key = 'movie-data-' + self.getQueueId();
            self.setCacheValue(key, self.cachedData);

            // No more callbacks pending.
            allDoneCallback.call(self, sortableData, configObj);
        }
    };

    for (ii = 0; ii < toInvoke.length; ii += 1) {
        if (this.isDebug) {
            this.debug('Retrieve fields: ' + JSON.stringify(configObj.fields) +
                    ' from: ' + toInvoke[ii].getId());
        }
        // Make sure to pass the current retriever as "this".
        toInvoke[ii].retrieveData.call(toInvoke[ii], configObj.fields,
                sortableData, checkin, retrieveDataCallback);
    }
};

QueueManager.prototype.retrieveQueueDataCallback = function (data, configObj,
            retrievers) {
    var field,
        sortCommandConfig,
        aa,
        ff,
        rr,
        backupFields,
        backupFieldsEmpty,
        extraFieldToOrigLookup,
        extraFieldsById,
        extraRetrievers,
        found,
        seriesLookup,
        origField,
        config,
        seriesData,
        fakeConfigObj,
        queueDataWithMissingFields,
        self = this;

    if (this.isDebug) {
        this.debug(this.getId() + ': retrieved data:\n' +
                JSON.stringify(data));
    }

    // Process commands first, if any.
    // TODO: FUTURE: allow commands to be run in any order.
    for (aa = 0; aa < configObj.length; aa += 1) {
        switch (configObj[aa].command) {
        case 'reverse':
            this.doReverse(data);
            break;
        case 'shuffle':
            this.doShuffle(data);
            break;
        case 'sort':
            sortCommandConfig = configObj[aa];
            // Handled later.
            break;
        default:
            throw new Error('Unknown command: ' + configObj.command);
        }
    }

    if (undefined === sortCommandConfig) {
        // Done.

        this.commitSort(data);
        return;
    }

    // Make sure all data is present.  If a data point is missing, it may be
    // derived from another disc in the same series, or else it needs to be
    // retrieved from the details page.

    backupFields = this.determineBackupFields(sortCommandConfig.fields);
    backupFieldsEmpty = false;
    if (undefined === backupFields) {
        backupFields = {};
        backupFieldsEmpty = true;
    }
    if (this.isDebug) {
        this.debug(this.getId() + ': backup fields:\n' +
                JSON.stringify(backupFields));
    }

    // The seriesLookup is there only as a way to prevent doing an XHR to
    // retrieve backup field, so only create the lookup if there are backup
    // fields involved.
    seriesLookup = {};
    if (false === backupFieldsEmpty) {
        seriesLookup = this.determineSeriesLookup(data, backupFields);
    }
    if (this.isDebug) {
        this.debug(this.getId() + ': series lookup:\n' +
                JSON.stringify(seriesLookup));
    }

    // Store the extra fields to lookup for certain IDs.
    extraFieldToOrigLookup = {};   // backup field name -> orig field name
    extraFieldsById = {};   // ID -> backup field(s)
    queueDataWithMissingFields = [];

    for (rr = 0; rr < data.length; rr += 1) {
        for (ff = 0; ff < sortCommandConfig.fields.length; ff += 1) {
            field = sortCommandConfig.fields[ff];
            config = this.allDataPointConfig[field];
            if (undefined !== config) {
                // This is a queue field that needs to be retrieved.
                // Check if there's a value for it.
                if (undefined === data[rr][field]) {
                    // Look up series info to complete info.
                    if (undefined !== data[rr].seriesId) {
                        seriesData = seriesLookup[data[rr].seriesId];
                        if (undefined !== seriesData &&
                                undefined !== seriesData[field]) {
                            data[rr][field] = seriesData[field];
                        }
                    }

                    // Look up cached data to complete info.
                    // This is a bit of a corner case anyway, and rating data
                    // can easily get stale with a sizeable queue, so let's
                    // not use cachedData for this.
                    // TODO: FUTURE: make this a configurable option
                    /*
                    cacheData = this.cachedData[data[rr].movieId];
                    if (undefined !== cacheData) {
                        if (undefined !== cacheData[field]) {
                            data[rr][field] = cacheData[field];
                        }
                        if (undefined !== cacheData[field + '2']) {
                            data[rr][field] = cacheData[field + '2'];
                        }
                    }
                    */

                    // If still undefined, and not optional, and there is a
                    // backup defined, look it up via another retriever.
                    if (undefined === data[rr][field] &&
                            false === config.maybeEmpty &&
                            undefined !== backupFields[field + '2']) {

                        // For this ID, we need to look up more data.
                        // Note: this ID need not be part of a series
                        // necessarily, so we can't just do one series lookup
                        // for a bunch of IDs belonging to that series.  But,
                        // if doing it one ID at a time becomes a bottleneck,
                        // see if we can improve by aggregating those IDs that
                        // are from the same series.
                        if (undefined === extraFieldsById[data[rr].movieId]) {
                            extraFieldsById[data[rr].movieId] = [];

                            // Note: what is stored here is a reference, so if
                            // data[rr] changes later, e.g. a series lookup
                            // populates the next empty field,
                            // queueDataWithMissingFields will also reflect
                            // that.
                            queueDataWithMissingFields.push(data[rr]);
                        }
                        extraFieldsById[data[rr].movieId].push(field + '2');
                        extraFieldToOrigLookup[field + '2'] = field;
                    }
                }
            }
        }
    }

    if (this.isDebug) {
        this.debug(this.getId() + ': backup data to retrieve:\n' +
                JSON.stringify(extraFieldsById));
    }

    // Make sure the retrievers needed for extraFieldsById are already in the
    // (external) "retrievers" array.
    // If they are already, we can easily tag on the backup fields.
    // If they are not, we need to get those backup data points only for the
    // identified IDs (not for all movies).
    // TODO: PERFORMANCE: if tagging the backup fields to the retrievers
    //       already in the "retrievers" array is hairy because then we have
    //       to deal with putting the backup value back in two places... opt
    //       for processing backup data first, and then calling the
    //       "retrievers" and removing this check: always call the
    //       extraRetrievers that belong to the set of backup fields.
    extraRetrievers = [];
    for (ff in extraFieldToOrigLookup) {
        if (extraFieldToOrigLookup.hasOwnProperty(ff)) {
            for (rr = 0; rr < this.allNonQueueRetrievers.length; rr += 1) {
                if (undefined !== this.allNonQueueRetrievers[
                            rr].getAllDataPointConfig()[ff]) {
                    // We found the retriever for this backup field, is it in
                    // the list of retrievers already?
                    found = false;
                    for (aa = 0; aa < retrievers.length; aa += 1) {
                        if (retrievers[aa].getId() ===
                                this.allNonQueueRetrievers[rr].getId()) {
                            // Yes, so add the backup field too.
                            sortCommandConfig.fields.push(ff);
                            found = true;
                            break;
                        }
                    }
                    if (!found) {
                        // Need to get this data especially.
                        for (aa = 0; aa < extraRetrievers.length; aa += 1) {
                            if (extraRetrievers[aa].getId() ===
                                    this.allNonQueueRetrievers[rr].getId()) {
                                found = true;
                                break;
                            }
                        }
                        if (!found) {
                            extraRetrievers.push(
                                    this.allNonQueueRetrievers[rr]);
                        }
                    }
                }
            }
        }
    }

    if (this.isDebug) {
        this.debug(this.getId() + ': extra retrievers to call:\n' +
                JSON.stringify(extraRetrievers));
    }

    if (0 !== extraRetrievers.length) {
        // Get missing data first, then call (external) retrievers.

        // TODO: FUTURE: ideally we build queueDataWithMissingFields here,
        //       where we need it, but since data is an array and is not easy
        //       to look an ID up in, we did it earlier.

        // Build fake config obj containing the missing fields.
        // Remember, extraFieldToOrigLookup is an object, so convert to array.
        // TODO: PERFORMANCE: This could be inefficient; we already know what
        //       fields are needed for each ID and it may not be all fields for
        //       each ID.
        //       This could lead to more XHRs being done than strictly needed.
        //       (This is an issue if all fields span multiple retrievers.)
        //       Maybe make one call per ID so that we can retrieve just those
        //       fields that are needed?
        //       Or (better), make the fields object more intelligent so it
        //       manages the fields to be used for each ID.  If there's no 
        //       difference by ID, it always returns the same fields.
        // Note: the config object is eventually passed on to the main sort
        // function so we cannot avoid retrieveExternalData knowing about the
        // internals of the config object.
        fakeConfigObj = {
            fields: []
        };
        for (aa in extraFieldToOrigLookup) {
            if (extraFieldToOrigLookup.hasOwnProperty(aa)) {
                fakeConfigObj.fields.push(aa);
            }
        }

        // Calling this fn gets the retrieved data added to this.cachedData
        // (which also gets persisted--TODO: PERFORMANCE: avoid that for this
        // call?) and to queueDataWithMissingFields.  So when this call
        // returns, we can apply the backup fields to "data" and invoke the
        // external retrievers for the remaining data needed to perform the
        // sort.
        this.retrieveExternalData(queueDataWithMissingFields, fakeConfigObj, 
                extraRetrievers, function (sortableData, fakeConfigObj) {
            var ii,
                id,
                ff,
                lookup = {};

            // Now put the retrieved backup data back in the real fields.
            // TODO: PERFORMANCE: can this be made more efficient?  To add the
            //       looked up info we're stepping through the entire data
            //       array...

            // Create a lookup first.
            for (ii = 0; ii < sortableData.length; ii += 1) {
                id = sortableData[ii].movieId;
                lookup[id] = sortableData[ii];
            }

            // Now go through the data array and add the retrieved data.
            for (ii = 0; ii < data.length; ii += 1) {
                id = data[ii].movieId;
                if (undefined !== lookup[id]) {
                    for (ff in extraFieldToOrigLookup) {
                        if (extraFieldToOrigLookup.hasOwnProperty(ff)) {
                            origField = extraFieldToOrigLookup[ff];
                            data[ii][origField] = lookup[id][ff];
                            // Note: Yes, retrievers always return all their
                            // data so although we're only adding the backup
                            // field back into the data object, all the
                            // retrievers data was already added to
                            // this.cachedData, so when we make the call to
                            // retrieveExternalData below, all that data will
                            // be added into "data" at that time.  No dupe XHR
                            // will be made.
                        }
                    }
                }
            }

            // Now call (external) retrievers for the rest of the data we need
            // to do the sort.
            this.retrieveExternalData(data, sortCommandConfig, retrievers, function (
                    sortableData, sortCommandConfig) {
                self.doSort.call(self, sortableData, sortCommandConfig);
            });
        });
    } else {
        this.retrieveExternalData(data, sortCommandConfig, retrievers, function (
                sortableData, sortCommandConfig) {
            self.doSort.call(self, sortableData, sortCommandConfig);
        });
    }
};

QueueManager.prototype.validateUserInput = function () {
    var len = this.getListOrderInputs().length,
        result = true,
        msg,
        minRow,
        maxRow;

    // The only user input is for the row selection.
    // TODO: FUTURE: find a way of selecting rows where user never inputs
    //       anything so this can be avoided, e.g. right-click menus on rows.
    if (this.applyToSelectedRowsOnly()) {
        minRow = this.minSelectedRowIndex();
        maxRow = this.maxSelectedRowIndex();

        if (undefined === minRow || minRow < 0 ||
                undefined === maxRow || maxRow < 0 || maxRow > len - 1) {
            msg = 'You chose to apply this sort to specific rows.\nMake ' +
                    'sure the row numbers you entered are between 1 and ' +
                    len + '.';
            alert(msg);
            result = false;
        } else if (maxRow < minRow) {
            msg = 'You chose to apply this sort to specific rows.\nMake ' +
                    'sure the rows you entered form a range from lower to ' +
                    'higher row number.';
            alert(msg);
            result = false;
        } else if (minRow === 0 && maxRow === len - 1) {
            msg = 'You chose to apply this sort to specific rows.\nThe ' +
                    'range you entered includes all rows.\nTo continue the ' +
                    'checkbox will be unchecked.';
            result = confirm(msg);
            if (result) {
                // To streamline, make applyToSelectedRowsOnly() return false.
                this.applyToSelectedRowsOnly(false);
            }
        }
    }

    return result;
};

QueueManager.prototype.getStatus = function () {
    return this.statusElt.innerHTML;
};

QueueManager.prototype.setStatus = function (status) {
    this.statusElt.innerHTML = status;
};

QueueManager.prototype.setElementsDisability = function (tagName, isDisabled) {
    var ee,
        elts = document.getElementById(
            'netflix-queue-sorter').getElementsByTagName(tagName);
    for (ee = 0; ee < elts.length; ee += 1) {
        if (isDisabled) {
            elts[ee].setAttribute('disabled', 'disabled');
        } else {
            elts[ee].removeAttribute('disabled');
        }
    }
};

// Mode for when an operation is in progress.
QueueManager.prototype.switchToBusyMode = function (button) {
    var elts, ee;

    // Highlight current sort button.
    // (Don't display the button text anywhere else as it's user entered text
    // and so we cannot control the length.  Use visual indication instead.)
    if (undefined !== button) {
        button.setAttribute('class', 'active');
    }

    // Disable all UI buttons and inputs.
    this.setElementsDisability('button', true);
    this.setElementsDisability('input', true);

    // Hide all icons but remember icon display states so we can restore later.
    elts = document.getElementsByClassName('nqs-icon-link');
    for (ee = 0; ee < elts.length; ee += 1) {
        this.iconDisplayStates[elts[ee].getAttribute('id')] =
                elts[ee].style.display;
        elts[ee].style.display = 'none';
    }

    // Show cancel button.
    document.getElementById('nqs-icon-cancel').style.display = 'block';
};

// Mode for when sort can no longer be cancelled.
QueueManager.prototype.switchToNoMoreCancelMode = function () {
    // Hide cancel button.
    document.getElementById('nqs-icon-cancel').style.display = 'none';
    document.getElementById('nqs-icon-cancel-disabled').style.display =
            'block';
};

QueueManager.prototype.switchToUserMode = function () {
    var elts, ee;

    // Remove active button indication.
    elts = document.getElementById(
            'netflix-queue-sorter').getElementsByTagName('button');
    for (ee = 0; ee < elts.length; ee += 1) {
        elts[ee].removeAttribute('class');
    }

    // Restore icon display states to what it was before the sort.
    // Note: this will also hide the cancel button.
    elts = document.getElementsByClassName('nqs-icon-link');
    for (ee = 0; ee < elts.length; ee += 1) {
        elts[ee].style.display = this.iconDisplayStates[
                elts[ee].getAttribute('id')];
    }

    // Enable all UI buttons and inputs.
    this.setElementsDisability('button', false);
    this.setElementsDisability('input', false);
};

// This function is called by each of the sort buttons and does any work
// necessary except for the actual sort, which is done by doSort().
QueueManager.prototype.prepSort = function (evt) {
    var button = evt.target || window.event.source,
        // TODO: FUTURE: Opera gets a parse error on the next line.
        configObj = JSON.parse(button.getAttribute('nqs-config')),
        sortCommandConfig,
        retrievers,
        elts,
        ii,
        fieldsToRetrieve,
        callback;

    if (this.isDebug) {
        this.debug('prepSort: ' + JSON.stringify(configObj));
    }

/* TODO: NOW: no longer needed? 
    if (window.location.href.indexOf('movies.netflix.com') > 0) {
        // Movies.netfix.com does not return new sort ordering immediately.
        // Best results are on www.netflix.com
        // TODO: FUTURE: Revisit this to see if Netflix fixed this.
        if (confirm('Sorting works best on www.netflix.com.\nPress OK to go ' +
                'there, or Cancel to stay where you are.')) {
            if (QueueManager.QUEUE_INSTANT === this.getQueueId()) {
                window.location = 'http://www.netflix.com/Queue?inqt=wn&lnkctr=queueTab-ELECTRONIC';
            } else {
                window.location = 'http://www.netflix.com/Queue?inqt=disc&lnkctr=queueTab-DISC';
            }
        }
        return;
    }
*/

    // Hide Netflix' "Your Queue has been reordered" message.
    elts = document.getElementsByClassName('svfmsg-s');
    for (ii = 0; ii < elts.length; ii += 1) {
        elts[ii].style.display = 'none';
    }

    if (false === this.validateUserInput()) {
        // Still in user mode so no need to switch back.
        return;
    }

    // A new sort is starting.
    this.cancelled = false;

    // We're going to change the status, so clear any timer associated with it.
    if (undefined !== this.clearStatusTimerId) {
        clearTimeout(this.clearStatusTimerId);
    }

    this.switchToBusyMode(button);

    // Now process the sort, if any.
    for (ii = 0; ii < configObj.length; ii += 1) {
        if ('sort' === configObj[ii].command) {
            sortCommandConfig = configObj[ii];
        }
    }

    if (undefined === sortCommandConfig) {
        // No sort, just a change to the row order.
        // This is quick, and to avoid confusion, do not set a status message.
        // Note: row order is always added to queue data automatically.
        // TODO: NOW: better is to add 'order' as a field to shuffle/rev to
        //       avoid this IF, or change it to test for empty fields obj.
        //       Be careful not to extract any more fields than we really need.
        fieldsToRetrieve = ['order'];
        retrievers = [];
    } else {
        this.setStatus('[Retrieving data...]');

        if (this.isDebug) {
            this.debug('\nFetch queue data retrievers need.');
        }

        // Before determining the retrievers involved in this sort, we need to
        // do something else first.  If it turns out some data points for some
        // movies could not be retrieved from the queue itself, they'll need to
        // be retrieved from backup sources.  The backup sources are other
        // retrievers which may need specific queue fields to operate.  So, to
        // remedy this we can do one of two things:
        // 1. Rather than finding out later that we need to invoke additional
        //    retrievers that need queue fields we haven't retrieved yet, just
        //    add all backup fields when determining the retrievers we need,
        //    and before calling a retriever check if we really need to invoke
        //    it (we may not need to if the backup field is not needed after
        //    all).
        // 2. Always retrieve all fields from the queue so that this cannot
        //    happen. If it turns out we need to retrieve the backup fields, we
        //    can just add those retrievers to the list of retrievers, if they
        //    are not in the list already.
        // Go with #2.  We need to do a lot less bookkeeping that way and it is
        // also more in line with all other retrievers where for caching
        // purposes we always fetch all fields rather than the ones used in the
        // sort.  (The bookkeeping is: keep track of the queue fields a
        // retriever needs to operate (so the manager can make sure to pass
        // that data to the retriever regardless of what fields are being
        // sorted on) and some set operation to merge the queue fields all
        // retrievers need to operate with the actual fields being sorted on.)

        // Determine the retrievers involved in this sort.
        retrievers = [];
        for (ii = 0; ii < this.allNonQueueRetrievers.length; ii += 1) {
            if (this.allNonQueueRetrievers[ii].canRetrieveData(
                    sortCommandConfig.fields)) {
                retrievers.push(this.allNonQueueRetrievers[ii]);
            }
        }

        // Always retrieve all queue fields per #2 above.
        fieldsToRetrieve = this.allQueueFieldsArray;
    }

    callback = function (data) {
        this.retrieveQueueDataCallback(data, configObj, retrievers);
    };

    // Now retrieve queue data.
    // Note: passing undefined for "cachedData" and "checkin" args as
    // queue should not use it.
    this.retrieveData(fieldsToRetrieve, undefined, undefined, callback);
};

QueueManager.prototype.doConfigure = function () {
    // TODO: NOW: finish implementation
    alert('Comming soon: a UI for you to add your own sort buttons.');
    return;

    var controlsUiElt = document.getElementById('nqs-controls'),
        buttonsUiElt = document.getElementById('nqs-buttons'),
        configUiElt = document.getElementById('nqs-config');

    controlsUiElt.style.display = 'none';
    buttonsUiElt.style.display = 'none';
    configUiElt.style.display = 'block';

    // TODO: FUTURE: add option for preferred format (HD, DVD, Blue-ray) for
    //       DVD queue as details page could have different values for each
    //       format (e.g. length).
};

QueueManager.prototype.doCancelSort = function () {
    var self = this;

    this.cancelled = true;
    this.switchToNoMoreCancelMode();
    this.setStatus('[Cancelling...]');

    // Now wait for all retrievers to finish.
    setTimeout(function () {
        self.switchToUserMode();
        self.setStatus('[Cancelled.]');

        // Clear status message after a few seconds.
        // Note: to avoid a race condition where user starts and cancels another
        // sort before the timer runs out, we're saving the timer ID so that we can
        // cancel it if a new sort is started.
        self.clearStatusTimerId = setTimeout(function () {
            self.clearStatusTimerId = undefined;
            self.setStatus('');
        }, 2500);
    }, 2 * Retriever.XHR_DELAY);
};

// Reverts back to the queue order before the last sort.
QueueManager.prototype.doUndoSort = function () {
    var trElts,
        origOrder,
        newData = [],
        id,
        ee;

    this.switchToBusyMode();

    origOrder = this.getCacheValue('undo-order-' + this.getQueueId());

    // In order to call this.commitSort, we need an array of objects each
    // containing a single "order" property representing the original order.
    trElts = this.getListTrElts();
    for (ee = 0; ee < trElts.length; ee += 1) {
        id = this.extractMovieId(trElts[ee]);
        newData.push({ order: ee + 1, newOrder: origOrder[id] });
    }

    // Now sort by newOrder to restore the previous order.
    newData = newData.sort(function (a, b) {
        return a.newOrder - b.newOrder;
    });

    // Also we need to make sure the row filter is ignored.
    this.applyToSelectedRowsOnly(false);

    this.commitSort(newData);
};

// Makes sure button config is correct.
QueueManager.prototype.assertCorrectButtonConfig = function (config) {
    var ok = true,
        ii,
        num;

    if (undefined !== config.id &&
            undefined !== config.text &&
            undefined !== config.title &&
            undefined !== config.queues &&
            undefined !== config.config) {
        for (ii = 0; ii < config.config.length; ii += 1) {
            if (undefined === config.config[ii].command) {
                ok = false;
            } else if ('sort' === config.config[ii].command &&
                    undefined !== config.config[ii].fields &&
                    undefined !== config.config[ii].sortFns &&
                    undefined !== config.config[ii].dirs) {
                num = config.config[ii].fields.length;
                if (num !== config.config[ii].sortFns.length ||
                        num !== config.config[ii].dirs.length) {
                    ok = false;
                }
            }
        }
    } else {
        ok = false;
    }

    if (!ok) {
        throw new Error('Button config incorrect: ' + JSON.stringify(config));
    }
};

QueueManager.prototype.getDefaultButtonConfig = function () {
    return [
        // Config must be of the form:
        // [
        //     {command: reverse|shuffle|sort},
        //     {command: ...},
        //     ...
        // ]
        // where if command is sort: fields, sortFns, dirs, cacheKey and
        // defaultOrder are additional options.  Only pass defaultOrder if
        // customOrderSortFn is being used.  Only pass cacheKey if that default
        // order can be customized by the user.
        {
            id: 'd10',
            text: 'Shuffle',
            title: 'Shuffle your queue into a random order',
            queues: [QueueManager.QUEUE_INSTANT, QueueManager.QUEUE_DVD],
            config: [{command: 'shuffle'}]
        },
        {
            id: 'd20',
            text: 'Reverse',
            title: 'Reverse the current list order',
            queues: [QueueManager.QUEUE_INSTANT, QueueManager.QUEUE_DVD],
            config: [{command: 'reverse'}]
        },
        {
            id: 'd30',
            text: 'Title',
            title: 'Sort your queue alphabetically by movie title',
            queues: [QueueManager.QUEUE_INSTANT, QueueManager.QUEUE_DVD],
            config: [{command: 'sort', fields: ['title'], sortFns: ['defaultSortFn'], dirs: [QueueManager.SORT_ASC]}]
        },
        {
            id: 'd40',
            text: 'Instant \u2191',   // Use Unicode in stead of HTML entity.
            title: 'Move instantly playable movies to the top of your queue',
            queues: [QueueManager.QUEUE_DVD],
            // Note: Chrome needs 'order' as secondary sort to keep current order.
            config: [{command: 'sort', fields: ['playability', 'order'], sortFns: ['customOrderSortFn', 'defaultSortFn'], dirs: [QueueManager.SORT_DESC, QueueManager.SORT_ASC], defaultOrder: ['NOW', '{date}']}]
        },
        {
            id: 'd50',
            text: 'Instant \u2193',   // Use Unicode in stead of HTML entity.
            title: 'Move instantly playable movies to the bottom of your queue',
            queues: [QueueManager.QUEUE_DVD],
            // Note: Chrome needs 'order' as secondary sort to keep current order.
            config: [{command: 'sort', fields: ['playability', 'order'], sortFns: ['customOrderSortFn', 'defaultSortFn'], dirs: [QueueManager.SORT_ASC, QueueManager.SORT_ASC], defaultOrder: ['NOW', '{date}']}]
        },
        {
            // Add sort by title to make sure series discs are in asc order.
            id: 'd60',
            text: 'Star Rating',
            title: 'Sort your queue by star rating from high to low',
            queues: [QueueManager.QUEUE_INSTANT, QueueManager.QUEUE_DVD],
            config: [{command: 'sort', fields: ['starRating', 'title'], sortFns: ['defaultSortFn', 'defaultSortFn'], dirs: [QueueManager.SORT_DESC, QueueManager.SORT_ASC]}]
        },
        {
            // Add sort by title to make sure series discs are in asc order.
            id: 'd70',
            text: 'Genre',
            title: 'Sort your queue alphabetically by genre',
            queues: [QueueManager.QUEUE_INSTANT, QueueManager.QUEUE_DVD],
            config: [{command: 'sort', fields: ['genre', 'title'], sortFns: ['defaultSortFn', 'defaultSortFn'], dirs: [QueueManager.SORT_ASC, QueueManager.SORT_ASC]}]
        },
        {
            // Add sort by title to make sure series discs are in asc order.
            id: 'd80',
            text: 'TV/Movies',
            title: 'Move the television genre above movie genres and sort by title',
            queues: [QueueManager.QUEUE_INSTANT, QueueManager.QUEUE_DVD],
            config: [{command: 'sort', fields: ['genre', 'title'], sortFns: ['customOrderSortFn', 'defaultSortFn'], dirs: [QueueManager.SORT_DESC, QueueManager.SORT_ASC], cacheKey: 'sort-order-custom-genre-' + this.getQueueId(), defaultOrder: ['Television']}]
        },
        {
            // Asc direction for availability sort intuitively means longer
            // and longer away from "now", so we want desc sort here.
            id: 'd90',
            text: 'Availability',
            title: 'Move the most desirable movies to the top of your queue',
            queues: [QueueManager.QUEUE_INSTANT, QueueManager.QUEUE_DVD],
            // Note: Chrome needs 'order' as secondary sort to keep current order.
            config: [{command: 'sort', fields: ['availability', 'order'], sortFns: ['customOrderSortFn', 'defaultSortFn'], dirs: [QueueManager.SORT_DESC, QueueManager.SORT_ASC], cacheKey: 'sort-order-availability-' + this.getQueueId(), defaultOrder: ['{date}', 'VERY LONG WAIT', 'LONG WAIT', 'SHORT WAIT', 'N/A']}]
        },
        {
            // Add sort by title to make sure series discs are in asc order.
            id: 'd100',
            text: 'Length',
            title: 'Sort your queue by length from short to long',
            queues: [QueueManager.QUEUE_INSTANT, QueueManager.QUEUE_DVD],
            config: [{command: 'sort', fields: ['length', 'title'], sortFns: ['defaultSortFn', 'defaultSortFn'], dirs: [QueueManager.SORT_ASC, QueueManager.SORT_ASC]}]
        },
        {
            // Add sort by title to make sure series discs are in asc order.
            id: 'd110',
            text: 'Year',
            title: 'Sort your queue by year from new to old',
            queues: [QueueManager.QUEUE_INSTANT, QueueManager.QUEUE_DVD],
            config: [{command: 'sort', fields: ['year', 'title'], sortFns: ['defaultSortFn', 'defaultSortFn'], dirs: [QueueManager.SORT_DESC, QueueManager.SORT_ASC]}]
        },
        {
            // Format sort for Instant queue.
            id: 'd120',
            text: 'Format',
            title: 'Move high-definition movies above standard-definition movies',
            queues: [QueueManager.QUEUE_INSTANT],
            // Note: Chrome needs 'order' as secondary sort to keep current order.
            config: [{command: 'sort', fields: ['mediaFormat', 'order'], sortFns: ['customOrderSortFn', 'defaultSortFn'], dirs: [QueueManager.SORT_DESC, QueueManager.SORT_ASC], cacheKey: 'sort-order-mediaformat-' + QueueManager.QUEUE_INSTANT, defaultOrder: ['HD', 'STREAMING']}]   // Favor HD over SD formats.
        },
        {
            // Format sort for DVD queue.
            id: 'd130',
            text: 'Format',
            title: 'Move high-definition movies above standard-definition movies',
            queues: [QueueManager.QUEUE_DVD],
            // Note: Chrome needs 'order' as secondary sort to keep current order.
            config: [{command: 'sort', fields: ['mediaFormat', 'order'], sortFns: ['customOrderSortFn', 'defaultSortFn'], dirs: [QueueManager.SORT_DESC, QueueManager.SORT_ASC], cacheKey: 'sort-order-mediaformat-' + QueueManager.QUEUE_DVD, defaultOrder: ['BLU-RAY', 'DVD']}]   // Favor HD over SD formats.
        },
        {
            // Add sort by title to make sure series discs are in asc order.
            id: 'd140',
            text: 'Language',
            title: 'Sort your queue alphabetically by language',
            queues: [QueueManager.QUEUE_INSTANT, QueueManager.QUEUE_DVD],
            config: [{command: 'sort', fields: ['language', 'title'], sortFns: ['defaultSortFn', 'defaultSortFn'], dirs: [QueueManager.SORT_ASC, QueueManager.SORT_ASC]}]
        },
        {
            id: 'd150',
            text: 'Date Added',
            title: 'Sort your queue by the date movies were added to the queue',
            queues: [QueueManager.QUEUE_INSTANT, QueueManager.QUEUE_DVD],
            // Note: Chrome needs 'order' as secondary sort to keep current order.
            config: [{command: 'sort', fields: ['dateAdded', 'order'], sortFns: ['customOrderSortFn', 'defaultSortFn'], dirs: [QueueManager.SORT_ASC, QueueManager.SORT_ASC], defaultOrder: ['{date}']}]
        },
        {
            // Add sort by title to make sure series discs are in asc order.
            id: 'd160',
            text: 'Star/Avg Rating',
            title: 'Sort your queue by star rating (primary) and by average rating (secondary) from high to low',
            queues: [QueueManager.QUEUE_INSTANT, QueueManager.QUEUE_DVD],
            config: [{command: 'sort', fields: ['starRating', 'avgRating', 'title'], sortFns: ['defaultSortFn', 'defaultSortFn', 'defaultSortFn'], dirs: [QueueManager.SORT_DESC, QueueManager.SORT_DESC, QueueManager.SORT_ASC]}]
        },
        {
            // Add sort by title to make sure series discs are in asc order.
            id: 'd170',
            text: 'Average Rating',
            title: 'Sort your queue by average rating from high to low',
            queues: [QueueManager.QUEUE_INSTANT, QueueManager.QUEUE_DVD],
            config: [{command: 'sort', fields: ['avgRating', 'starRating', 'title'], sortFns: ['defaultSortFn', 'defaultSortFn', 'defaultSortFn'], dirs: [QueueManager.SORT_DESC, QueueManager.SORT_DESC, QueueManager.SORT_ASC]}]
        }
    ];
};

QueueManager.prototype.loadButtonConfig = function () {
    var defaultButtonConfig = this.getDefaultButtonConfig(),
        userButtonConfig,
        buttonOrder,
        lookup = {},
        config = [],
        self = this,
        ii;

    // Note: there cannot be one button config containing everything, as that
    // would make it harder to make new canned buttons show up.  So, keep
    // canned and default buttons separate.  And add button order.

    // Get user-defined buttons.
    userButtonConfig = this.getCacheValue('user-button-config', []);

    // Get user-defined button visibility and/or ordering.
    // Note: invisible buttons have order -1; new buttons do not have an order
    // so they can be detected as new, and shown.
    buttonOrder = this.getCacheValue('user-button-display-order-' +
            this.getQueueId(), []);

    function assertCorrectButtonConfig(config) {
        for (ii = 0; ii < config.length; ii += 1) {
            self.assertCorrectButtonConfig(config[ii]);
        }
    }

    function addToLookup(config) {
        for (ii = 0; ii < config.length; ii += 1) {
            if (undefined !== lookup[config[ii].id]) {
                throw new Error('Button ' + config[ii].id + ' already defined');
            }
            lookup[config[ii].id] = config[ii];
        }
    }

    // Do a sanity test on the config objects.
    assertCorrectButtonConfig(defaultButtonConfig);
    assertCorrectButtonConfig(userButtonConfig);

    // Create lookup.
    addToLookup(defaultButtonConfig);
    addToLookup(userButtonConfig);

    // Create the real config.
    if (undefined === buttonOrder || 0 === buttonOrder.length) {
        // User never customized buttons; use default buttons.
        config = defaultButtonConfig;
    } else {
        for (ii = 0; ii < buttonOrder.length; ii += 1) {
            if (undefined === lookup[buttonOrder[ii]]) {
                throw new Error('Button ' + buttonOrder[ii] + ' not defined');
            }
            config.push(lookup[buttonOrder[ii]]);
        }
    }

    return config;
};

QueueManager.prototype.getUiContainerCssTemplate = function () {
    return '' +
        // Ui container.
        '#netflix-queue-sorter {' +
            'margin-top: 1em;' +
            'border: 1px solid #666666;' +
            'padding: 0.5em 1em 1em;' +
            'color: #666666;' +
            'font: 8.5pt/1em verdana,arial,sans-serif;' +
            '{extraContainerStyle}' +   // Unsupported UI needs an extra style.
        '}' +
        '#netflix-queue-sorter legend {' +
            'color: #666666;' +
            'font-size: smaller;' +
        '}';
};

QueueManager.prototype.getUiCssTemplate = function () {
    var css = this.getUiContainerCssTemplate();

    // Remove variable.
    css = this.substituteVars(css, {
        extraContainerStyle: ''
    });

    return css +
        // Controls go on the left.
        '#netflix-queue-sorter #nqs-controls {' +
            'float: left;' +
        '}' +
        '#netflix-queue-sorter .nqs-icon-link {' +
            'width: 32px;' +
            'height: 32px;' +
            'cursor: pointer;' +
            'float: left;' +
            'margin-right: 1em;' +
        '}' +
        // Icons: thanks, http://www.iconspedia.com/pack/pretty-office-2038/
        // and http://www.iconspedia.com/pack/pretty-office-5-2835/
        // Base64: thanks, http://www.greywyvern.com/code/php/binary2base64
        // TODO: FUTURE: design own icons as we're not allow to resize these
        '#netflix-queue-sorter .nqs-icon-link#nqs-icon-cancel {' +
            'background-image: url("data:image/png;base64,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%3D");' +
            'display: none;' +   // Don't show unless a sort is in progress.
        '}' +
        '#netflix-queue-sorter .nqs-icon-link#nqs-icon-cancel-disabled {' +
            'background-image: url("data:image/png;base64,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");' +
            'display: none;' +   // Don't show unless a sort is in progress.
            'cursor: default;' +   // Not clickable, so no cursor.
        '}' +
        // Config button is shown by default.
        '#netflix-queue-sorter .nqs-icon-link#nqs-icon-configure {' +
            'background-image: url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAFBElEQVRYw7VXXWhcRRSevdlks8lmN7sbaIzpRgJSWxGrWASLUijogy+iCK1oVay1D1YM+OCL9kf0SUEK0lZfNFGKQgMaMSFCZANKqKAVWiQ+ZdP8bjab7E+y2d38+H2XOet43STddB34mLkz557zzTnnzpzrGh8fV2ZzuVwqm81amUzmvo2NjUNAeG1t7WqhUBhGn8azIqrVXCRAo2xUjLGVTqffXlxcfH99fd2etyxL1dbWjheLxQ+WlpYuqSo2VywWU4lEQoVCIRqxJ2dmZoIgcBZkTgkxoqGhgf27IPGekK4KgbGxMdsL7e3tqr6+Xk1PTysQ4PorMHgefQMJ0CMgkVtZWdmD8c0dGYQdQYkAw4Bdqbq6OtXR0aEQApVMJm0BGDoI431AkCRqamo4fXh1dXVoO0OmQdkAcknl83m1vLxs9zYBAruyBWiARORZG/1JJ6QoPoi1X8oZ1KQVEtYGDdIYN8iezyBfSmQS2DU7O3sSLj+HyQ15MRAIqKamJns8Pz//K/qH9EtxYC/GSTM/kKC2YtkhIc9cE72m+20C0Wj0buzwL7fb3YdP72UIz1MhjXd2dlLRE6Ojo99jV26+ALk/IHMAyovcKY0IxIhzbK7/J1SDg4MPw+AIvwAk2J84A57P5XK/MeMjkcj9SMg+eGc3WdOgx+NRXq93aGFh4SXs7ibJmgZNo7dK4B4ouQHlFr/3xsbGDJ6/wtiDPHgWhHySRJJI8ILy+/0xeOxFrEfNmFdMYGBggB//z1B+QAwwEUWZGWeTBFtzc3MeXuiCNy6YJCoi0N/fT6UMww9AyGlsM9AgAU+Q8MW5ubk3YSRv5kUlBKhsL/AOxk8CfiABRIEfgTeAfU4C7KmU+eLz+Ybj8fhRhG1KSFRKQHAnnluASawnKIQXI5i/jLlHTOMCKucJGgwGb8ATR5AX1yUkOyGgnDeejq0Xa+eB4+XCQRnmTktLywKS81WcHVeEXLUICBiODyFX6wyH9CBBubO41M6YoagWAeIw5D6HTLvTuHgDXwhz48rk5OQJnCtJma8WAeIu4AvIP1bOE9wxkxPeuI7D7IVUKnWt7KWFc6CUzRUSoBEP+o/xzslyoSAJ5kVbW1sKp+lr+Eq+1rfpPwR6e3vt20+OWicBIbcJAenP6U/4XyRM4Fjnbfg68uITnril67q7u9t+4F1AdubdLcrkBtuMgL4Jj0D+IuQDzvdlDE/QzoWJiYkuzOdtvT09PaWdblVYyNj8vk0imsR+rH8J3FuueKUsSz9gGCSO4aaNlQhU2mTn5n2vSYRA4FOIPON8B4S+g3wWx/dz8MYEkvOpHRMwieAzs8Eqis9652eA00aVFIX7D7W2tlrYfRzjMG7ej26bgIRIiLCeZK/X6IXPgCAKnMvAWyh8T4+MjJzQefX4bRMwG7ObOcLaj1U1yzI8P4Clb8Ph8G6cC9mpqSkfZWC8B546VlUCJhGGgQToERSkHYg9DT3KNbQh9E8jDKn/hYDzH4DJiQvKApEuTOdR1l1CIhbt80cTIK06wKNRr+caAVZMzCoGu0mvb9XyQMZ4pwgSS0BB1xgF7N7NApxVOAncAaGjwH5gFxAA/CyAtUG3ocyrCW3VikDOJABkdZ8G+Ms1DfwOfEMCNPIgEAFCLPUAH3/HNBFRFNCe2e7XmLIrQMqQXdSeyep5FjpjwLXtcsAylHLnNbd6POgdC4H1zQT/Br+QLX7mZr6IAAAAAElFTkSuQmCC");' +
        '}' +
        '#netflix-queue-sorter .nqs-icon-link#nqs-icon-undo {' +
            'background-image: url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAExklEQVRYw72X60+TZxjG+T/2ZYlxm87FRQbbmI455CCKTjbnB7No4hKyb0tMiIIoE4EyTyAHObZAaaG2HFqlSMuptNBCEQQKGREVYVo7KQi1hQLl2vM8DQ2HVlpAPvzSN33f977u57rv5/D6AfDzFaNlDvzBCUzOOrCR95fj8wvS4be4pPoX0fy+TYv7lIDhjQ0cvQlnJIOILnsM4WPj9iRgnXcwu88rn+NESQ9+LiOU9mBuYfHDJ9A6akFi20ucJCOO5ncjuvQRI6f9+ZaIe0yANllWzxvEyIZwjNdFRLvxU7GeEVWow1Pzuw+XAG2yuOZRIqzHCSpa0kWEOxBVRNHicJ4av1f1Ikbah7TWp6j+5z/Q/thoSVwXL6bs4OiMOF3RiygqXtKJY1wnRwraCWpE5KsQcVeFkOxGhNxRIjhDgQO363AoU4Ezok4kKgagGjHDvuD99HRdJKjGcKRIxwSP83Q4Wkhpx+ECDRt1WG4zwrKbneJZCvxIxIMz6hBMEth/8wG+/bsGAZxqBKRIcKpURfrkCUyWWXidwFlxPxOlNkcWtiEyrxXheS0Iz2lBWE6ja9QHM+vxw+2HbOQHbt1H0HUZoQZfpxE4VfgqVYx9V0X4/HIZIrLkyGsfgmPRc3lcFz2vphCZr2ZQm8PvNiGUcCizgYkeTK/H9+lyNuLvbjwgSPFNGoWMmiNBQLIE+5JFTHzv1XLs/asMuy+VYudFLk4VKfFsfBrrNuHA6ykmGprVwEbssjndabPTahmzOzDNabd/yj34J93Dl0nlTuErAuy5Uoo9CSXYFc/DZ3Fc7IgtwP7rYvS/NGPdWfBiwoqDrMGoxbUMp80yZnNgaiXD/xoVriDChEQBvqAk8LE7odglTKHXlJ0XChHEEWH83QzWXQdMlhmEZsiZ1UyY1JbVN1kMvm4Ir6esGDJNQfPMhLKOJ4itbEPgNYFLdLnwcj4hSZwrVsKrldAyO4eIzFpmM2WpvomyDo8NZXhlRkyJ0q34kiu74ngk+Ul4tRTPkfl8nHQyre+SzSE3JetOrUcjJlcPuEsirU4Pn3bDX3PlbFqx+pIRUHfWe2dswuLRiegsKXzejs8Wyp31jedCOTjq1UpX3DbgNgF/MkU3dCD5s7yZBbgs1Xq91HpyYcMnolR5J+t6b5+PyqhZIx6YJNh4Ar5yMuf+mgRO58u3LwF3s6Gg1bA9CTSSZnVXf9vc/PYkEJRcvkb8TkM3NnUs95ZzvPo14r9ky7Dp7wJvcLcc02bckg+T9zFONrHwW5XLll0ePiXceNiFLfsy8gRPY3DueBd52EEOIR9f4OIPfgOMb99/gvZawOFwYDWL5KjVMDCCwOQKJvhRLBe/5dZAquuDbdbu1WLlt7CwALPZjLGxMQwPD8NgMKC3txd6vR5arZah0WjQ1NS0AlVzE+KLJDiawsP5HCFyRTXsP51aBY2qBdo2DTrIuxQai8aksakG1aKaVNtvZmYG/f39UKvVUCgUqK2tRXV1NaqqqiAWiyESiVYgFAohEAgY4nIhKiuE7FdEoPdWP09j0Fg0Jo1NNagW1aTaLiuonfPz87Db7bDZbLBarZiensbk5OQKTCYTjEajW+i91c/TGDQWjUljU43FZafk/wGOBrExJ/6FyQAAAABJRU5ErkJggg%3D%3D");' +
            'display: none;' +   // Don't show unless a previous sort exists.
        '}' +
        '#netflix-queue-sorter .nqs-icon-link#nqs-icon-update {' +
            'background-image: url("data:image/png;base64,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%3D%3D");' +
            'display: none;' +   // Don't show unless an update is available.
        '}' +
        '#netflix-queue-sorter #nqs-status {' +
            'position: absolute;' +
            'bottom: 27px;' +
        '}' +

        // Buttons go on the right.
        '#netflix-queue-sorter #nqs-buttons {' +
            'float: right;' +
            'text-align: right;' +
            'max-width: 700px;' +
            'margin-top: 0.5em;' +
        '}' +
        '#netflix-queue-sorter #nqs-buttons button {' +
            'margin: 0pt 0pt 0.75em 0.5em;' +
        '}' +
        '#netflix-queue-sorter #nqs-buttons button.active {' +
            // On MacOS, all buttons keep their nice aqua rendering as long as
            // you don't change any of the button's properties.
            // Luckily the color property does not impact the rendering.
            'color: #B9090B;' +   // Netflix red.
        '}' +
        '#netflix-queue-sorter input {' +
            'margin: 0 0.5em;' +
        '}' +
        '#netflix-queue-sorter input#nqs-sort-limit-row-max {' +
            'margin-right: 0;' +
        '}' +
        '#netflix-queue-sorter input#nqs-use-sort-limit-rows,' +
        '#netflix-queue-sorter input#nqs-sort-limit-row-min,' +
        '#netflix-queue-sorter input#nqs-sort-limit-row-max {' +
            'float: none;' +
        '}' +

        // Config UI.
        '#nqs-config {' +
            'display: none;' +   // Hidden initially.
            'color: #333333;' +   // Netflix black.
        '}' +

        // Movie info icon, outside of #netflix-queue-sorter.
        '.nqs-movie-info-icon {' +
            'float: right;' +
            'margin-right: 1.5em;' +
            'background-image: url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAC7klEQVQ4EQXBT2tcVRyA4fecc+cmM5Ok08RkTFRQtAlduEg1VAtqXbgSKroqfoLiRhdFcFFcuHDRrQgiKiLuXYgUVFDEohRRLKhUW5AmwYY2TTqZzL3n/P74POHBN7+HEJmqu4RU0+9Nz8/P9F6a69fPdqp4zMxKW8of9w6ar7du37skJTcqDcEFgAoAQMwZHqnPPrQ0826x+PA4Q2kcE6GKenrQr18b9AZXrm/vvrG7b5erAAAVgJqzMpg+vzSYvnjj1gFZE3XdQTyCKa6Z7ZyZmWLjkeHcJdf27N7o8KsUA9HMOdqvz8x1Oxevbe7RtIUUDJHCcrcwPyW4KSk6++OGv7d2Z5fn+x/XVTxeihBxqWa71Vs3d/ZxU3AlS8Gk5b1XFjn31CyjSYuqEHHaUti+MxoO+p3zMVqv6iQ/NZ60G02rdOqACoRkZA9c+HKTu4dKJyhmhmkhuDIaF2KverET+TxG95fHkyaZKyotqhkpBVR4dWOR51dnmbQtWjKqGVXBtDCeNItutl61JT9BiMRYoTjuhnph0JviheMDqggiGXEDV0wFd6VpJOI2rHLO/8aYnkkJ3B2LihmoBsTAAS0ZdcddMVXUBJMCpgfRVb4wLYhmVDJaMkUyqgUCOI5oi0qLSkG1YFJwlZGZXq3c7RsXvR7NH5VkhBBRc9QqYgCCo1oo7gQ33AxXwUy/A36MIrKvqh+YZlwyJhmTQtNmDouRi1Byi0vBpOCaUS0UkffHWXbS0SfPkMV+2m9sNaCPR5yA0Uxaftve59urm9zeHRFcURMOWmGS9e37uuGjp1ci4ZNPP+PaXeevXUu/7+g7N0e8rh57dQVtK8QYqFIkq9MJduvEMF5YW0gfnlxJLHahqhNhfSmcPrmcHhsdS9t/3tErl7f0uRt7xkFwQnAGtbO2EPXUA50f1hZSVUfOjQv/TISfK3NolV6r3B8DR04M0y/rw/TruDAzzu4hwGwdQq8TxmoeGmG1gT3gPyD9DyOkBC+EG8GUAAAAAElFTkSuQmCC");' +
            'width: 16px;' +
            'height: 16px;' +
            'display: block;' +
            'cursor: pointer;' +
        '}';
};

QueueManager.prototype.getUiUnsupportedCssTemplate = function () {
    var css = this.getUiContainerCssTemplate();

    // Add extra style.
    return this.substituteVars(css, {
        extraContainerStyle: 'text-align: center;'
    });
};

QueueManager.prototype.getUiHtmlTemplate = function () {
    return '' +
        '<fieldset id="netflix-queue-sorter">' +
            '<legend align="center">Netflix Queue Sorter v2.2</legend>' +
            '<div id="nqs-controls">' +
                // JSLint does not like these javascript hrefs (true, they do
                // not follow the semantic layered markup rules), but at least
                // they don't move the page up to the top, as # does.
                '<a href="javascript:void(0)" id="nqs-icon-configure" class="nqs-icon-link" title="Configure"></a>' +
                '<a href="http://userscripts.org/scripts/source/35183.user.js" id="nqs-icon-update" class="nqs-icon-link" title="Update Available"></a>' +
                '<a href="javascript:void(0)" id="nqs-icon-undo" class="nqs-icon-link" title="Undo Last Sort"></a>' +
                '<a href="javascript:void(0)" id="nqs-icon-cancel" class="nqs-icon-link" title="Cancel Sort"></a>' +
                '<span id="nqs-icon-cancel-disabled" class="nqs-icon-link"></span>' +
                '<div id="nqs-status"></div>' +
            '</div>' +
            '<div id="nqs-buttons">' +
                '{buttons}' +   // Buttons will be added later.
                '<div>' +
                    '<input type="checkbox" id="nqs-use-sort-limit-rows">' +
                    '<label for="nqs-use-sort-limit-rows">Only apply sort to rows</label>' +
                    '<input type="text" size="5" id="nqs-sort-limit-row-min">' +
                    '<label for="nqs-use-sort-limit-rows">through</label>' +
                    '<input type="text" size="5" id="nqs-sort-limit-row-max">' +
                '</div>' +
            '</div>' +
            '<div id="nqs-config">' +   // TODO: NOW: should be <form>?
// TODO: NOW: hook these options up throughout the code.
                '<p>' +
                    '<input type="checkbox" id="auto-update">' +
                    '<label for="auto-update" title="If unchecked, you will need to press the Update Queue button yourself">Automatically update queue after sort</label>' +
                '</p>' +
                '<p>' +
                    '<input type="checkbox" id="use-cache">' +
                    '<label for="use-cache" title="If unchecked, will slow down sort performance but will avoid stale data and save browser memory">Store retrieved movie info</label>' +
                '</p>' +
                '<p>' +
                    '<input type="checkbox" id="ignore-articles">' +
                    '<label for="ignore-articles" title="If unchecked, title sort will not follow Netflix\'s title sort behavior">Ignore articles for title sort</label>' +
                '</p>' +
// TODO: NOW: force refresh == !use cache?
// TODO: FUTURE: if use-cache is on, show "force refresh" checkbox in UI.
                '<p>' +
                    '<input type="checkbox" id="force-refresh">' +
                    '<label for="force-refresh" title="If unchecked, TODO: NOW">Always reload previously retrieved data to ensure accuracy</label>' +
                '</p>' +
                '<p>' +
                    '<input type="checkbox" id="show-movie-info-icons">' +
                    '<label for="show-movie-info-icons" title="If unchecked, retrieved movie info will not be visible, but will make loading the queue page faster">Show movie info icons</label>' +
                '</p>' +

    // TODO: NOW: add options for custom sort orders for those buttons that
    //       use them.

    // TODO: NOW: add options to managing button display order and visibility

                '<p>' +
                    '<input type="checkbox" id="debug-mode">' +
                    '<label for="debug-mode" title="See http://wiki.greasespot.net/GM_log for how to make debug messages appear">Debug mode</label>' +
                '</p>' +
// TODO: FUTURE: allow custom slowness indicator?
                '<p>' +
                    'Sort button slowness indicator: <input type="text" id="slowness-indicator" size="5">' +
                '</p>' +
                '<p>' +
                    '<button>Clear stored movie info</button>' +
                    // TODO: FUTURE: allow clearing of specific cached items
                '</p>' +
                '<button>Save</button><button>Cancel</button>' +
            '</div>' +
        '</fieldset>';
};

QueueManager.prototype.getUiUnsupportedHtmlTemplate = function () {
    // TODO: FUTURE: add Opera,IE here once it's supported.
    return '' +
        '<fieldset id="netflix-queue-sorter">' +
            '<legend align="center">Netflix Queue Sorter v2.2</legend>' +
            'Your browser is not supported.  Please use the latest ' +
            'version of Chrome, Firefox or Safari.' +
        '</fieldset>';
};

QueueManager.prototype.getButtonHtmlTemplate = function () {
    return '<button title="{title}" nqs-config="{config}">{text}</button>';
};

QueueManager.prototype.getMovieInfoHtmlTemplate = function () {
    // TODO: FUTURE: improve presentation; use click rather than hover?
    // TODO: PERFORMANCE: using a template for something this simple is
    //       inefficient: two elements are created in stead of one when using
    //       DOM API.
    return '<span class="nqs-movie-info-icon" title="{title}"></span>';
};

QueueManager.prototype.htmlEntityEncode = function (str) {
    var p = document.createElement('div'),
        c = document.createElement('div');

    c.setAttribute('a', str);
    p.appendChild(c);

    return p.innerHTML.match(/a=['"](.+)['"]/)[1];
};

QueueManager.prototype.getUpdateButtonText = function () {
    // Movies.n.c uses value, but www.n.c uses alt.
    return this.updateQueueButton.value ? this.updateQueueButton.value :
            this.updateQueueButton.getAttribute('alt');
};

QueueManager.prototype.couldBeSlow = function (config) {
    var ii,
        jj,
        result = false;

    for (ii = 0; ii < config.length; ii += 1) {
        if (undefined !== config[ii].fields) {
            for (jj = 0; jj < config[ii].fields.length; jj += 1) {
                if (undefined === this.allDataPointConfig[
                        config[ii].fields[jj]]) {
                    // Not a queue field.
                    result = true;
                    break;
                }
            }
        }
    }

    return result;
};

QueueManager.prototype.showUi = function (icons) {
    var cssTemplate,
        htmlTemplate,
        buttonTemplate,
        config,
        headElt,
        styleElt,
        queueForm,
        targetContainer,
        myContainer,
        queueId = this.getQueueId(),
        buttonsHtml,
        elts,
        cancelEventHandler,
        configEventHandler,
        undoEventHandler,
        sortButtonEventHandler,
        rowFilterInputEventHandler,
        couldBeSlow,
        self = this,
        ee,
        id,
        ii,
        jj;

    // Get a reference to the Netflix update queue button before adding
    // additional HTML that would make this more inefficient to do later.
    this.updateQueueButton = document.getElementById('MainQueueForm'
            ).getElementsByTagName('h2')[0].getElementsByTagName('input')[0];
    if (this.isDebug) {
        this.debug('showUi: update button: ' + this.getUpdateButtonText());
    }

    // The latest FF,Safari,Chrome,Opera all have a native JSON object.
    // Any other browser is not supported.
    if ("undefined" === typeof JSON) {
        cssTemplate = this.getUiUnsupportedCssTemplate();
        htmlTemplate = this.getUiUnsupportedHtmlTemplate();
    } else {
        cssTemplate = this.getUiCssTemplate();
        htmlTemplate = this.getUiHtmlTemplate();
        config = this.loadButtonConfig();
        buttonTemplate = this.getButtonHtmlTemplate();

        buttonsHtml = '';
        for (ii = 0; ii < config.length; ii += 1) {
            // Only add button if it's defined for the current queue.
            for (jj = 0; jj < config[ii].queues.length; jj += 1) {
                if (queueId === config[ii].queues[jj]) {
                    couldBeSlow = this.couldBeSlow(config[ii].config);
                    buttonsHtml += this.substituteVars(buttonTemplate, {
                        config: this.htmlEntityEncode(
                                JSON.stringify(config[ii].config)),
                        title: config[ii].title,
                        text: couldBeSlow ? config[ii].text + ' *' : 
                                config[ii].text

                    });
                    break;
                }
            }
        }

        htmlTemplate = this.substituteVars(htmlTemplate, {
            buttons: buttonsHtml
        });
    }

    // Add CSS.
    headElt = document.getElementsByTagName('head')[0];
    styleElt = document.createElement('style');
    styleElt.setAttribute('type', 'text/css');
    styleElt.innerHTML = cssTemplate;
    headElt.appendChild(styleElt);

    if (this.isDebug) {
        this.debug('showUi: CSS added');
    }

    // Add HTML.
    queueForm = document.getElementById('MainQueueForm');
    targetContainer = queueForm.getElementsByTagName('h2')[0];

    // Make our div extend to the right edge of the Update button.
    targetContainer.style.paddingRight = '0.5em';

    myContainer = document.createElement('div');
    myContainer.innerHTML = htmlTemplate;
    targetContainer.appendChild(myContainer);

    if (this.isDebug) {
        this.debug('showUi: HTML added');
    }

    // Hook up user inputs.
    // Note: always search within our container to reduce conflict with
    // Netflix-defined elements.
    // Note: GM doesn't like setting the onclick property directly; use DOM API.
    // Note: event handlers are defined outside the loop to please JSLint.
    cancelEventHandler = function (event) {
        self.doCancelSort.call(self, event);
    };
    configEventHandler = function (event) {
        self.doConfigure.call(self, event);
    };
    undoEventHandler = function (event) {
        self.doUndoSort.call(self, event);
    };
    elts = myContainer.getElementsByClassName('nqs-icon-link');
    for (ee = 0; ee < elts.length; ee += 1) {
        id = elts[ee].getAttribute('id');
        switch (id) {
        case 'nqs-icon-cancel':
            //elts[ee].onclick = cancelEventHandler;
            this.customAddEventListener(elts[ee], 'click', cancelEventHandler);
            break;
        case 'nqs-icon-cancel-disabled':
            // No event listener.
            break;
        case 'nqs-icon-configure':
            //elts[ee].onclick = configEventHandler;
            this.customAddEventListener(elts[ee], 'click', configEventHandler);
            break;
        case 'nqs-icon-update':
            // Already hooked up nqs-icon-update.
            break;
        case 'nqs-icon-undo':
            //elts[ee].onclick = undoEventHandler;
            this.customAddEventListener(elts[ee], 'click', undoEventHandler);
            break;
        default:
            throw new Error('Unexpected icon-link ID: ' + id);
        }
    }

    sortButtonEventHandler = function (event) {
        event.preventDefault();   // Prevent auto-submit of the Netflix form.
        self.prepSort.call(self, event);
    };
    elts = myContainer.getElementsByTagName('button');
    for (ee = 0; ee < elts.length; ee += 1) {
        //elts[ee].onclick = sortButtonEventHandler;
        this.customAddEventListener(elts[ee], 'click', sortButtonEventHandler);
    }

    // Set previously saved min/max values, if any.
    this.minSelectedRowIndex(this.getCacheValue('last-min-row-' +
                this.getQueueId()));
    this.maxSelectedRowIndex(this.getCacheValue('last-max-row-' +
                this.getQueueId()));

    rowFilterInputEventHandler = function (evt) {
        self.applyToSelectedRowsOnly(true);
    };
    elts = myContainer.getElementsByTagName('input');
    for (ee = 0; ee < elts.length; ee += 1) {
        if ('text' === elts[ee].getAttribute('type')) {
            //elts[ee].onchange = rowFilterInputEventHandler;
            this.customAddEventListener(elts[ee], 'change',
                    rowFilterInputEventHandler);
        }
    }

    // Save reference to status element.
    this.statusElt = document.getElementById('nqs-status');
};

QueueManager.prototype.showCachedData = function (icons) {
    var key,
        rr,
        ee,
        config,
        trElts,
        id,
        container,
        div,
        infoFields,
        displayLookup,
        ff,
        divider,
        titleElt,
        props,
        val,
        infoTemplate;

    // Note: init needs to be fast so the manager tasks of removing obsolete
    // data or storing massaged data is deferred until the user actually
    // performs a sort.

    // Get movie data for this queue.  (Keep dvd and instant data separate.)
    key = 'movie-data-' + this.getQueueId();
    this.cachedData = this.getCacheValue(key);
    if (!this.cachedData) {
        this.cachedData = {};
    }

    // Allow each retriever to massage the data before it is displayed (e.g.
    // to clear an upcoming release date if that data already passed.)
    // Note: there's no XHR going on here.
    // Note: readily available queue data should not pollute cachedData, so 
    // we're dealing with invible but still informative queue data below.
    for (rr = 0; rr < this.allNonQueueRetrievers.length; rr += 1) {
        this.allNonQueueRetrievers[rr].initCachedData(this.cachedData);
    }

    // Create an alphabetically sorted string of extra info.
    infoFields = [];
    displayLookup = {};
    function addInfoFields(fieldsConfig) {
        var pp;

        for (pp in fieldsConfig) {
            if (fieldsConfig.hasOwnProperty(pp)) {
                config = fieldsConfig[pp];
                // Note: !shown works even if that property is undefined.
                if (!config.shown && config.selectable) {
                    infoFields.push(pp);
                    displayLookup[pp] = config.display;
                }
            }
        }
    }
    // Determine the data points present in the HTML of the queue but
    // not shown to the user (but still of interest to the user).
    // (avgRating used to be one of those fields.)
    addInfoFields(this.allDataPointConfig);
    // Add all selectable retriever fields.
    for (rr = 0; rr < this.allNonQueueRetrievers.length; rr += 1) {
        addInfoFields(this.allNonQueueRetrievers[rr].getAllDataPointConfig());
    }
    // Sort the array.
    infoFields = infoFields.sort();

    // Now add the data inline into the queue.
    divider = ' - ';
    infoTemplate = this.getMovieInfoHtmlTemplate();
    trElts = this.getListTrElts();
    for (ee = 0; ee < trElts.length; ee += 1) {
        id = this.extractMovieId(trElts[ee]);
        container = trElts[ee].getElementsByClassName('tt')[0];
        titleElt = container.getElementsByClassName('title')[0];

        props = '';
        for (ff = 0; ff < infoFields.length; ff += 1) {
            config = this.allDataPointConfig[infoFields[ff]];
            if (undefined !== config) {
                // Retrieve from queue.
                val = this[config.extractFn](trElts[ee]);
                // TODO: FUTURE: can be undefined because of missing series
                //       info.  Lookup series info here too?
                if (undefined !== val) {
                    props += displayLookup[infoFields[ff]] + ': ' + val +
                            divider;
                }
            } else {
                // Check if present in cache.
                config = this.cachedData[id];
                if (undefined !== config &&
                        undefined !== config[infoFields[ff]]) {
                    props += displayLookup[infoFields[ff]] + ': ' +
                            config[infoFields[ff]] + divider;
                }
            }
        }

        if (props !== '') {
            // Remove last divider.
            props = props.substring(0, props.length - divider.length);

            // Because tooltips appear below the line the mouse is pointing at,
            // include the movie title.
            props = this[this.allDataPointConfig.title.extractFn](trElts[ee]) +
                    ': ' + props;

            div = document.createElement('div');
            div.innerHTML = this.substituteVars(infoTemplate, {
                title: props
            });

            container.replaceChild(div, titleElt);
            container.appendChild(titleElt);
            // This makes titleElt move up a few px so it's no longer centered;
            // fix this.
            titleElt.style.display = 'block';
            titleElt.style.paddingTop = '2px';
        }
    }
};

QueueManager.prototype.checkForUndo = function () {
    var showUndo,
        undoElt,
        trElts,
        rr,
        origOrder = this.getCacheValue('undo-order-' + this.getQueueId());

    if (origOrder) {
        // Undo is possible only if all movies in the queue are present in the
        // undo-order.
        // TODO: FUTURE: add timeout?  Seeing undo a week later is confusing.
        //       or, show date stamp on hover over icon.
        showUndo = true;
        trElts = this.getListTrElts();
        for (rr = 0; rr < trElts.length; rr += 1) {
            if (undefined === origOrder[this.extractMovieId(trElts[rr])]) {
                showUndo = false;
                break;
            }
        }

        if (showUndo) {
            undoElt = document.getElementById('nqs-icon-undo');
            undoElt.style.display = 'block';
        }
    }
};

QueueManager.prototype.getQueueId = function () {
    var tt,
        id,
        tabs;

    tabs = document.getElementById('qtabs').getElementsByTagName('li');
    for (tt = 0; tt < tabs.length; tt += 1) {
        if (this.hasClass(tabs[tt], 'selected') &&
                // Movies.n.c has queueTab, but www.n.c has tab.
                (this.hasClass(tabs[tt], 'queueTab') ||
                        this.hasClass(tabs[tt], 'tab'))) {
            // Movies.n.c has instant, but www.n.c has inst.
            if (this.hasClass(tabs[tt], QueueManager.QUEUE_INSTANT) ||
                    this.hasClass(tabs[tt], 'inst')) {
                id = QueueManager.QUEUE_INSTANT;
            } else if (this.hasClass(tabs[tt], QueueManager.QUEUE_DVD)) {
                id = QueueManager.QUEUE_DVD;
            } else {
                // The Netflix source code might have changed.
                throw new Error('Unknown queue type');
            }
        }
    }

    if (this.isDebug) {
        this.debug('getQueueId: ' + id);
    }

    // Needs to be done only once, so make function always return result.
    QueueManager.prototype.getQueueId = function () {
        return id;
    };

    return id;
};

// Never show the Netflix tip that updating the priority of every item in the
// queue is not necessary.  Show the "Queue has been reordered." msg instead.
QueueManager.prototype.hideQueueReorderingTip = function () {
    var elt,
        elts = document.getElementsByClassName('svfmsg-l');

    if (elts.length > 0) {
        elt = document.createElement('div');
        elt.setAttribute('class', 'svfmsg-s');
        elt.innerHTML = '<div class="svfmsg-bd svfconfirm">Your Queue has been reordered.<br> </div>';
        elts[0].parentNode.replaceChild(elt, elts[0]);
    }
};

// Makes sure data points across all retrievers are unique in key and value.
QueueManager.prototype.assertUniqueDataPoints = function () {
    var idsSeen = {},
        stringsSeen = {},
        rr;

    function checkFields(fieldsConfig) {
        var ff;

        for (ff in fieldsConfig) {
            if (fieldsConfig.hasOwnProperty(ff)) {
                // Make sure all data points are unique.
                if (idsSeen[ff]) {
                    throw new Error('Data point id "' + ff +
                            '" is not unique');
                }
                if (stringsSeen[fieldsConfig[ff].display]) {
                    throw new Error('Data point display string "' +
                            fieldsConfig[ff].display + '" is not unique');
                }
                idsSeen[ff] = true;
                stringsSeen[fieldsConfig[ff].display] = true;
            }
        }
    }

    // Include the queue fields in this check.
    checkFields(this.getAllDataPointConfig());

    for (rr = 0; rr < this.allNonQueueRetrievers.length; rr += 1) {
        checkFields(this.allNonQueueRetrievers[rr].getAllDataPointConfig());
    }
};

QueueManager.prototype.checkForUpdates = function () {
    function versionCheckHandler(response) {
        var upgradeElt,
            version = 2.2,
            latestVersion = -1,
            result = /<b>Version:<\/b>\n([\d\.]+?)\n<br/.exec(
                    response.responseText);

        if (result) {
            latestVersion = Number(result[1]);

            if (latestVersion > version) {
                upgradeElt = document.getElementById('nqs-icon-update');
                upgradeElt.style.display = 'block';
            }
        } else {
            // Chrome will get here as it does not support cross-domain XHR yet.
            // See http://code.google.com/p/chromium/issues/detail?id=18857#c111
            throw new Error("Parse error: " + JSON.stringify(response));
        }
    }

    // TODO: FUTURE: Opera does not support GM_xmlhttpRequest.
    GM_xmlhttpRequest({
        method: 'GET',
        url: 'http://userscripts.org/scripts/show/35183',
        onload: versionCheckHandler,
        onerror: versionCheckHandler   // Only added for development mode.
    });
};

QueueManager.prototype.init = function () {
    // Init config options first, so that isDebug is set.
    this.initConfigOptions();
    if (this.isDebug) {
        this.debug('init: initConfigOptions');
    }

    // Validate the data point config is correct.
    if (this.isDebug) {
        this.debug('init: assertUniqueDataPoints');
    }
    this.assertUniqueDataPoints();

    if (this.isDebug) {
        this.debug('init: hideQueueReorderingTip');
    }
    this.hideQueueReorderingTip();

    if (this.isDebug) {
        this.debug('init: createSortIndependentLookups');
    }
    this.createSortIndependentLookups();

    if (this.isDebug) {
        this.debug('init: showUi');
    }
    this.showUi();

    if (this.isDebug) {
        this.debug('init: checkForUndo');
    }
    this.checkForUndo();

    // TODO: NOW: get rid of this
    if (true === this.getCacheValue('reload-trigger')) {
        this.deleteCacheValue('reload-trigger');
        if (0 === document.getElementsByClassName('svfmsg-s').length &&
                0 === document.getElementsByClassName('svfmsg-l').length) {
            //this.switchToBusyMode();
            //this.switchToNoMoreCancelMode();
            //this.setStatus('[Reloading page...]');
            //window.location.reload(true);
            this.setStatus('[If the order didn\'t change, reload the page.]');
        }
    }

    if (this.isDebug) {
        this.debug('init: showCachedData');
    }
    this.showCachedData();

    if (this.isDebug) {
        this.debug('init: checkForUpdates');
    }
    this.checkForUpdates();

    if (this.isDebug) {
        this.debug('init complete');
    }

    // Now wait for the user to press a button.
};



var manager = new QueueManager();
manager.init();

///////////////////////////////////////////////////////////////////////////////
