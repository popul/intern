define([
	'./Tunnel',
	'dojo/node!fs',
	'dojo/node!os',
	'dojo/node!url',
	'dojo/node!path',
	'./util',
	'require'
], function (Tunnel, fs, os, urlUtil, pathUtil, util, require) {
	function TestingBotTunnel() {
		this.skipDomains = [];
		Tunnel.apply(this, arguments);
	}

	TestingBotTunnel.prototype = util.mixin(Object.create(Tunnel.prototype), {
		constructor: TestingBotTunnel,

		apiKey: null,
		apiSecret: null,
		directory: require.toUrl('./testingbot/'),
		executable: 'java',
		logFile: null,
		skipDomains: null,
		url: 'http://testingbot.com/downloads/testingbot-tunnel.zip',
		useCompression: false,
		useJettyProxy: true,
		useSquidProxy: true,
		useSsl: false,
		verbose: false,

		get isDownloaded() {
			return fs.existsSync(pathUtil.join(this.directory, 'testingbot-tunnel/testingbot-tunnel.jar'));
		},

		_makeArgs: function (readyFile) {
			var args = [
				'-jar', 'testingbot-tunnel/testingbot-tunnel.jar',
				this.apiKey,
				this.apiSecret,
				'-P', this.port,
				'-f', readyFile
			];

			this.logFile && args.push('-l', this.logFile);
			this.skipDomains.length && args.push('-F', this.skipDomains.join(','));
			this.useJettyProxy || args.push('-x');
			this.useSquidProxy || args.push('-q');
			this.useCompression && args.push('-b');
			this.useSsl && args.push('-s');
			this.verbose && args.push('-d');

			if (this.proxy) {
				var proxy = urlUtil.parse(this.proxy);

				proxy.hostname && args.unshift('-Dhttp.proxyHost=', proxy.hostname);
				proxy.port && args.unshift('-Dhttp.proxyPort=', proxy.port);
			}

			return args;
		},

		_start: function () {
			var readyFile = pathUtil.join(os.tmpdir(), 'testingbot-' + Date.now());
			var child = this._makeChild(readyFile);
			var process = child.process;
			var dfd = child.deferred;

			// Polling API is used because we are only watching for one file, so efficiency is not a big deal, and the
			// `fs.watch` API has extra restrictions which are best avoided
			fs.watchFile(readyFile, { persistent: false, interval: 1007 }, function () {
				fs.unwatchFile(readyFile);
				dfd.resolve();
			});

			var self = this;
			var lastMessage;
			this._handles.push(
				util.on(process.stderr, 'data', function (data) {
					data.split('\n').forEach(function (message) {
						if (message.indexOf('INFO: ') === 0) {
							message = message.slice('INFO: '.length);
							// the tunnel produces a lot of repeating messages during setup when the status is pending;
							// deduplicate them for sanity
							if (message !== lastMessage) {
								self.emit('info', message);
								lastMessage = message;
							}
						}
					});
				})
			);

			return child;
		}
	});

	return TestingBotTunnel;
});
