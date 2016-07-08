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
	args = nopt(knownOpts, shortHands, process.argv, 2),
	monthNames = ["January", "February", "March", "April", "May", "June",
  	"July", "August", "September", "October", "November", "December"];


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
		
		if (typeof exifData["create date"] !== "undefined" && exifData["create date"] != "0000:00:00 00:00:00") {
			creationDate = new Date(
				  exifData["create date"].substr(0, 4) + '/'
				+ exifData["create date"].substr(5, 2) + '/'
				+ exifData["create date"].substr(8, 2) + ' '
				+ exifData["create date"].substr(11, 2) + ':'
				+ exifData["create date"].substr(14, 2) + ':'
				+ exifData["create date"].substr(17, 2)
			);
			console.log('EXIF, create date :', exifData["create date"], ", Filename :", fileName, "Date :", creationDate.getFullYear(), creationDate.getMonth() + 1, creationDate.getDate(), creationDate.getHours(), creationDate.getMinutes(), creationDate.getSeconds());
		}
		
		if (typeof exifData["date time original"] !== "undefined" && !creationDate && exifData["date time original"] != "0000:00:00 00:00:00") {	// If fails, attempt lookup via another EXIF parameter
			creationDate = new Date(
				  exifData["date time original"].substr(0, 4) + '/' 
				+ exifData["date time original"].substr(5, 2) + '/'
				+ exifData["date time original"].substr(8, 2) + ' '
				+ exifData["date time original"].substr(11, 2) + ':'
				+ exifData["date time original"].substr(14, 2) + ':'
				+ exifData["date time original"].substr(17, 2)
			);
			console.log('EXIF, date time original : ', exifData["date time original"], ", Filename :", fileName, "Date :", creationDate.getFullYear(), creationDate.getMonth() + 1, creationDate.getDate(), creationDate.getHours(), creationDate.getMinutes(), creationDate.getSeconds());
		}

		//if (!creationDate) {	// If fails, attempt lookup via filename
		//	creationDate = new Date(
		//		  fileName.substr(0, 4) + '/'
		//		+ fileName.substr(5, 2) + '/'
		//		+ fileName.substr(8, 2)
		//	);
		//	console.log('Name:', fileName, creationDate.getFullYear(), creationDate.getMonth() + 1, creationDate.getDate());	
		//}
		
		if (!creationDate) {
			var error = "Unable to find valid date in EXIF data or file name for " + fileName;
			cb(error);
		} else {
			cb(null, fileName, creationDate.getFullYear(), creationDate.getMonth() + 1, creationDate.getDate(), creationDate.getHours(), creationDate.getMinutes(), creationDate.getSeconds());
		}
	});
}

var movePhoto = function movePhoto(originPath, destinationPath, fileName, year, month, day, hours, minutes, seconds, cb) {
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
	var fullDestinationPath = destinationPath + year + "/" + twoDigitFormat(month) + "_" + monthNames[month-1] + "/";
	var newFileName  =  twoDigitFormat(day) + "-" + twoDigitFormat(month) + "-" + year + "_" + twoDigitFormat(hours) + "." + twoDigitFormat(minutes) + "." + twoDigitFormat(seconds) + "." + fileName.split('.').pop()
	
	// Verify year, month, day (if needed) folders exist
	if (fs.existsSync(destinationPath + year) === false) {
		fs.mkdirSync(destinationPath + year);
	}
	if (fs.existsSync(destinationPath + year + "/" + twoDigitFormat(month) + "_" + monthNames[month-1]) === false) {
		fs.mkdirSync(destinationPath + year + "/" + twoDigitFormat(month) + "_" + monthNames[month-1]);
	}
	
	
	// Execute the move	
	fs.rename(
		originPath + fileName,
		fullDestinationPath + newFileName,
		function(err) {
			if (err) {
				console.log('Move error:', fileName, err);
			} else {
				console.log(originPath + fileName + " moved to " + fullDestinationPath + newFileName);
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
				lookupDate(startDir, fileName, function(error, fileName, year, month, day, hours, minutes, seconds) {
					if (error) { 
						return callback(error); 
					}
					
					movePhoto(startDir, args.destination, fileName, year, month, day, hours, minutes, seconds, function(error) {
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
