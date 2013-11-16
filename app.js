var exif = require('exif2'),
	fs = require('fs'),
	nopt = require("nopt"),
	path = require("path"),
	Stream = require("stream").Stream,
	Queue = require("./queue"),
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

function lookupDate(filePath, fileName, cb) {
	// Attempt lookup of EXIF date
	exif(filePath + fileName, function(err, exifData) {
		if (err) {
			return cb(err);
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
			var error = "Unable to find valid date in EXIF data or file name for " + fileName;
			cb(error);
		} else {
			cb(null, fileName, creationDate.getFullYear(), creationDate.getMonth() + 1, creationDate.getDate());
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
		return cb('movePhoto requires origin path, destination path, year, month.');
	}
	if (fs.existsSync(destinationPath) === false) {
		return cb('Destination path is invalid.');
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
			cb(err);
		}
	);
}

function findPictures(startDir, queue) {

	var files = fs.readdirSync(startDir);

	files.forEach(function(fileName) {
		if ((/\.(gif|jpg|jpeg|png|psd|mov)$/i).test(fileName)) {
			var runner = function(callback) {
				lookupDate(startDir, fileName, function(error, fileName, year, month, day) {
					if (error) { 
						return callback(error); 
					}
					
					movePhoto(startDir, args.destination, fileName, year, month, day, function(error) {
						filesProcessed++;
						callback(error);
					});
				});
			};
			queue.add(runner);
		} else if (fs.lstatSync(startDir+ fileName).isDirectory()) {
			findPictures(startDir+ fileName + "/", queue);
		} else {
			console.log('bad file', startDir+ fileName);
		}
	});
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

var filesProcessed = 0;

var queue = new Queue({ concurrent: 10 }, function(errors) {
	if (errors) {
		errors.map(function(error, index) {
			if (error) {
				console.log("error encountered while processing", index, ":", error);
			}
		});
	}
	console.log(filesProcessed, "files processed.");
});

findPictures(args.origin, queue);

queue.start();
