define([
	'require',
	'dojo/_base/array',
	'dojo/Deferred',
	'./lib/args',
	'./lib/util'
], function (require, array, Deferred, args, util) {
	return {
		/**
		 * The mode in which Intern is currently running. Either 'client' or 'runner'.
		 */
		mode: null,

		/**
		 * The arguments received from the environment for the current test run.
		 */
		args: args,

		/**
		 * The configuration data in use for the current test run.
		 */
		config: null,

		/**
		 * Maximum number of suites to run concurrently. Currently used only by the server-side runner.
		 */
		maxConcurrency: Infinity,

		/**
		 * Suites to run. Each suite defined here corresponds to a single environment.
		 */
		suites: [],

		/**
		 * Regular expression to use for test filtering. Exposed for testability.
		 */
		_grepRegex: null,

		/**
		 * Runs all environmental suites concurrently, with a concurrency limit.
		 */
		run: function () {
			var dfd = new Deferred(),
				queue = util.createQueue(this.maxConcurrency),
				numSuitesCompleted = 0,
				numSuitesToRun = this.suites.length;

			array.forEach(this.suites, queue(function (suite) {
				return suite.run().always(function () {
					if (++numSuitesCompleted === numSuitesToRun) {
						dfd.resolve();
					}
					else {
						console.log('%d environments left to test', numSuitesToRun - numSuitesCompleted);
					}
				});
			}));

			return dfd.promise;
		},

		/**
		 * Filter tests based on test ID
		 */
		grep: function (test) {
			if (!this._grepRegex) {
				if (this.args && this.args.grep) {
					this._grepRegex = new RegExp(this.args.grep);
				}
				else if (this.config && this.config.grep) {
					this._grepRegex = this.config.grep;
				}
				else {
					this._grepRegex = /./;
				}

				if (!(this._grepRegex instanceof RegExp)) {
					this._grepRegex = new RegExp(this._grepRegex);
				}
			}
			return this._grepRegex.test(test.id);
		},

		/**
		 * Traverse and print the set of registered tests
		 */
		listTests: function (suite, tests) {
			var i, suiteTests, test;

			if (!tests) {
				tests = [];
			}

			if (!suite) {
				for (i = 0; i < this.suites.length; i++) {
					this.listTests(this.suites[i], tests);
				}
			}
			else {
				suiteTests = suite.tests;
				for (i = 0; i < suiteTests.length; i++) {
					test = suiteTests[i];
					if (test.tests) {
						this.listTests(test, tests);
					}
					else {
						tests.push(test.id);
					}
				}
			}

			return tests;
		},

		/**
		 * AMD plugin API interface for easy loading of test interfaces.
		 */
		load: function (id, parentRequire, callback) {
			require([ './lib/interfaces/' + id ], callback);
		}
	};
});
