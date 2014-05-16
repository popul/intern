define([
	'dojo/_base/array',
	'dojo/aspect',
	'../../main',
	'../Suite',
	'../Test'
], function (array, aspect, main, Suite, Test) {
	function registerSuite(descriptor, parentSuite) {
		var suite = new Suite({ parent: parentSuite }),
			tests = suite.tests,
			test,
			t,
			k;

		for (k in descriptor) {
			test = descriptor[k];

			if (k === 'before') {
				k = 'setup';
			}
			if (k === 'after') {
				k = 'teardown';
			}

			switch (k) {
			case 'name':
				suite.name = test;
				break;
			case 'setup':
			case 'beforeEach':
			case 'afterEach':
			case 'teardown':
				aspect.after(suite, k, test);
				break;
			default:
				if (typeof test !== 'function') {
					test.name = test.name || k;
					registerSuite(test, suite);
				}
				else {
					t = new Test({ name: k, test: test, parent: suite });
					main.grep(t) && tests.push(t);
				}
			}
		}

		if (suite.tests.length > 0) {
			parentSuite.tests.push(suite);
		}
	}

	return function (mainDescriptor) {
		array.forEach(main.suites, function (suite) {
			var descriptor = mainDescriptor;

			// enable per-suite closure, to match feature parity with other interfaces like tdd/bdd more closely;
			// without this, it becomes impossible to use the object interface for functional tests since there is no
			// other way to create a closure for each main suite
			if (typeof descriptor === 'function') {
				descriptor = descriptor();
			}

			registerSuite(descriptor, suite);
		});
	};
});
