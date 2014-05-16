// TODO: This test needs to be fixed to not test the running copy of Intern
define([
	'intern!object',
	'intern/chai!assert',
	'require',
	'intern/lib/args'
], function (registerSuite, assert, require, args) {
	registerSuite({
		name: 'intern/main',

		setup: function () {
			// setup a new path to main so tests can load a distinct copy
			require({
				packages: [ { name: 'intern-maintest', location: '.' } ],
				map: { 'intern-maintest': { dojo: './node_modules/dojo' } }
			});
		},

		afterEach: function () {
			// clear out main for the next test that needs it
			require.undef('intern-maintest');
		},

		'.args': function () {
			var dfd = this.async();

			require([ 'intern' ], dfd.callback(function (main) {
				assert.deepEqual(main.args, args, 'Arguments should be exposed to tests via the main object');
			}));
		},

		'.config': function () {
			var dfd = this.async();

			require([ 'intern' ], dfd.callback(function (main) {
				assert.isObject(main.config, 'Configuration should be exposed to tests via the main object');
				assert.isTrue(main.config.isSelfTestConfig,
					'Configuration in use should be exposed to tests via the main object');
			}));
		},

		'.grep': function () {
			var dfd = this.async();
			require([ 'intern-maintest' ], dfd.callback(function (main) {
				main.args = {};

				// any test ID should be acceptable by default
				assert.isTrue(main.grep({ id: 'foo' }), 'Arbitrary test should be accepted by default');

				// grep should ignore a config property if _grepRegex is set
				main.config = { grep: 'bar' };
				assert.isTrue(main.grep({ id: 'foo' }), 'Grep should ignore config property');

				// grep should use a config property if _grepRegex is null
				main._grepRegex = null;
				assert.isFalse(main.grep({ id: 'foo' }), 'Grep should use config property');

				// grep should use a command line arg, and it should override a config property, if _grepRegex is null
				main._grepRegex = null;
				main.args.grep = 'baz';
				assert.isTrue(main.grep({ id: 'baz' }), 'Grep should use command line arg');
			}));
		},

		'.listTests': function () {
			var dfd = this.async();
			require([ 'intern-maintest' ], dfd.callback(function (main) {
				var suiteParams = { tests: [
						{ id: 'main - test 1' },
						{ id: 'main - test 2', tests: [ { id: 'main - test 2 - subTest 1' } ] }
					] },
					expected = [ 'main - test 1', 'main - test 2 - subTest 1' ];

				main.suites.push(suiteParams);
				var tests = main.listTests();
				assert.deepEqual(tests, expected, 'Expected tests should have been listed');
			}));
		}
	});
});
