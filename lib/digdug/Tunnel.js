/*jshint node:true */
define([
	'./util',
	'dojo/Evented',
	'dojo/node!child_process',
	'dojo/node!fs',
	'dojo/node!path',
	'dojo/node!url',
	'dojo/node!http',
	'dojo/node!https',
	'dojo/node!decompress'
], function (util, Evented, spawnUtil, fs, pathUtil, urlUtil, http, https, decompress) {
	function clearHandles(handles) {
		var handle;
		while ((handle = handles.pop())) {
			handle.remove();
		}
	}

	function get(url) {
		url = urlUtil.parse(url);
		url.method = 'GET';

		var dfd = util.deferred(function () {
			request && request.abort();
			request = null;
		});

		// TODO: This is not a great way of capturing async stack traces, but this pattern is used in several areas;
		// can we do it better?
		var capture = {};
		Error.captureStackTrace(capture);

		var request = (url.protocol === 'https:' ? https : http).request(url);
		request.once('response', dfd.resolve.bind(dfd));
		request.once('error', function (error) {
			error.stack = error.stack + capture.stack.replace(/^[^\n]+/, '');
			dfd.reject(error);
		});
		request.end();

		return dfd.promise;
	}

	function proxyEvent(target, type) {
		return function (data) {
			target.emit(type, data);
		};
	}

	function Tunnel(kwArgs) {
		Evented.apply(this, arguments);
		for (var key in kwArgs) {
			Object.defineProperty(this, key, Object.getOwnPropertyDescriptor(kwArgs, key));
		}
	}

	// what to know:
	// 1. url to launcher
	// 2. extraction directory
	// 3. name of executable
	// 4. default arguments
	// 5. extra arguments
	// 6. mapper for launcher keys to arguments
	// 7. extra properties to pass as capabilities
	//
	// what to do:
	// 1. download and extract archive (common to all launchers)
	// 2. (maybe) set executable +x    (per-launcher)
	// 3. generate arguments           (per-launcher, with common utility support)
	// 3. run executable               (common to all launcher)
	// 4. verify that tunnel started successfully (per-launcher)
	// 5. monitor tunnel for any errors and report them      (per-launcher, with common utility support)
	// 6. provide an ability to cleanly shut down the tunnel (per-launcher)
	// 7. broadcast extra information from the tunnel?       (per-launcher)
	//
	// things to be set:
	// 1. authentication information        (username/accessKey, apiKey/apiSecret)
	// 2. host/port(s) to proxy, ssl or not (`proxyUrl`)
	// 3. local port to listen on           (`webdriver`)
	// 4. extra arguments to command-line
	// 5. extra arguments to webdriver

	var _super = Evented.prototype;
	Tunnel.prototype = util.mixin(Object.create(_super), {
		constructor: Tunnel,

		architecture: process.arch,
		directory: null,
		executable: null,
		isRunning: false,
		isStarting: false,
		isStopping: false,
		platform: process.platform,
		port: 4444,
		tunnelIdentifier: null,
		url: null,

		_handles: null,
		_process: null,

		get isDownloaded() {
			return fs.existsSync(pathUtil.join(this.directory, this.executable));
		},

		/**
		 * Downloads and extracts tunnel dependencies if they are not already downloaded.
		 *
		 * @param {boolean} forceDownload Force downloading dependencies even if they already have been downloaded.
		 * @returns {Promise.<void>} A promise that resolves once the download and extraction process has completed.
		 */
		download: function (forceDownload) {
			var dfd = util.deferred(function (reason) {
				request && request.cancel(reason);
				request = null;
			});

			if (!forceDownload && this.isDownloaded) {
				dfd.resolve();
				return dfd.promise;
			}

			var target = this.directory;
			var request;
			function download(url) {
				request = get(url);
				request.then(function (response) {
					if (response.statusCode === 200) {
						var receivedLength = 0;
						var totalLength = +response.headers['content-length'] || Infinity;
						var decompressor = decompress({ ext: url, path: target });

						response.pipe(decompressor);

						response.on('data', function (data) {
							receivedLength += data.length;
							dfd.progress({ received: receivedLength, total: totalLength });
						});

						decompressor.on('close', function () {
							dfd.resolve();
						});
					}
					else if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
						download(response.headers.location);
					}
					else {
						var responseData = '';
						response.on('data', function (data) {
							responseData += data.toString('utf8');
						});

						response.on('end', function () {
							var error = new Error('Server error: ' + (responseData || 'status ' + response.statusCode));
							dfd.reject(error);
						});
					}
				}).otherwise(function (error) {
					dfd.reject(error);
				});
			}

			download(this.url);

			return dfd.promise;
		},

		_makeArgs: function () {
			return [];
		},

		_makeChild: function () {
			var command = this.executable;
			var args = this._makeArgs.apply(this, arguments);
			var options = this._makeOptions.apply(this, arguments);

			var dfd = util.deferred();
			var process = spawnUtil.spawn(command, args, options);

			process.stdout.setEncoding('utf8');
			process.stderr.setEncoding('utf8');

			var handle = util.on(process, 'error', function (error) {
				dfd.reject(error);
			});

			dfd.promise.always(function () {
				handle.remove();
			});

			return {
				process: process,
				deferred: dfd
			};
		},

		_makeOptions: function () {
			return {
				cwd: this.directory,
				env: process.env
			};
		},

		/**
		 * Starts the tunnel, automatically downloading dependencies if necessary.
		 *
		 * @returns {Promise.<void>} A promise that resolves once the tunnel has been established.
		 */
		start: function () {
			if (this.isRunning) {
				throw new Error('Tunnel is already running');
			}
			else if (this.isStopping) {
				throw new Error('Previous tunnel is still terminating');
			}
			else if (this.isStarting) {
				throw new Error('Tunnel is already launching');
			}

			this.isStarting = true;

			var self = this;
			return this
				.download()
				.then(null, null, function (progress) {
					self.emit('progress', progress);
				})
				.then(this._start.bind(this))
				.then(function (child) {
					var process = child.process;
					self._process = process;
					self._handles = [
						util.on(process.stdout, 'data', proxyEvent(self, 'stdout')),
						util.on(process.stderr, 'data', proxyEvent(self, 'stderr'))
					];
					return child.deferred.promise;
				})
				.then(function (returnValue) {
					self.isStarting = false;
					self.isRunning = true;
					return returnValue;
				}, function (error) {
					self.isStarting = false;
					throw error;
				});
		},

		/**
		 * A default launch implementation that assumes the tunnel is ready for use once the child process has written
		 * to stdout or stderr. This method should be reimplemented by other tunnel launchers to implement correct
		 * launch detection logic.
		 *
		 * @returns {{ process: Object, deferred: Deferred }}
		 * An object containing a reference to the child process, and a Deferred that is resolved once the tunnel is
		 * ready for use. Normally this will be the object returned from a call to `Tunnel#_makeChild`.
		 */
		_start: function () {
			function resolve() {
				clearHandles(handles);
				dfd.resolve();
			}

			var child = this._makeChild();
			var process = child.process;
			var dfd = child.deferred;
			var handles = [
				util.on(process.stdout, 'data', resolve),
				util.on(process.stderr, 'data', resolve),
				util.on(process, 'error', function (error) {
					clearHandles(handles);
					dfd.reject(error);
				})
			];

			return dfd.promise;
		},

		/**
		 * Stops the tunnel.
		 *
		 * @returns {Promise.<integer>}
		 * A promise that resolves to the exit code for the tunnel once it has been terminated.
		 */
		stop: function () {
			if (this.isStopping) {
				throw new Error('Tunnel is already terminating');
			}
			else if (this.isStarting) {
				throw new Error('Tunnel is still launching');
			}
			else if (!this.isRunning) {
				throw new Error('Tunnel is not running');
			}

			this.isRunning = false;
			this.isStopping = true;

			var self = this;
			return this._stop().then(function (returnValue) {
				clearHandles(self._handles);
				self._process = self._handles = null;
				self.isRunning = self.isStopping = false;
				return returnValue;
			}, function (error) {
				self.isRunning = true;
				self.isStopping = false;
				throw error;
			});
		},

		_stop: function () {
			var dfd = util.deferred();
			var process = this._process;

			process.once('exit', function (code) {
				dfd.resolve(code);
			});
			process.kill('SIGINT');

			return dfd.promise;
		}
	});

	return Tunnel;
});
