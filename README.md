Netflix Queue Sorter
====================

Greasemonkey script for Chrome, Firefox, Opera, Safari: shuffle, reverse, and sort your DVD Queue or Instant Queue by star rating, average rating, title, length, year, genre, format, availability, playability, language, etc.


Installation instructions
-------------------------

* Chrome (everything works except the "update available" indicator):
    * Note: [Starting in Chrome 21, it is more difficult to install extensions, apps, and user scripts from outside the Chrome Web Store](http://support.google.com/chrome_webstore/?p=crx_warning). Here's how to install the script:
    * (No add-on or extension installation required.)
    * Right-click on [this GitHub link to the script's raw source code](https://raw.githubusercontent.com/m5n/netflix-queue-sorter/master/netflix-queue-sorter.user.js) and select `Save Link As...` to save the script to a directory of your choice.
    * From the application menu, select `Tools > Extensions`.
    * Locate the script file on your computer and drag the file onto the Extensions page.
    * Click `Install`.
    * Manage your scripts via the `Window --> Tools -->Extensions` menu.


* Firefox:
  * Install the [Greasemonkey](https://addons.mozilla.org/en-US/firefox/addon/748) add-on (v0.9.8 or higher).
  * Restart Firefox.
  * Install this script by clicking on [this GitHub link to the script's raw source code](https://raw.githubusercontent.com/m5n/netflix-queue-sorter/master/netflix-queue-sorter.user.js).
  * Manage your scripts via the `Tools-->Greasemonkey-->Manage User Scripts...` menu.


* Opera (everything works except the "update available" indicator):
  * [Configure Opera](http://www.techerator.com/2011/02/how-to-add-greasemoney-and-other-scripts-to-opera-11/) to allow Greasemonkey scripts to be run.
  * Install this script by right-clicking on [this GitHub link to the script's raw source code](https://raw.githubusercontent.com/m5n/netflix-queue-sorter/master/netflix-queue-sorter.user.js) and selecting the `Save Linked Content As...` option. Save the script to the directory you configured in the previous step, but rename it to "NetflixQueueSorter.user.js" so you can identify it later.
  * Restart Opera.
  * Manage your scripts directly in the directory you configured above.


* Safari:
  * Install the [NinjaKit](http://www.reddit.com/r/apple/comments/dd2sk/ninjakit_greasemonkey_for_safari/) extension.
  * Restart Safari.
  * Install this script by clicking on [this GitHub link to the script's raw source code](https://raw.githubusercontent.com/m5n/netflix-queue-sorter/master/netflix-queue-sorter.user.js).
  * Manage your scripts via the NinjaKit toolbar icon or via the Extensions preferences.


Available options
-----------------

| Button | Description |
| :-- |:-- |
| Shuffle | Shuffles your queue into a random order. |
| Reverse | Reverses the current list order. (Turns 1 through 100 into 100 through 1.) |
| Sort by Title | Alphabetically sorts your queue by movie title. |
| Sort by Playability | Moves all playable movies to the top (↑) or bottom (↓) of your queue. Does not change the order of all other movies in your queue. (DVD Queue only.) |
| Sort by Star Rating | Sorts all movies by star rating (the colored stars you see in your queue) from high to low (primary sort) and then by title (secondary sort). Use the Reverse button to sort from low to high rating. |
| Sort by Average Rating | Sorts all movies by average rating from high to low. Use the Reverse button to sort from low to high rating. |
| Sort by Genre | Alphabetically sorts your queue by genre (primary sort) and then by title (secondary sort). |
| Sort by TV/Movies | Moves the Television genre above all movie genres (primary sort) and then sorts by title (secondary sort). |
| Sort by Availability | Moves the most desirable movies to the top of your queue. (Makes sure you're one of the first to receive new or hard to get movies.) Does not change the order of all other movies in your queue.<br>The sort order for the DVD queue is: future releases, very long wait, long wait, short wait, unavailable, now.<br>The sort order for the instant queue is: limited availability on top, the rest below. |
| Sort by Length | Sorts your queue by length from short to long. For series discs, the length of just the first episode is shown (because you might only have time to watch one episode). |
| Sort by Year | Sorts your queue by year from high to low. |
| Sort by Format | Moves hi-definition movies above standard-definition movies.<br>The sort order for the DVD queue is: Blu-ray above DVD.<br>The sort order for the instant queue is: HD above streaming.<br>(Note: due to recent Netflix changes, formats cannot be retrieved for some series discs.) |
| Sort by Language | Alphabetically sorts your queue by language. |
| Sort by Date Added | Sorts your queue by the date you added movies to the queue (most recently added on top). (DVD Queue only.) |
| Sort by #Reviews | Sorts your queue by the number of user reviews from high to low.<br>(Note: due to Netflix loading this data after the movie details page loads this data is no longer available, so this sort is hidden for now.) |


Known Issues
------------

* Please make sure you've uninstalled any and all old version(s) of this script via `Tools-->Greasemonkey-->Manage User Scripts...`  
  Select Netflix Queue Sorter and press the Uninstall button.  
  Then, if you haven't already, install the latest version of this script.
* Chrome an Opera do not support cross-domain XHRs, so the script is unable to determine if an update is available (it needs to contact userscripts.org for that).
* For some series discs, Netflix reports "the" movie length as total running time of all individual discs rather than the length of each disc.


History
-------

https://github.com/m5n/netflix-queue-sorter/commits/master/netflix-queue-sorter.user.js


Acknowledgments
---------------

* The icons used in this UI are available from http://www.customicondesign.com (specifically, [here](http://www.iconspedia.com/pack/pretty-office-2038/) and [here](http://www.iconspedia.com/pack/pretty-office-5-2835/)). Their "readme" file is available at http://www.iconspedia.com/dload.php?up_id=59969
* To reduce their size, Photoshop was used (Save for Web as PNG-24, no interlacing, no metadata)
* To reduce their size even further, Smush.it was used: http://www.smushit.com/ysmush.it/
* Then the icons were converted to base64 encoding for embedding within JavaScript using: http://www.greywyvern.com/code/php/binary2base64
* For supplant and trim functions, this implementation was used: http://javascript.crockford.com/remedial.html
* To work around Chrome's lack of GM_getValue and GM_setValue, this implementation was used: http://devign.me/greasemonkey-gm_getvaluegm_setvalue-functions-for-google-chrome/
* To work around Opera's lack of GM_xmlHttpRequest, this implementation of a cross-browser XHR object was used: http://www.quirksmode.org/js/xmlhttp.html
* To clean up my JavaScript code, JSLint was used: http://www.jslint.com/ ("The Good Parts" options)
* To commit the many versions of this script into [Git](https://github.com/m5n/netflix-queue-sorter) while preserving the original release date, this blog post was helpful: http://alexpeattie.com/blog/working-with-dates-in-git/
* While I was busy doing other things, these awesome users took initiative and fixed bugs in the script: [fjawodfc](http://userscripts.org/users/480632), [hGSYAUu](http://userscripts.org/users/351458), [Max Pinton](http://userscripts.org/users/410051), [naviniea](http://userscripts.org/users/148139)
* Many other wonderful users helped me troubleshoot issues resulting in a better bug-free script!

Thank you!
