/*
 *	Title: jQuery Client Side Logging Plugin
 *	Author: Aaron Woehler (Adapted from jQuery.clientSideLogging by Rémy Bach)
 *	Version: 0.0.1
 *	License: http://mit-license.org
 *	Url: http://github.com/awoehler/jQuery.plog
 *	Description:
 *  This plugin allows you to store front end log/info/error/debug messages on the server or in localStorage/sessionStorage. 
 *	The original plugin was written by Rémy Bach https://github.com/remybach/jQuery.clientSideLogging
 */
(function($) {
	var locked = false;
	try {
		locked = JSON.parse( localStorage.getItem('plogLock'));
		locked = locked == null ? false : locked;
	} catch( e ) {
		alert('HTML5 and JSON.parse are required for the jQUery.plog.js plugin');
		return;
	}
	/*===== Run polyfill for console first. =====*/
	// Make sure browsers that don't have console don't completely die.
	if (!window.console) {
		console = {};
	}
	// Make console.* behave like proper Functions in IE.
	if (window.console && typeof console.log == "object") {
		$.each(["log","info","warn","error","debug","assert","dir","clear","profile","profileEnd"], function(i, method) {
			console[method] = $.proxy(console[method], console);
		});
	}
	/*===== End polyfill for console. =====*/

	var defaults = {
			sendAJAX: true,
			error_url: '/log/?type=error',	// The url to which errors logs are sent
			info_url: '/log/?type=info',	// The url to which info logs are sent
			log_url: '/log/?type=log',		// The url to which standard logs are sent
			debug_url: '/log/?type=debug',
			log_level: 1,					// The level at which to log. This allows you to keep the calls to the logging in your code and just change this variable to log varying degrees. 
											//		1 = only error, 2 = error & log, 3 = error, log & info, 4 = error, log, info & debug
			native_error:true,				// Whether or not to send native js errors as well (using window.onerror).
			hijack_console:true,			// Hijacks the default console functionality (ie: all your console.error/info/log are belong to us).
			query_var: 'message',				// The variable to send the log message through as.
			localStorage: null,				// Acceptable values are null, sessionStorage, or localStorage. Without quotes
			logSize: 100,					// The number of local sesisonStorage or localStorage log entries to keep.
			client_info: {					// Configuration for what info about the client's browser is logged.
				location:true,				//	The url to the page on which the error occurred.
				screen_size:true,			//	The size of the user's screen (different to the window size because the window might not be maximized)
				user_agent:true,			//	The user agent string.
				window_size:true,			//	The window size.
				stackTrace:false, 			//  Return a stack trace information.
			}
		},
		original_error = console.error,
		original_info = console.info,
		original_log = console.log,
		original_debug = console.debug;

   /**
	* Initializing with custom options. Not strictly necessary, but recommended.
	* @param  options The custom options.
	*/
	$.clientSideLogging = function(options) {
		defaults = $.extend(defaults, options || {});

		// We need to unset these again if they were set the first time.
		if (!defaults.hijack_console) {
			console.error = original_error;
			console.info = original_info;
			console.log = original_log;
			console.debug = original_debug;
		} else {
			console.error = $.error;
			console.info = $.info;
			console.log = $.log;
			console.debug = $.debug;
		}
	};

	$.getPlog = function() {
		var t = localStorage.getItem('plog');
		if( t == null ) { 
			return [];
		}
		return JSON.parse( t );
	}
   /**
    * The function that will send debug logs to the server. Also logs to the console using console.debug() (if available and requested by the user)
    * @param what What you want to be logged (String, or JSON object)
    */
	$.debug = function(what) {
		if (defaults.log_level >= 4) {
			if( typeof what != 'object' ) {
				what = { 'message': what }
			}
			_send(defaults.error_url, what,'debug');
		}

		if (defaults.hijack_console && original_debug && original_debug.apply) {
			original_debug.apply(console, arguments);
		}
	};
	console.debug = $.debug;

   /**
    * The function that will send error logs to the server. Also logs to the console using console.error() (if available and requested by the user)
    * @param what What you want to be logged (String, or JSON object)
    */
	$.error = function(what) {
		if (defaults.log_level >= 1) {
			_send(defaults.error_url, what,'error');
		}

		if (defaults.hijack_console && original_error && original_error.apply) {
			original_error.apply(console, arguments);
		}
	};
	console.error = $.error;

   /**
    * The function that will send info logs to the server. Also logs to the console using console.info() (if available and requested by the user)
    * @param what What you want to be logged (String, or JSON object)
    */
	$.info = function(what) {
		if (defaults.log_level >= 3) {
			_send(defaults.info_url, what,'info');
		}

		if (defaults.hijack_console && original_info && original_info.apply) {
			original_info.apply(console, arguments);
		}
	};
	console.info = $.info;

   /**
    * The function that will send standard logs to the server. Also logs to the console using console.log() (if available and requested by the user)
    * @param what What you want to be logged (String, or JSON object)
    */
	$.log = function(what) {
		if (defaults.log_level >= 2) {
			_send(defaults.log_url, what,'log');
		}

		if (defaults.hijack_console && original_log && original_log.apply) {
			original_log.apply(console, arguments);
		}
	};
	console.log = $.log;

   // Log errors whenever there's a generic js error on the page.
	window.onerror = function(message, file, line) {
		if (defaults.native_error) {
			_send(defaults.error_url, {
				message: message,
				file: file,
				line: line
			});
		}
	};

   /*===== Private Functions =====*/
   /**
    * Send the log information to the server.
    * @param url The url to submit the information to.
    * @param what The information to be logged.
    */
	_send = function(url, what, errorType ) {
		url += url.match(/\?.+$/) ? '&' : '?';

		if (typeof what === 'object') {
			// Let's grab the additional logging info before we send this off.
			$.extend(what, _buildClientInfo());

			var _data = {};
			_data[defaults.query_var] = JSON.stringify(what);

			if( defaults.sendAJAX ) {
				$.ajax({
					type:'POST',
					url:url+'format=json',
					data:_data
				}).fail( function() {
					defaults.sendAJAX = false;
					if( defaults.localStorage ) {
						_localStore( 'AJAX', {'message':'An error occured while trying to communicate with the remote log server. (OBJECT)', 'stackTrace': _stackTrace() } );
					}
				});
			}
			if( defaults.localStorage ) {
				_localStore( errorType, what );
			}
			
		} else {
			if( defaults.sendAJAX) {
				$.post(url+'format=text&' + defaults.query_var + '=' + what)
				 .fail( function() {
					defaults.sendAJAX = false;
					if( defaults.localStorage ) {
						_localStore( 'AJAX', {'message':'An error occured while trying to communicate with the remote log server. (STRING)'} );
					}
				 });
			}
			if( defaults.localStorage ) {
				_localStore( errorType, what );
			}
		}
	};

	/**
	 * Save the object to localStorage.
	 */
	_localStore = function ( errorType, what ) {
		var self = this;
		self.maxTrys = 5;
		try {
			locked = JSON.parse( localStorage.getItem('plogLock'));
			locked = locked == null ? false : locked;
		} catch( e ) {
			locked = false;
		}

		if( locked ) {
			throw('The localStore is currently locked');
		}
		var key = 'plog';
		localStorage.setItem('plogLock',true);
		var s = localStorage.getItem( key );
		if( s == null ) {
			s = [];
		} else {
			s = JSON.parse( s );
		}
		var _data = {};
		_data['type'] = typeof errorType != 'string' ? '' : errorType;
		_data['timestamp'] = ( new Date() ).toJSON();
		_data[defaults.query_var] = what;
		s.unshift( _data );
		if( s.length > defaults.logSize ) {
			s.pop();
		}
		localStorage.setItem( key , JSON.stringify( s ) );
		localStorage.removeItem('plogLock',false);
	}

   /**
    * Build up an object containing the requested information about the client (as specified in defaults).
    * @return _info The object containing the requested information.
    */
	_buildClientInfo = function() {
		var _info = {};

		if (defaults.client_info.user_agent) {
			_info.user_agent = navigator.userAgent;
		}
		if (defaults.client_info.window_size) {
			_info.window_size = $(window).width()+' x '+$(window).height();
		}
		if (defaults.client_info.screen_size) {
			_info.screen_size = window.screen.availWidth+' x '+window.screen.availHeight;
		}
		if (defaults.client_info.location) {
			_info.location = window.location.href;
		}
		if (defaults.client_info.stackTrace) {
			_info.stackTrace = _stackTrace();
		}

		return _info;
	};
	/**
	 * Provide a stacktrace of where the error occured.
	 */
	_stackTrace = function() {
	    var err = new Error();
	    //Remove the plog stack trace elements.
	    var errStack = err.stack.split('\n').slice(5);	    
	    errStack.unshift('Error');
    	return errStack.join('\n');
	}
})(jQuery);