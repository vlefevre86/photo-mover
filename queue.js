var Queue = function(options, callback) {
	this.doneCallback = callback;
	this.concurrentLimit = options.limit || 10;
	this.jobQueue = [];
	this.errors = [];
};

Queue.prototype.add = function(fn) {
	this.jobQueue.push(fn);
};

Queue.prototype.start = function() {
	for(var i = 0; i < this.concurrentLimit; i++) {
		this.dispatch();
	}
};

Queue.prototype.runJob = function(fn) {
	var self = this;
	fn(function(error) {
		self.errors.push(error);
		if (self.jobQueue.length) {
			self.dispatch();
		} else {
			self.finished();
		}
	});
};

Queue.prototype.dispatch = function() {
	if (this.jobQueue.length) {
		this.runJob(this.jobQueue.shift());
	}
};

Queue.prototype.finished = function() {
	var errors = this.errors.filter(function(error) {
		return error;
	});
	if (errors.length) {
		this.doneCallback(this.errors);
	} else {
		this.doneCallback();
	}
};

module.exports = Queue;
