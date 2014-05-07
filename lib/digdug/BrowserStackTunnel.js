define([
	'./Tunnel',
	'./util',
	'dojo/node!url',
	'require'
], function (Tunnel, util, urlUtil, require) {
	function BrowserStackTunnel() {
		this.servers = [];
		Tunnel.apply(this, arguments);
	}

	BrowserStackTunnel.prototype = util.mixin(Object.create(Tunnel.prototype), {
		constructor: BrowserStackTunnel,

		accessKey: null,
		directory: require.toUrl('./browserstack/'),
		proxy: null,
		servers: null,
		username: null,

		get executable() {
			return this.platform === 'win32' ? 'BrowserStackLocal.exe' : 'BrowserStackLocal';
		},

		get url() {
			var platform = this.platform;
			var architecture = this.architecture;
			var url = 'https://www.browserstack.com/browserstack-local/BrowserStackLocal-';

			if (platform === 'darwin' || platform === 'win32') {
				url += platform;
			}
			else if (platform === 'linux' && (architecture === 'ia32' || architecture === 'x64')) {
				url += platform + '-' + architecture;
			}
			else {
				throw new Error(platform + ' on ' + architecture + ' is not supported');
			}

			url += '.zip';
			return url;
		},

		_makeArgs: function () {
			var args = [
				this.accessKey,
				this.servers.map(function (server) {
					server = urlUtil.parse(server);
					return [ server.hostname, server.port, server.protocol === 'https:' ? 1 : 0 ].join(',');
				}),
				'-onlyAutomate',
				'-skipCheck'
			];

			if (this.tunnelIdentifier) {
				args.push('-localIdentifier ' + this.tunnelIdentifier);
			}

			if (this.proxy) {
				var proxy = urlUtil.parse(this.proxy);

				proxy.hostname && args.push('-proxyHost ' + proxy.hostname);
				proxy.port && args.push('-proxyPort ' + proxy.port);

				if (proxy.auth) {
					var auth = proxy.auth.split(':');
					args.push('-proxyUser ' + auth[0], '-proxyPass ' + auth[1]);
				}
				else {
					proxy.username && args.push('-proxyUser ' + proxy.username);
					proxy.password && args.push('-proxyPass ' + proxy.password);
				}
			}

			return args;
		},

		_start: function () {
			var child = this._makeChild();
			var process = child.process;
			var dfd = child.deferred;

			var handle = util.on(process.stdout, 'data', function (data) {
				var error = /\s*\*\*\* Error: (.*)$/m.exec(data);
				if (error) {
					handle.remove();
					dfd.reject(new Error('The tunnel reported: ' + error[1]));
				}
				else if (data.indexOf('You can now access your local server(s) in our remote browser') > -1) {
					handle.remove();
					dfd.resolve();
				}
			});

			return child;
		}
	});

	return BrowserStackTunnel;
});
