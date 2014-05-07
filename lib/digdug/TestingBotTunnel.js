define([
	'./Tunnel',
	'dojo/node!fs',
	'dojo/node!os',
	'dojo/node!path',
	'./util',
	'require'
], function (Tunnel, fs, os, pathUtil, util, require) {
	function TestingBotTunnel() {
		this.skipDomains = [];
		Tunnel.apply(this, arguments);
	}

	TestingBotTunnel.prototype = util.mixin(Object.create(Tunnel.prototype), {
		constructor: TestingBotTunnel,

		apiKey: null,
		apiSecret: null,
		bypassProxy: false,
		directory: require.toUrl('./testingbot/'),
		executable: 'java',
		skipDomains: null,
		url: 'http://testingbot.com/downloads/testingbot-tunnel.zip',
		useCompression: false,
		useSsl: false,

		_launch: function () {
			var readyFile = pathUtil(os.tmpdir(), 'testingbot-' + Date.now());
			var child = this._makeChild(readyFile);
			var dfd = child.deferred;

			var handle = fs.watch(readyFile, { persistent: false }, function () {
				handle.remove();
				dfd.resolve();
			});

			return dfd.promise;
		},

		_makeArgs: function (readyFile) {
			var args = [
				'-jar testingbot-tunnel.jar',
				this.apiKey,
				this.apiSecret,
				'-P ' + this.port,
				'-f ' + readyFile
			];

			this.skipDomains && args.push('-F ' + this.skipDomains.join(','));
			this.bypassProxy && args.push('-q');
			this.useCompression && args.push('-b');
			this.useSsl && args.push('-s');

			return args;
		}
	});

	return TestingBotTunnel;
});
