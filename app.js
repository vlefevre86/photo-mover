var exif = require('exif2'),
	fs = require('fs'),
	nopt = require("nopt"),
	path = require("path"),
	Stream = require("stream").Stream,
	knownOpts = { 
		"origin" : path,
		"destination" : path,
	},
	shortHands = { 
		"o" : ["--origin"],
		"d" : ["--destination"]
	},
	args = nopt(knownOpts, shortHands, process.argv, 2);


// canWrite via: https://groups.google.com/d/msg/nodejs/qmZtIwDRSYo/N7xOioUnwjsJ
var canWrite = function canWrite(owner, inGroup, mode) {
	return (owner && (mode & 00200)) || // User is owner and owner can write.
		(inGroup && (mode & 00020)) || // User is in group and group can write.
		(mode & 00002); // Anyone can write.
};

var lookupDate = function lookupDate(filePath, fileName, cb) {
	// Attempt lookup of EXIF date
	exif(filePath + fileName, function(err, exifData) {
		if (err) {
			console.error(err);
			return;
		}
		
		var creationDate;
		
		if (exifData["create date"]) {
			creationDate = new Date(
				  exifData["create date"].substr(0, 4) + '/' 
				+ exifData["create date"].substr(5, 2) + '/' 
				+ exifData["create date"].substr(8, 2)
			);
			console.log('EXIF', fileName, creationDate.getFullYear(), creationDate.getMonth() + 1, creationDate.getDate());
		}
		
		if (!creationDate && exifData["file modification date time"]) {	// If fails, attempt lookup via another EXIF parameter
			creationDate = new Date(
				  exifData["file modification date time"].substr(0, 4) + '/' 
				+ exifData["file modification date time"].substr(5, 2) + '/' 
				+ exifData["file modification date time"].substr(8, 2)
			);
			console.log('EXIF, file mod', fileName, creationDate.getFullYear(), creationDate.getMonth() + 1, creationDate.getDate());
		}
		
		if (!creationDate) {	// If fails, attempt lookup via filename
			creationDate = new Date(
				  fileName.substr(0, 4) + '/'
				+ fileName.substr(5, 2) + '/'
				+ fileName.substr(8, 2)
			);
			console.log('Name:', fileName, creationDate.getFullYear(), creationDate.getMonth() + 1, creationDate.getDate());	
		}
		
		if (!creationDate) {
			console.error("Unable to find valid date in EXIF data or file name for ", fileName);
		} else {
			cb(fileName, creationDate.getFullYear(), creationDate.getMonth() + 1, creationDate.getDate());			
		}
	});
}

var movePhoto = function movePhoto(originPath, destinationPath, fileName, year, month, day, cb) {
	var twoDigitFormat = function twoDigitFormat(num) {
		if (num < 10) {
			return '0' + num;
		}
		return String(num);
	};
	
	// Validate params
	if (!year || !month || !originPath || !destinationPath) {
		console.error('movePhoto requires origin path, destination path, year, month.');
		cb(true);
	}
	if (fs.existsSync(destinationPath) === false) {
		console.error('Destination path is invalid.');
		cb(true);
	}
	
	// Determine new path
	var fullDestinationPath = destinationPath + year + "/" + twoDigitFormat(month) + "/";
	if (day) {
		fullDestinationPath += twoDigitFormat(day) + "/";
	}
	
	// Verify year, month, day (if needed) folders exist
	if (fs.existsSync(destinationPath + year) === false) {
		fs.mkdirSync(destinationPath + year);
	}
	if (fs.existsSync(destinationPath + year + "/" + twoDigitFormat(month)) === false) {
		fs.mkdirSync(destinationPath + year + "/" + twoDigitFormat(month));
	}
	if (day && (fs.existsSync(fullDestinationPath) === false)) {
		fs.mkdirSync(fullDestinationPath);
	}
	
	
	// Execute the move	
	fs.rename(
		originPath + fileName,
		fullDestinationPath + fileName,
		function(err) {
			if (err) {
				console.log('Move error:', fileName, err);
			} else {
				console.log(originPath + fileName + " moved to " + fullDestinationPath + fileName);
			}
			
			if (cb) { cb(err); }
		}
	);
}

// START
// =====

// Verify user can write to the destination path
if (!args.destination) {
	console.error("--destination path is required.");
	process.exit(1);
}

// Ensure trailing slash in destination path
if (args.destination[ args.destination.length - 1 ] !== "/") {
	args.destination += "/";
}

var destinationPathStats = fs.statSync(args.destination);

if (!destinationPathStats.isDirectory()) {
	console.error("--destination must be a valid path.");
	process.exit(1);
}

if (!canWrite(process.getuid() === destinationPathStats.uid, process.getgid() === destinationPathStats.gid, destinationPathStats.mode)) {
	console.error("--destination path is not writeable.");
	process.exit(1);
}

// Verify the origin is readable and has files
if (!args.origin) {
	console.error("--origin path is required.");
	process.exit(1);
}

// Ensure trailing slash in origin path
if (args.destination[ args.origin.length - 1 ] !== "/") {
	args.origin += "/";
}

var files = fs.readdirSync(args.origin);

// TODO: Node seems to die due to `ulimit` issues here. Find out a way to deal with this.
for (var i = 0, iMax = ((files.length > 80)? 80 : files.length), filesProcessed = 0; i < iMax; i++) {
	if ((/\.(gif|jpg|jpeg|png|psd|mov)$/i).test(files[i])) {
		lookupDate(args.origin, files[i], function(fileName, year, month, day) {
			movePhoto(args.origin, args.destination, fileName, year, month, day);
		});
		filesProcessed++;
	} else {
		console.log('bad file', files[i]);
	}
}

console.log(filesProcessed + " files processed.");