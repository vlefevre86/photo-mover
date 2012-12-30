photo-mover
===========

Quick script I wrote to move photos to a year / month / day hierarchy based on EXIF data or date at start of file name.


HOW TO USE
----------

> node app.js --origin /Users/jeremiah/Dropbox/Camera\ Uploads/ --destination /Users/jeremiah/Pictures/


TODO
----

Annoying `ulimit` bug:
	https://npmjs.org/package/posix
	ulimit -n to see the number allowed
	ulimit -n 512 to increase it to 512