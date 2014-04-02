define([
	'intern!object',
	'intern/chai!assert',
	'dojo/promise/all',
	'./support/util',
	'../../../lib/leadfoot/strategies',
	'require'
], function (registerSuite, assert, whenAll, util, strategies, require) {
	registerSuite(function () {
		var session;

		function createStubbedSuite(stubbedMethodName, testMethodName, placeholders, firstArguments) {
			var originalMethod;
			var calledWith;
			var extraArguments = [];
			var suite = {
				setup: function () {
					originalMethod = session[stubbedMethodName];
					session[stubbedMethodName] = function () {
						calledWith = arguments;
					};

					for (var i = 0, j = originalMethod.length - 1; i < j; ++i) {
						extraArguments.push('ok' + (i + 2));
					}
				},
				beforeEach: function () {
					calledWith = null;
				},

				teardown: function () {
					session[stubbedMethodName] = originalMethod;
				}
			};

			placeholders.forEach(function (placeholder, index) {
				var method = testMethodName.replace('_', placeholder);

				suite['#' + method] = function () {
					assert.isFunction(session[method]);
					session[method].apply(session, extraArguments);
					assert.ok(calledWith);
					assert.strictEqual(calledWith[0], firstArguments[index]);
					assert.deepEqual(Array.prototype.slice.call(calledWith, 1), extraArguments);
				};
			});

			return suite;
		}

		function createStorageTests(type) {
			var clear = 'clear' + type + 'Storage';
			var getKeys = 'get' + type + 'StorageKeys';
			var get = 'get' + type + 'StorageItem';
			var set = 'set' + type + 'StorageItem';
			var del = 'delete' + type + 'StorageItem';
			var getLength = 'get' + type + 'StorageLength';

			return function () {
				if (!session.capabilities.webStorageEnabled) {
					return;
				}

				return session.get(require.toUrl('./data/default.html')).then(function () {
					return session[set]('foo', 'foo');
				}).then(function () {
					return session[clear]();
				}).then(function () {
					return session[getLength]();
				}).then(function (length) {
					assert.strictEqual(length, 0, 'Cleared storage should contain no data');
					return session[set]('foo', 'foo');
				}).then(function () {
					return session[set]('bar', 'bar');
				}).then(function () {
					return session[set]('foo', 'foofoo');
				}).then(function () {
					return session[getLength]();
				}).then(function (length) {
					assert.strictEqual(length, 2, 'Getting size should return the number of data items in storage');
					return session[getKeys]();
				}).then(function (keys) {
					assert.sameMembers(keys, [ 'foo', 'bar' ], 'Storage should contain set keys');
					return session[get]('foo');
				}).then(function (value) {
					assert.strictEqual(value, 'foofoo', 'Getting item should retrieve correct stored value');
					return session[del]('not-existing');
				}).then(function () {
					return session[getLength]();
				}).then(function (length) {
					assert.strictEqual(length, 2, 'Deleting non-existing key should not change size of storage');
					return session[del]('foo');
				}).then(function () {
					return session[getKeys]();
				}).then(function (keys) {
					assert.deepEqual(keys, [ 'bar' ], 'Deleting existing key should reduce size of storage');
					return session[clear]();
				}).otherwise(function (error) {
					return session[clear]().then(function () {
						throw error;
					});
				});
			};
		}

		return {
			name: 'lib/leadfoot/Session',

			setup: function () {
				return util.createSessionFromRemote(this.remote).then(function () {
					session = arguments[0];
				});
			},

			beforeEach: function () {
				return session.get('about:blank').then(function () {
					return session.setTimeout('implicit', 0);
				});
			},

			'#getTimeout script': function () {
				return session.getTimeout('script').then(function (value) {
					assert.strictEqual(value, 0, 'Async execution timeout should be default value');
				});
			},

			'#getTimeout implicit': function () {
				return session.getTimeout('implicit').then(function (value) {
					assert.strictEqual(value, 0, 'Implicit timeout should be default value');
				});
			},

			'#getTimeout page load': function () {
				return session.getTimeout('page load').then(function (value) {
					assert.strictEqual(value, Infinity, 'Page load timeout should be default value');
				});
			},

			'#getTimeout convenience methods': createStubbedSuite(
				'getTimeout',
				'get_Timeout',
				[ 'ExecuteAsync', 'Implicit', 'PageLoad' ],
				[ 'script', 'implicit', 'page load' ]
			),

			'#setTimeout convenience methods': createStubbedSuite(
				'setTimeout',
				'set_Timeout',
				[ 'ExecuteAsync', 'Implicit', 'PageLoad' ],
				[ 'script', 'implicit', 'page load' ]
			),

			'window handle information (#getCurrentWindowHandle, #getAllWindowHandles)': function () {
				var currentHandle;

				return session.getCurrentWindowHandle().then(function (handle) {
					assert.isString(handle);
					currentHandle = handle;
					return session.getAllWindowHandles();
				}).then(function (handles) {
					assert.isArray(handles);
					assert.lengthOf(handles, 1);
					assert.strictEqual(handles[0], currentHandle);
				});
			},

			'#get': function () {
				return session.get(require.toUrl('./data/default.html'));
			},

			'#get 404': function () {
				return session.get(require.toUrl('./data/404.html'));
			},

			'#getCurrentUrl': function () {
				var expectedUrl = util.convertPathToUrl(this.remote, require.toUrl('./data/default.html'));

				return session.get(expectedUrl).then(function () {
					return session.getCurrentUrl();
				}).then(function (currentUrl) {
					assert.strictEqual(currentUrl, expectedUrl);
				});
			},

			'navigation (#refresh, #goBack, #goForward)': function () {
				var expectedUrl = util.convertPathToUrl(this.remote, require.toUrl('./data/default.html?second'));
				var expectedBackUrl = util.convertPathToUrl(this.remote, require.toUrl('./data/default.html?first'));

				return session.get(expectedBackUrl).then(function () {
					return session.get(expectedUrl);
				}).then(function () {
					return session.refresh();
				}).then(function () {
					return session.getCurrentUrl();
				}).then(function (currentUrl) {
					assert.strictEqual(currentUrl, expectedUrl, 'Refreshing the page should load the same URL');
					return session.goBack();
				}).then(function () {
					return session.getCurrentUrl();
				}).then(function (currentUrl) {
					assert.strictEqual(currentUrl, expectedBackUrl);
					return session.goForward();
				}).then(function () {
					return session.getCurrentUrl();
				}).then(function (currentUrl) {
					assert.strictEqual(currentUrl, expectedUrl);
				});
			},

			'#execute string': function () {
				return session.get(require.toUrl('./data/scripting.html'))
					.then(function () {
						return session.execute(
							'return interns[arguments[0]] + interns[arguments[1]];',
							[ 'ness', 'paula' ]
						);
					})
					.then(function (result) {
						assert.strictEqual(result, 'NessPaula');
					});
			},

			'#execute function': function () {
				return session.get(require.toUrl('./data/scripting.html'))
					.then(function () {
						return session.execute(function (first, second) {
							/*global interns:false */
							return interns[first] + interns[second];
						}, [ 'ness', 'paula' ]);
					})
					.then(function (result) {
						assert.strictEqual(result, 'NessPaula');
					});
			},

			'#execute -> element': function () {
				return session.get(require.toUrl('./data/scripting.html'))
					.then(function () {
						return session.execute(function () {
							return document.getElementById('child');
						});
					})
					.then(function (element) {
						assert.property(element, 'elementId', 'Returned value should be an Element object');
					});
			},

			'#execute -> elements': function () {
				return session.get(require.toUrl('./data/scripting.html'))
					.then(function () {
						return session.execute(function () {
							return [ interns.poo, document.getElementById('child') ];
						});
					})
					.then(function (elements) {
						assert.isArray(elements);
						assert.strictEqual(elements[0], 'Poo', 'Non-elements should not be converted');
						assert.property(elements[1], 'elementId', 'Returned elements should be Element objects');
					});
			},

			'#execute -> error': function () {
				return session.get(require.toUrl('./data/scripting.html'))
					.then(function () {
						return session.execute(function () {
							/*global interns:false */
							return interns();
						});
					})
					.then(function () {
						throw new Error('Invalid code execution should throw error');
					}, function (error) {
						assert.strictEqual(
							error.name,
							'JavaScriptError',
							'Invalid user code should throw per the spec'
						);
					});
			},

			'#executeAsync': (function () {
				var originalTimeout;

				return {
					setup: function () {
						return session.getTimeout('script').then(function (value) {
							originalTimeout = value;
							return session.setTimeout('script', 1000);
						});
					},
					'string': function () {
						return session.get(require.toUrl('./data/scripting.html'))
							.then(function () {
								/*jshint maxlen:140 */
								return session.executeAsync(
									'var args = arguments; setTimeout(function () { args[2](interns[args[0]] + interns[args[1]]); }, 100);',
									[ 'ness', 'paula' ]
								);
							})
							.then(function (result) {
								assert.strictEqual(result, 'NessPaula');
							});
					},
					'function': function () {
						return session.get(require.toUrl('./data/scripting.html'))
							.then(function () {
								return session.executeAsync(function (first, second, done) {
									setTimeout(function () {
										done(interns[first] + interns[second]);
									}, 100);
								}, [ 'ness', 'paula' ]);
							})
							.then(function (result) {
								assert.strictEqual(result, 'NessPaula');
							});
					},
					' -> error': function () {
						return session.get(require.toUrl('./data/scripting.html'))
							.then(function () {
								return session.executeAsync(function (done) {
									/*global interns:false */
									done(interns());
								});
							})
							.then(function () {
								throw new Error('Invalid code execution should throw error');
							}, function (error) {
								assert.strictEqual(
									error.name,
									'JavaScriptError',
									'Invalid user code should throw an error matching the spec'
								);
							});
					},
					teardown: function () {
						return session.setTimeout('script', originalTimeout);
					}
				};
			})(),

			'#takeScreenshot': function () {
				if (!session.capabilities.takesScreenshot) {
					return;
				}

				var magic = [ 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a ];

				return session.takeScreenshot().then(function (screenshot) {
					/*jshint node:true */
					assert.isTrue(Buffer.isBuffer(screenshot), 'Screenshot should be a Buffer');
					assert.deepEqual(screenshot.slice(0, 8).toJSON(), magic, 'Screenshot should be a PNG file');
				});
			},

			// TODO: There appear to be no drivers that support IME input to actually test IME commands

			'frame switching (#switchToFrame, #switchToParentFrame)': function () {
				return session.get(require.toUrl('./data/window.html')).then(function () {
					return session.getElementById('child');
				})
				.then(function (child) {
					return child.getVisibleText();
				})
				.then(function (text) {
					assert.strictEqual(text, 'Main');
					return session.switchToFrame('inlineFrame');
				})
				.then(function () {
					return session.getElementById('child');
				})
				.then(function (child) {
					return child.getVisibleText();
				})
				.then(function (text) {
					assert.strictEqual(text, 'Frame');
					return session.switchToParentFrame();
				})
				.then(function () {
					return session.getElementById('child');
				})
				.then(function (child) {
					return child.getVisibleText();
				})
				.then(function (text) {
					assert.strictEqual(text, 'Main');
				});
			},

			'window switching (#switchToWindow, #closeCurrentWindow)': function () {
				var mainHandle;
				return session.get(require.toUrl('./data/window.html')).then(function () {
					return session.getCurrentWindowHandle();
				}).then(function (handle) {
					mainHandle = handle;
					return session.getElementById('windowOpener');
				}).then(function (opener) {
					return opener.click();
				}).then(function () {
					return session.switchToWindow('popup');
				}).then(function () {
					return session.getCurrentWindowHandle();
				}).then(function (popupHandle) {
					assert.notStrictEqual(popupHandle, mainHandle, 'Window handle should have switched to pop-up');
					return session.closeCurrentWindow();
				}).then(function () {
					return session.getCurrentWindowHandle();
				}).then(function () {
					throw new Error('Window should have closed');
				}, function (error) {
					assert.strictEqual(error.name, 'NoSuchWindow');
					return session.switchToWindow(mainHandle);
				}).then(function () {
					return session.getCurrentWindowHandle();
				}).then(function (handle) {
					assert.strictEqual(handle, mainHandle, 'Window handle should have switched back to main window');
				});
			},

			'window sizing (#getWindowSize, #setWindowSize)': function () {
				var originalSize;
				var resizedSize;
				return session.getWindowSize().then(function (size) {
					assert.property(size, 'width');
					assert.property(size, 'height');
					originalSize = size;

					if (session.capabilities.dynamicViewport) {
						return session.setWindowSize(size.width + 20, size.height + 20).then(function () {
							return session.getWindowSize();
						}).then(function (size) {
							assert.strictEqual(size.width, originalSize.width + 20);
							assert.strictEqual(size.height, originalSize.height + 20);
							resizedSize = size;
							return session.maximizeWindow();
						}).then(function () {
							return session.getWindowSize();
						}).then(function (size) {
							assert.operator(size.width, '>', resizedSize.width);
							assert.operator(size.height, '>', resizedSize.height);
						}).then(function () {
							return session.setWindowSize(originalSize.width, originalSize.height);
						});
					}
				});
			},

			'window positioning (#getWindowPosition, #setWindowPosition)': function () {
				if (!session.capabilities.dynamicViewport) {
					return;
				}

				var originalPosition;
				return session.getWindowPosition().then(function (position) {
					assert.property(position, 'x');
					assert.property(position, 'y');
					originalPosition = position;

					return session.setWindowPosition(position.x + 2, position.y + 2);
				}).then(function () {
					return session.getWindowPosition();
				}).then(function (position) {
					assert.strictEqual(position.x, originalPosition.x + 2);
					assert.strictEqual(position.y, originalPosition.y + 2);
				});
			},

			'cookies (#getCookies, #setCookie, #clearCookies, #deleteCookie)': function () {
				return session.get(require.toUrl('./data/default.html')).then(function () {
					return session.setCookie({ name: 'foo', value: '123' });
				}).then(function () {
					return session.clearCookies();
				}).then(function () {
					return session.getCookies();
				}).then(function (cookies) {
					assert.lengthOf(cookies, 0);
					return session.setCookie({ name: 'foo', value: '123' });
				}).then(function () {
					return session.setCookie({ name: 'bar', value: '234' });
				}).then(function () {
					return session.setCookie({ name: 'baz', value: '345' });
				}).then(function () {
					return session.setCookie({ name: 'baz', value: '456' });
				}).then(function () {
					return session.deleteCookie('bar');
				}).then(function () {
					return session.getCookies();
				}).then(function (cookies) {
					assert.lengthOf(cookies, 2);

					// Different browsers return cookies in different orders; some return the last modified cookie
					// first, others return the first created cookie first
					var fooCookie = cookies[0].name === 'foo' ? cookies[0] : cookies[1];
					var bazCookie = cookies[0].name === 'baz' ? cookies[0] : cookies[1];

					assert.strictEqual(bazCookie.name, 'baz');
					assert.strictEqual(bazCookie.value, '456');
					assert.strictEqual(fooCookie.name, 'foo');
					assert.strictEqual(fooCookie.value, '123');
					return session.clearCookies();
				}).then(function () {
					return session.getCookies();
				}).then(function (cookies) {
					assert.lengthOf(cookies, 0);
					return session.clearCookies();
				}).otherwise(function (error) {
					return session.clearCookies().then(function () {
						throw error;
					});
				});
			},

			'#getPageSource': function () {
				// Page source is serialised from the current DOM, so will not match the original source on file
				return session.get(require.toUrl('./data/default.html')).then(function () {
					return session.getPageSource();
				}).then(function (source) {
					assert.include(source, '<meta charset="utf-8"');
					assert.include(source, '<title>Default</title>');
					assert.include(source, 'Are you kay-o?');
				});
			},

			'#getPageTitle': function () {
				return session.get(require.toUrl('./data/default.html')).then(function () {
					return session.getPageTitle();
				}).then(function (pageTitle) {
					assert.strictEqual(pageTitle, 'Default');
				});
			},

			'#getElement': (function () {
				function getId(element) {
					assert.property(element, 'elementId', 'Returned object should look like an element object');
					return element.getAttribute('id');
				}

				return function () {
					return session.get(require.toUrl('./data/elements.html')).then(function () {
						return session.getElement('id', 'a');
					}).then(getId).then(function (id) {
						assert.strictEqual(id, 'a');
						return session.getElement('class name', 'b');
					}).then(getId).then(function (id) {
						assert.strictEqual(id, 'b2', 'Returned element should be the first in the document');
						return session.getElement('css selector', '#c span.b');
					}).then(getId).then(function (id) {
						assert.strictEqual(id, 'b3');
						return session.getElement('name', 'makeD');
					}).then(getId).then(function (id) {
						assert.strictEqual(id, 'makeD');
						return session.getElement('link text', 'What a cute, yellow backpack.');
					}).then(getId).then(function (id) {
						assert.strictEqual(id, 'c');
						return session.getElement('partial link text', 'cute, yellow');
					}).then(getId).then(function (id) {
						assert.strictEqual(id, 'c');
						return session.getElement('tag name', 'span');
					}).then(getId).then(function (id) {
						assert.strictEqual(id, 'b3');
						return session.getElement('xpath', 'id("e")/span[1]');
					}).then(getId).then(function (id) {
						assert.strictEqual(id, 'f');
						return session.getElement('id', 'does-not-exist');
					}).then(function () {
						throw new Error('Requesting non-existing element should throw error');
					}, function (error) {
						assert.strictEqual(error.name, 'NoSuchElement');
					});
				};
			})(),

			'#getElement (with implicit timeout)': (function () {
				var startTime;
				return function () {
					return session.get(require.toUrl('./data/elements.html')).then(function () {
						return session.setTimeout('implicit', 2000);
					}).then(function () {
						startTime = Date.now();
						return session.getElement('id', 'd');
					}).then(function () {
						throw new Error('Requesting non-existing element should throw error');
					}, function () {
						assert.closeTo(Date.now(), startTime + 2000, 500,
							'Driver should wait for implicit timeout before continuing');
						return session.getElement('id', 'makeD');
					}).then(function (element) {
						return element.click();
					}).then(function () {
						startTime = Date.now();
						return session.getElement('id', 'd');
					}).then(function (element) {
						assert.closeTo(Date.now(), startTime + 250, 500,
							'Driver should not wait until end of implicit timeout once element is available');
						assert.property(element, 'elementId');
						return element.getAttribute('id');
					}).then(function (id) {
						assert.strictEqual(id, 'd');
					});
				};
			})(),

			'#getElements': (function () {
				function getIds(elements) {
					elements.forEach(function (element, index) {
						assert.property(element, 'elementId', 'Returned object ' + index +
							' should look like an element object');
					});

					return whenAll(elements.map(function (element) {
						return element.getAttribute('id');
					}));
				}

				return function () {
					return session.get(require.toUrl('./data/elements.html')).then(function () {
						return session.getElements('id', 'a');
					}).then(getIds).then(function (ids) {
						assert.deepEqual(ids, [ 'a' ]);
						return session.getElements('class name', 'b');
					}).then(getIds).then(function (ids) {
						assert.deepEqual(ids, [ 'b2', 'b1', 'b3', 'b4' ]);
						return session.getElements('css selector', '#c span.b');
					}).then(getIds).then(function (ids) {
						assert.deepEqual(ids, [ 'b3', 'b4' ]);
						return session.getElements('name', 'makeD');
					}).then(getIds).then(function (ids) {
						assert.deepEqual(ids, [ 'makeD', 'killE' ]);
						return session.getElements('link text', 'What a cute, yellow backpack.');
					}).then(getIds).then(function (ids) {
						assert.deepEqual(ids, [ 'c', 'c2' ]);
						return session.getElements('partial link text', 'cute, yellow');
					}).then(getIds).then(function (ids) {
						assert.deepEqual(ids, [ 'c', 'c2' ]);
						return session.getElements('tag name', 'span');
					}).then(getIds).then(function (ids) {
						assert.deepEqual(ids, [ 'b3', 'b4', 'f', 'g' ]);
						return session.getElements('xpath', 'id("e")/span');
					}).then(getIds).then(function (ids) {
						assert.deepEqual(ids, [ 'f', 'g' ]);
						return session.getElements('id', 'does-not-exist');
					}).then(function (elements) {
						assert.deepEqual(elements, []);
					});
				};
			})(),

			'#getElement convenience methods': createStubbedSuite(
				'getElement',
				'getElementBy_',
				strategies.suffixes,
				strategies
			),

			'#getElements convenience methods': createStubbedSuite(
				'getElements',
				'getElementsBy_',
				strategies.suffixes.filter(function (suffix) { return suffix !== 'Id'; }),
				strategies.filter(function (strategy) { return strategy !== 'id'; })
			),

			// TODO: waitForDeletedElement

			'#waitForDeletedElement convenience methods': createStubbedSuite(
				'waitForDeletedElement',
				'waitForDeletedElementBy_',
				strategies.suffixes,
				strategies
			),

			'#getActiveElement': (function () {
				return function () {
					return session.get(require.toUrl('./data/form.html')).then(function () {
						return session.getActiveElement();
					}).then(function (element) {
						return element.getTagName();
					}).then(function (tagName) {
						assert.strictEqual(tagName, 'body');
						return session.execute(function () {
							document.getElementById('input').focus();
						});
					}).then(function () {
						return session.getActiveElement();
					}).then(function (element) {
						return element.getAttribute('id');
					}).then(function (id) {
						assert.strictEqual(id, 'input');
					});
				};
			})(),

			'#type': function () {
				var formElement;

				return session.get(require.toUrl('./data/form.html')).then(function () {
					return session.getElementById('input');
				}).then(function (element) {
					formElement = element;
					return element.click();
				}).then(function () {
					return session.type('hello, world');
				}).then(function () {
					return formElement.getAttribute('value');
				}).then(function (value) {
					assert.strictEqual(value, 'hello, world');
				});
			},

			'#getOrientation': function () {
				if (!session.capabilities.rotatable) {
					return;
				}

				return session.getOrientation().then(function (value) {
					assert.include([ 'PORTRAIT', 'LANDSCAPE' ], value);
				});
			},

			'#setOrientation': function () {
				if (!session.capabilities.rotatable) {
					return;
				}

				return session.setOrientation('LANDSCAPE').then(function () {
					return session.setOrientation('PORTRAIT');
				});
			},

			'#getAlertText': function () {
				if (!session.capabilities.handlesAlerts) {
					return;
				}

				return session.get(require.toUrl('./data/prompts.html')).then(function () {
					return session.getElementById('alert');
				}).then(function (element) {
					return element.click();
				}).then(function () {
					return session.getAlertText();
				}).then(function (alertText) {
					assert.strictEqual(alertText, 'Oh, you thank.');
					return session.acceptAlert();
				}).then(function () {
					return session.execute('return result.alert;');
				}).then(function (result) {
					assert.isTrue(result);
				});
			},

			'#typeInPrompt': function () {
				if (!session.capabilities.handlesAlerts) {
					return;
				}

				return session.get(require.toUrl('./data/prompts.html')).then(function () {
					return session.getElementById('prompt');
				}).then(function (element) {
					return element.click();
				}).then(function () {
					return session.getAlertText();
				}).then(function (alertText) {
					assert.strictEqual(alertText, 'The monkey... got charred. Is he all right?');
					return session.typeInPrompt('yes');
				}).then(function () {
					return session.acceptAlert();
				}).then(function () {
					return session.execute('return result.prompt;');
				}).then(function (result) {
					assert.strictEqual(result, 'yes');
				});
			},

			'#acceptAlert': function () {
				if (!session.capabilities.handlesAlerts) {
					return;
				}

				return session.get(require.toUrl('./data/prompts.html')).then(function () {
					return session.getElementById('confirm');
				}).then(function (element) {
					return element.click();
				}).then(function () {
					return session.getAlertText();
				}).then(function (alertText) {
					assert.strictEqual(alertText, 'Would you like some bananas?');
					return session.acceptAlert();
				}).then(function () {
					return session.execute('return result.confirm;');
				}).then(function (result) {
					assert.isTrue(result);
				});
			},

			'#dismissAlert': function () {
				if (!session.capabilities.handlesAlerts) {
					return;
				}

				return session.get(require.toUrl('./data/prompts.html')).then(function () {
					return session.getElementById('confirm');
				}).then(function (element) {
					return element.click();
				}).then(function () {
					return session.getAlertText();
				}).then(function (alertText) {
					assert.strictEqual(alertText, 'Would you like some bananas?');
					return session.dismissAlert();
				}).then(function () {
					return session.execute('return result.confirm;');
				}).then(function (result) {
					assert.isFalse(result);
				});
			},

			'#moveMouseTo': function () {
				if (!session.capabilities.mouseEnabled) {
					return;
				}

				return session.get(require.toUrl('./data/pointer.html')).then(function () {
					return session.moveMouseTo(100, 12);
				}).then(function () {
					return session.execute('return result.mousemove.a;');
				}).then(function (event) {
					assert.strictEqual(event.clientX, 100);
					assert.strictEqual(event.clientY, 12);
					return session.moveMouseTo(100, 41);
				}).then(function () {
					return session.execute('return result.mousemove.b;');
				}).then(function (event) {
					assert.strictEqual(event.clientX, 200);
					assert.strictEqual(event.clientY, 53);
					return session.getElementById('c');
				}).then(function (element) {
					return session.moveMouseTo(element).then(function () {
						return session.execute('return result.mousemove.c;');
					}).then(function (event) {
						assert.closeTo(event.clientX, 450, 4);
						assert.closeTo(event.clientY, 90, 4);
						return session.moveMouseTo(element, 2, 4);
					});
				}).then(function () {
					return session.execute('return result.mousemove.c;');
				}).then(function (event) {
					assert.closeTo(event.clientX, 352, 4);
					assert.closeTo(event.clientY, 80, 4);
				});
			},

			'#click': function () {
				if (!session.capabilities.mouseEnabled) {
					return;
				}

				function click(button) {
					return function () {
						return session.click(button).then(function () {
							return session.execute('return result.click.a;');
						}).then(function (event) {
							assert.strictEqual(event.button, button);
							return session.execute('return result.mousedown.a;').then(function (mouseDownEvent) {
								assert.closeTo(event.timeStamp, mouseDownEvent.timeStamp, 300);
								assert.operator(mouseDownEvent.timeStamp, '<=', event.timeStamp);
								return session.execute('return result.mouseup.a;');
							}).then(function (mouseUpEvent) {
								assert.closeTo(event.timeStamp, mouseUpEvent.timeStamp, 300);
								assert.operator(mouseUpEvent.timeStamp, '<=', event.timeStamp);
							});
						});
					};
				}

				return session.get(require.toUrl('./data/pointer.html')).then(function () {
					return session.getElementById('a');
				}).then(function (element) {
					return session.moveMouseTo(element);
				}).then(click(0));

				// TODO: Right-click/middle-click are unreliable in browsers; find a way to test them.
			},

			'#pressMouseButton, #releaseMouseButton': function () {
				if (!session.capabilities.mouseEnabled) {
					return;
				}

				return session.get(require.toUrl('./data/pointer.html')).then(function () {
					return session.getElementById('a');
				}).then(function (element) {
					return session.moveMouseTo(element);
				}).then(function () {
					return session.pressMouseButton();
				}).then(function () {
					return session.getElementById('b');
				}).then(function (element) {
					return session.moveMouseTo(element);
				}).then(function () {
					return session.releaseMouseButton();
				}).then(function () {
					/*jshint maxlen:140 */
					return session.execute('return result;');
				}).then(function (result) {
					assert.isUndefined(result.mouseup.a);
					assert.isUndefined(result.mousedown.b);
					assert.isObject(result.mousedown.a);
					assert.isObject(result.mouseup.b);
				});
			},

			'#doubleClick': function () {
				if (!session.capabilities.mouseEnabled) {
					return;
				}

				return session.get(require.toUrl('./data/pointer.html')).then(function () {
					return session.getElementById('a');
				}).then(function (element) {
					return session.moveMouseTo(element);
				}).then(function () {
					return session.doubleClick();
				}).then(function () {
					return session.execute('return result');
				}).then(function (result) {
					assert.isObject(result.mousedown.a);
					assert.isObject(result.mouseup.a);
					assert.isObject(result.click.a);
					assert.isObject(result.dblclick.a);

					assert.operator(result.mousedown.a.timeStamp, '<=', result.mouseup.a.timeStamp);
					assert.operator(result.mouseup.a.timeStamp, '<=', result.click.a.timeStamp);
					assert.operator(result.click.a.timeStamp, '<=', result.dblclick.a.timeStamp);
				});
			},

			// TODO: Touch

			'geolocation (#getGeolocation, #setGeolocation)': function () {
				if (!session.capabilities.locationContextEnabled) {
					return;
				}

				return session.get(require.toUrl('./data/default.html')).then(function () {
					return session.setGeolocation({ latitude: 123, longitude: -22.334455, altitude: 1000 });
				}).then(function () {
					return session.getGeolocation();
				}).then(function (location) {
					assert.isObject(location);
					assert.strictEqual(location.latitude, 123);
					assert.strictEqual(location.longitude, -22.334455);

					// Geolocation implementations that cannot provide altitude information shall return `null`,
					// http://dev.w3.org/geo/api/spec-source.html#altitude
					if (location.altitude !== null) {
						assert.strictEqual(location.altitude, 1000);
					}
				});
			},

			'#getLogsFor': function () {
				return session.get(require.toUrl('./data/default.html')).then(function () {
					return session.getAvailableLogTypes();
				}).then(function (types) {
					return session.getLogsFor(types[0]);
				}).then(function (logs) {
					assert.isArray(logs);

					if (logs.length) {
						var log = logs[0];
						assert.isObject(log);
						assert.property(log, 'timestamp');
						assert.property(log, 'level');
						assert.property(log, 'message');
						assert.isNumber(log.timestamp);
						assert.isString(log.level);
						assert.isString(log.message);
					}
				});
			},

			'#getAvailableLogTypes': function () {
				return session.get(require.toUrl('./data/default.html')).then(function () {
					return session.getAvailableLogTypes();
				}).then(function (types) {
					assert.isArray(types);
				});
			},

			'#getApplicationCacheStatus': function () {
				if (!session.capabilities.applicationCacheEnabled) {
					return;
				}

				return session.get(require.toUrl('./data/default.html')).then(function () {
					return session.getApplicationCacheStatus();
				}).then(function (status) {
					assert.strictEqual(status, 0);
				});
			},

			'local storage': createStorageTests('Local'),
			'session storage': createStorageTests('Session')
		};
	});
});
