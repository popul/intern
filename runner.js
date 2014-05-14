/*jshint node:true */
if (typeof process !== 'undefined' && typeof define === 'undefined') {
	(function () {
		// this.require must be exposed explicitly in order to allow the loader to be
		// reconfigured from the configuration file
		var req = this.require = require('dojo/dojo');

		req({
			baseUrl: process.cwd(),
			packages: [
				{ name: 'intern', location: __dirname }
			],
			map: {
				intern: {
					dojo: 'intern/node_modules/dojo',
					chai: 'intern/node_modules/chai/chai'
				},
				'*': {
					'intern/dojo': 'intern/node_modules/dojo'
				}
			}
		}, [ 'intern/runner' ]);
	})();
}
else {
	define([
		'require',
		'./main',
		'./lib/createProxy',
		'dojo/has!host-node?dojo/node!istanbul/lib/hook',
		'dojo/node!istanbul/lib/instrumenter',
		'dojo/node!path',
		'./lib/args',
		'./lib/util',
		'./lib/Suite',
		'./lib/ClientSuite',
		'./lib/leadfoot/Server',
		'./lib/leadfoot/ProxiedSession',
		'./lib/leadfoot/Command',
		'dojo/lang',
		'dojo/topic',
		'dojo/request',
		'./lib/EnvironmentType',
		'./lib/reporterManager'
	], function (
		require,
		main,
		createProxy,
		hook,
		Instrumenter,
		path,
		args,
		util,
		Suite,
		ClientSuite,
		Server,
		ProxiedSession,
		Command,
		lang,
		topic,
		request,
		EnvironmentType,
		reporterManager
	) {
		if (!args.config) {
			throw new Error('Required option "config" not specified');
		}

		main.mode = 'runner';

		this.require([ args.config ], function (config) {
			main.config = config = lang.deepCopy({
				capabilities: {
					name: args.config,
					'idle-timeout': 60
				},
				launcher: 'NullLauncher',
				launcherOptions: {
					tunnelId: '' + Date.now()
				},
				loader: {},
				maxConcurrency: 3,
				proxyPort: 9000,
				proxyUrl: 'http://localhost:9000',
				useSauceConnect: true,
				webdriver: {
					hostname: 'localhost',
					pathname: '/wd/hub/',
					port: 4444,
					protocol: 'http'
				}
			}, config);

			// If the `baseUrl` passed to the loader is a relative path, it will cause `require.toUrl` to generate
			// non-absolute paths, which will break the URL remapping code in the `get` method of `lib/wd` (it will
			// slice too much data)
			if (config.loader.baseUrl) {
				config.loader.baseUrl = path.resolve(config.loader.baseUrl);
				args.config = path.relative(config.loader.baseUrl, path.resolve(args.config));
			}

			this.require(config.loader);

			if (!args.reporters) {
				if (config.reporters) {
					args.reporters = config.reporters;
				}
				else {
					args.reporters = 'runner';
				}
			}

			if (config.launcher.indexOf('/') === -1) {
				config.launcher = './lib/digdug/' + config.launcher;
			}

			config.launcherOptions.port = config.webdriver.port;
			config.launcherOptions.servers = (config.launcherOptions.servers || []).concat(config.proxyUrl);

			// Using concat to convert to an array since `args.reporters` might be an array or a scalar
			args.reporters = [].concat(args.reporters).map(function (reporterModuleId) {
				// Allow 3rd party reporters to be used simply by specifying a full mid, or built-in reporters by
				// specifying the reporter name only
				if (reporterModuleId.indexOf('/') === -1) {
					reporterModuleId = './lib/reporters/' + reporterModuleId;
				}
				return reporterModuleId;
			});

			require([ config.launcher ].concat(args.reporters), function (Launcher) {
				/*jshint maxcomplexity:13 */

				var launcher = new Launcher(config.launcherOptions);
				launcher.on('downloadprogress', function (progress) {
					topic.publish('/launcher/download/progress', launcher, progress);
				});
				launcher.on('status', function (status) {
					topic.publish('/launcher/status', launcher, status);
				});

				if (!config.webdriver.username) {
					// TODO: Must use username/password, not auth, because of restrictions in the dojo/request API;
					// fix the restriction, then fix this.
					var auth = launcher.clientAuth.split(':');
					config.webdriver.username = auth[0];
					config.webdriver.password = auth[1];
				}

				config.capabilities = lang.deepCopy(launcher.extraCapabilities, config.capabilities);

				// A hash map, { reporter module ID: reporter definition }
				var reporters = Array.prototype.slice.call(arguments, 1).reduce(function (map, reporter, i) {
					map[args.reporters[i]] = reporter;
					return map;
				}, {});

				reporterManager.add(reporters);

				(function () {
					var hasErrors = false;
					topic.subscribe('/error, /test/fail', function () {
						hasErrors = true;
					});
					process.on('exit', function () {
						// calling `process.exit` after the main test loop finishes will cause any remaining
						// in-progress operations to abort, which is undesirable if there are any asynchronous
						// I/O operations that a reporter wants to perform once all tests are complete; calling
						// from within the exit event avoids this problem by allowing Node.js to decide when to
						// terminate
						process.exit(hasErrors ? 1 : 0);
					});

					process.on('uncaughtException', function (error) {
						topic.publish('/error', error);
						process.exit(1);
					});
				})();

				config.proxyUrl = config.proxyUrl.replace(/\/*$/, '/');

				var basePath = (config.loader.baseUrl || process.cwd()) + '/';
				var proxy = createProxy({
					basePath: basePath,
					excludeInstrumentation: config.excludeInstrumentation,
					instrumenter: new Instrumenter({
						// coverage variable is changed primarily to avoid any jshint complaints, but also to make
						// it clearer where the global is coming from
						coverageVariable: '__internCoverage',

						// compacting code makes it harder to look at but it does not really matter
						noCompact: true,

						// auto-wrap breaks code
						noAutoWrap: true
					}),
					port: config.proxyPort
				});

				// Code in the runner should also provide instrumentation data; this is not normally necessary since
				// there shouldn’t typically be code under test running in the runner, but we do need this functionality
				// for testing leadfoot to avoid having to create the tunnel and proxy and so on ourselves
				var instrumenter = new Instrumenter({
					// coverage variable is changed primarily to avoid any jshint complaints, but also to make
					// it clearer where the global is coming from
					coverageVariable: '__internCoverage',

					// compacting code makes it harder to look at but it does not really matter
					noCompact: true,

					// auto-wrap breaks code
					noAutoWrap: true
				});

				hook.hookRunInThisContext(function (filename) {
					return !config.excludeInstrumentation ||
						// if the string passed to `excludeInstrumentation` changes here, it must also change in
						// `lib/createProxy.js`
						!config.excludeInstrumentation.test(filename.slice(basePath.length));
				}, function (code, filename) {
					return instrumenter.instrumentSync(code, path.resolve(filename));
				});

				// Running just the proxy and aborting is useful mostly for debugging, but also lets you get code
				// coverage reporting on the client if you want
				if (args.proxyOnly) {
					return;
				}

				main.maxConcurrency = config.maxConcurrency || Infinity;

				if (process.env.TRAVIS_COMMIT) {
					config.capabilities.build = process.env.TRAVIS_COMMIT;
				}

				util.flattenEnvironments(config.capabilities, config.environments).forEach(function (environmentType) {
					var suite = new Suite({
						name: 'main',
						publishAfterSetup: true,
						setup: function () {
							var server = new Server(config.webdriver);
							server.sessionConstructor = ProxiedSession;
							return server.createSession(environmentType).then(function (session) {
								session.proxyUrl = config.proxyUrl;
								session.proxyBasePathLength = basePath.length;

								var command = new Command(session);
								// TODO: Stop using remote.sessionId throughout the system
								command.sessionId = session.sessionId;
								suite.remote = command;

								command.environmentType = new EnvironmentType(session.capabilities);
								topic.publish('/session/start', command);
							});
						},
						teardown: function () {
							var remote = this.remote;

							function endSession() {
								topic.publish('/session/end', remote);

								return launcher.sendJobState(remote.session.sessionId, {
									success: suite.numFailedTests === 0 && !suite.error
								});
							}

							if (args.leaveRemoteOpen) {
								return endSession();
							}

							return remote.quit().always(endSession);
						}
					});

					suite.tests.push(new ClientSuite({ parent: suite, config: config }));
					main.suites.push(suite);
				});

				topic.publish('/launcher/start', launcher);
				launcher.start().then(function () {
					require(config.functionalSuites || [], function () {
						topic.publish('/runner/start');
						main.run().always(function () {
							/*global __internCoverage */
							typeof __internCoverage !== 'undefined' &&
								topic.publish('/coverage', '', __internCoverage);
							topic.publish('/runner/end');
							proxy.close();
							reporterManager.clear();

							return launcher.stop().then(function () {
								topic.publish('/launcher/stop', launcher);
							});
						}).otherwise(function (error) {
							console.error(error.stack || error);
						});
					});
				}, function (error) {
					topic.publish('/error', error);
				});
			});
		});
	});
}
