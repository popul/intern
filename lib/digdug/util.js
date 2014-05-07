define([
	'dojo/Deferred'
], function (Deferred) {
	var hasOwnProperty = Object.prototype.hasOwnProperty;

	return {
		deferred: function (canceller) {
			var dfd = new Deferred(canceller);
			dfd.rejectOnError = function (callback) {
				return function () {
					try {
						return callback.apply(this, arguments);
					}
					catch (error) {
						dfd.reject(error);
					}
				};
			};

			return dfd;
		},

		mixin: function (target) {
			for (var i = 1, j = arguments.length; i < j; ++i) {
				var source = arguments[i];
				for (var key in source) {
					if (hasOwnProperty.call(source, key)) {
						Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key));
					}
				}
			}

			return target;
		},

		on: function (emitter, event, listener) {
			emitter.on(event, listener);
			return {
				remove: function () {
					this.remove = function () {};
					emitter.removeListener(event, listener);
				}
			};
		}
	};
});
