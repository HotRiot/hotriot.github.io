﻿﻿﻿/*!
 * jQuery Form Plugin
 * version: 3.35.0-2013.05.23
 * @requires jQuery v1.5 or later
 * Copyright (c) 2013 M. Alsup
 * Examples and documentation at: http://malsup.com/jquery/form/
 * Project repository: https://github.com/malsup/form
 * Dual licensed under the MIT and GPL licenses.
 * https://github.com/malsup/form#copyright-and-license
 */
/*global ActiveXObject */
;(function($) {
"use strict";

/*
    Usage Note:
    -----------
    Do not use both ajaxSubmit and ajaxForm on the same form.  These
    functions are mutually exclusive.  Use ajaxSubmit if you want
    to bind your own submit handler to the form.  For example,

    $(document).ready(function() {
        $('#myForm').on('submit', function(e) {
            e.preventDefault(); // <-- important
            $(this).ajaxSubmit({
                target: '#output'
            });
        });
    });

    Use ajaxForm when you want the plugin to manage all the event binding
    for you.  For example,

    $(document).ready(function() {
        $('#myForm').ajaxForm({
            target: '#output'
        });
    });

    You can also use ajaxForm with delegation (requires jQuery v1.7+), so the
    form does not have to exist when you invoke ajaxForm:

    $('#myForm').ajaxForm({
        delegation: true,
        target: '#output'
    });

    When using ajaxForm, the ajaxSubmit function will be invoked for you
    at the appropriate time.
*/

/**
 * Feature detection
 */
var feature = {};
feature.fileapi = $("<input type='file'/>").get(0).files !== undefined;
feature.formdata = window.FormData !== undefined;

var hasProp = !!$.fn.prop;

// attr2 uses prop when it can but checks the return type for
// an expected string.  this accounts for the case where a form
// contains inputs with names like "action" or "method"; in those
// cases "prop" returns the element
$.fn.attr2 = function() {
    if ( ! hasProp )
        return this.attr.apply(this, arguments);
    var val = this.prop.apply(this, arguments);
    if ( ( val && val.jquery ) || typeof val === 'string' )
        return val;
    return this.attr.apply(this, arguments);
};

/**
 * ajaxSubmit() provides a mechanism for immediately submitting
 * an HTML form using AJAX.
 */
$.fn.ajaxSubmit = function(options) {
    /*jshint scripturl:true */

    // fast fail if nothing selected (http://dev.jquery.com/ticket/2752)
    if (!this.length) {
        log('ajaxSubmit: skipping submit process - no element selected');
        return this;
    }

    var method, action, url, $form = this;

    if (typeof options == 'function') {
        options = {success: options};
    }

    method = options.type || this.attr2('method');
    action = options.url  || this.attr2('action');

    url = (typeof action === 'string') ? $.trim(action) : '';
    url = url || window.location.href || '';
    if (url) {
        // clean url (don't include hash vaue)
        url = (url.match(/^([^#]+)/)||[])[1];
    }

    options = $.extend(true, {
        url:  url,
        success: $.ajaxSettings.success,
        type: method || 'GET',
        iframeSrc: /^https/i.test(window.location.href || '') ? 'javascript:false' : 'about:blank'
    }, options);

    // hook for manipulating the form data before it is extracted;
    // convenient for use with rich editors like tinyMCE or FCKEditor
    var veto = {};
    this.trigger('form-pre-serialize', [this, options, veto]);
    if (veto.veto) {
        log('ajaxSubmit: submit vetoed via form-pre-serialize trigger');
        return this;
    }

    // provide opportunity to alter form data before it is serialized
    if (options.beforeSerialize && options.beforeSerialize(this, options) === false) {
        log('ajaxSubmit: submit aborted via beforeSerialize callback');
        return this;
    }

    var traditional = options.traditional;
    if ( traditional === undefined ) {
        traditional = $.ajaxSettings.traditional;
    }

    var elements = [];
    var qx, a = this.formToArray(options.semantic, elements);
    if (options.data) {
        options.extraData = options.data;
        qx = $.param(options.data, traditional);
    }

    // give pre-submit callback an opportunity to abort the submit
    if (options.beforeSubmit && options.beforeSubmit(a, this, options) === false) {
        log('ajaxSubmit: submit aborted via beforeSubmit callback');
        return this;
    }

    // fire vetoable 'validate' event
    this.trigger('form-submit-validate', [a, this, options, veto]);
    if (veto.veto) {
        log('ajaxSubmit: submit vetoed via form-submit-validate trigger');
        return this;
    }

    var q = $.param(a, traditional);
    if (qx) {
        q = ( q ? (q + '&' + qx) : qx );
    }
    if (options.type.toUpperCase() == 'GET') {
        options.url += (options.url.indexOf('?') >= 0 ? '&' : '?') + q;
        options.data = null;  // data is null for 'get'
    }
    else {
        options.data = q; // data is the query string for 'post'
    }

    var callbacks = [];
    if (options.resetForm) {
        callbacks.push(function() {$form.resetForm();});
    }
    if (options.clearForm) {
        callbacks.push(function() {$form.clearForm(options.includeHidden);});
    }

    // perform a load on the target only if dataType is not provided
    if (!options.dataType && options.target) {
        var oldSuccess = options.success || function(){};
        callbacks.push(function(data) {
            var fn = options.replaceTarget ? 'replaceWith' : 'html';
            $(options.target)[fn](data).each(oldSuccess, arguments);
        });
    }
    else if (options.success) {
        if( $.isArray(options.success) === true )
        {
            for( var optCntr=0; optCntr<options.success.length; optCntr++ )
                callbacks.push(options.success[optCntr]);
        }
        else
            callbacks.push(options.success);
    }

    options.success = function(data, status, xhr) { // jQuery 1.4+ passes xhr as 3rd arg
        var context = options.context || this ;    // jQuery 1.4+ supports scope context
        for (var i=0, max=callbacks.length; i < max; i++) {
            callbacks[i].apply(context, [data, status, xhr || $form, $form]);
        }
    };

    if (options.error) {
        var oldError = options.error;
        options.error = function(xhr, status, error) {
            var context = options.context || this;
            oldError.apply(context, [xhr, status, error, $form]);
        };
    }

     if (options.complete) {
        var oldComplete = options.complete;
        options.complete = function(xhr, status) {
            var context = options.context || this;
            oldComplete.apply(context, [xhr, status, $form]);
        };
    }

    // are there files to upload?

    // [value] (issue #113), also see comment:
    // https://github.com/malsup/form/commit/588306aedba1de01388032d5f42a60159eea9228#commitcomment-2180219
    var fileInputs = $('input[type=file]:enabled[value!=""]', this);

    var hasFileInputs = fileInputs.length > 0;
    var mp = 'multipart/form-data';
    var multipart = ($form.attr('enctype') == mp || $form.attr('encoding') == mp);

    var fileAPI = feature.fileapi && feature.formdata;
    log("fileAPI :" + fileAPI);
    var shouldUseFrame = (hasFileInputs || multipart) && !fileAPI;

    var jqxhr;

    // options.iframe allows user to force iframe mode
    // 06-NOV-09: now defaulting to iframe mode if file input is detected
    if (options.iframe !== false && (options.iframe || shouldUseFrame)) {
        // hack to fix Safari hang (thanks to Tim Molendijk for this)
        // see:  http://groups.google.com/group/jquery-dev/browse_thread/thread/36395b7ab510dd5d
        if (options.closeKeepAlive) {
            $.get(options.closeKeepAlive, function() {
                jqxhr = fileUploadIframe(a);
            });
        }
        else {
            jqxhr = fileUploadIframe(a);
        }
    }
    else if ((hasFileInputs || multipart) && fileAPI) {
        jqxhr = fileUploadXhr(a);
    }
    else {
        jqxhr = $.ajax(options);
    }

    $form.removeData('jqxhr').data('jqxhr', jqxhr);

    // clear element array
    for (var k=0; k < elements.length; k++)
        elements[k] = null;

    // fire 'notify' event
    this.trigger('form-submit-notify', [this, options]);
    return this;

    // utility fn for deep serialization
    function deepSerialize(extraData){
        var serialized = $.param(extraData, options.traditional).split('&');
        var len = serialized.length;
        var result = [];
        var i, part;
        for (i=0; i < len; i++) {
            // #252; undo param space replacement
            serialized[i] = serialized[i].replace(/\+/g,' ');
            part = serialized[i].split('=');
            // #278; use array instead of object storage, favoring array serializations
            result.push([decodeURIComponent(part[0]), decodeURIComponent(part[1])]);
        }
        return result;
    }

     // XMLHttpRequest Level 2 file uploads (big hat tip to francois2metz)
    function fileUploadXhr(a) {
        var formdata = new FormData();

        for (var i=0; i < a.length; i++) {
            formdata.append(a[i].name, a[i].value);
        }

        if (options.extraData) {
            var serializedData = deepSerialize(options.extraData);
            for (i=0; i < serializedData.length; i++)
                if (serializedData[i])
                    formdata.append(serializedData[i][0], serializedData[i][1]);
        }

        options.data = null;

        var s = $.extend(true, {}, $.ajaxSettings, options, {
            contentType: false,
            processData: false,
            cache: false,
            type: method || 'POST'
        });

        if (options.uploadProgress) {
            // workaround because jqXHR does not expose upload property
            s.xhr = function() {
                var xhr = jQuery.ajaxSettings.xhr();
                if (xhr.upload) {
                    xhr.upload.addEventListener('progress', function(event) {
                        var percent = 0;
                        var position = event.loaded || event.position; /*event.position is deprecated*/
                        var total = event.total;
                        if (event.lengthComputable) {
                            percent = Math.ceil(position / total * 100);
                        }
                        options.uploadProgress(event, position, total, percent);
                    }, false);
                }
                return xhr;
            };
        }

        s.data = null;
            var beforeSend = s.beforeSend;
            s.beforeSend = function(xhr, o) {
                o.data = formdata;
                if(beforeSend)
                    beforeSend.call(this, xhr, o);
        };
        return $.ajax(s);
    }

    // private function for handling file uploads (hat tip to YAHOO!)
    function fileUploadIframe(a) {
        var form = $form[0], el, i, s, g, id, $io, io, xhr, sub, n, timedOut, timeoutHandle;
        var deferred = $.Deferred();

        if (a) {
            // ensure that every serialized input is still enabled
            for (i=0; i < elements.length; i++) {
                el = $(elements[i]);
                if ( hasProp )
                    el.prop('disabled', false);
                else
                    el.removeAttr('disabled');
            }
        }

        s = $.extend(true, {}, $.ajaxSettings, options);
        s.context = s.context || s;
        id = 'jqFormIO' + (new Date().getTime());
        if (s.iframeTarget) {
            $io = $(s.iframeTarget);
            n = $io.attr2('name');
            if (!n)
                 $io.attr2('name', id);
            else
                id = n;
        }
        else {
            $io = $('<iframe name="' + id + '" src="'+ s.iframeSrc +'" />');
            $io.css({position: 'absolute', top: '-1000px', left: '-1000px'});
        }
        io = $io[0];


        xhr = { // mock object
            aborted: 0,
            responseText: null,
            responseXML: null,
            status: 0,
            statusText: 'n/a',
            getAllResponseHeaders: function() {},
            getResponseHeader: function() {},
            setRequestHeader: function() {},
            abort: function(status) {
                var e = (status === 'timeout' ? 'timeout' : 'aborted');
                log('aborting upload... ' + e);
                this.aborted = 1;

                try { // #214, #257
                    if (io.contentWindow.document.execCommand) {
                        io.contentWindow.document.execCommand('Stop');
                    }
                }
                catch(ignore) {}

                $io.attr('src', s.iframeSrc); // abort op in progress
                xhr.error = e;
                if (s.error)
                    s.error.call(s.context, xhr, e, status);
                if (g)
                    $.event.trigger("ajaxError", [xhr, s, e]);
                if (s.complete)
                    s.complete.call(s.context, xhr, e);
            }
        };

        g = s.global;
        // trigger ajax global events so that activity/block indicators work like normal
        if (g && 0 === $.active++) {
            $.event.trigger("ajaxStart");
        }
        if (g) {
            $.event.trigger("ajaxSend", [xhr, s]);
        }

        if (s.beforeSend && s.beforeSend.call(s.context, xhr, s) === false) {
            if (s.global) {
                $.active--;
            }
            deferred.reject();
            return deferred;
        }
        if (xhr.aborted) {
            deferred.reject();
            return deferred;
        }

        // add submitting element to data if we know it
        sub = form.clk;
        if (sub) {
            n = sub.name;
            if (n && !sub.disabled) {
                s.extraData = s.extraData || {};
                s.extraData[n] = sub.value;
                if (sub.type == "image") {
                    s.extraData[n+'.x'] = form.clk_x;
                    s.extraData[n+'.y'] = form.clk_y;
                }
            }
        }

        var CLIENT_TIMEOUT_ABORT = 1;
        var SERVER_ABORT = 2;

        function getDoc(frame) {
            /* it looks like contentWindow or contentDocument do not
             * carry the protocol property in ie8, when running under ssl
             * frame.document is the only valid response document, since
             * the protocol is know but not on the other two objects. strange?
             * "Same origin policy" http://en.wikipedia.org/wiki/Same_origin_policy
             */

            var doc = null;

            // IE8 cascading access check
            try {
                if (frame.contentWindow) {
                    doc = frame.contentWindow.document;
                }
            } catch(err) {
                // IE8 access denied under ssl & missing protocol
                log('cannot get iframe.contentWindow document: ' + err);
            }

            if (doc) { // successful getting content
                return doc;
            }

            try { // simply checking may throw in ie8 under ssl or mismatched protocol
                doc = frame.contentDocument ? frame.contentDocument : frame.document;
            } catch(err) {
                // last attempt
                log('cannot get iframe.contentDocument: ' + err);
                doc = frame.document;
            }
            return doc;
        }

        // Rails CSRF hack (thanks to Yvan Barthelemy)
        var csrf_token = $('meta[name=csrf-token]').attr('content');
        var csrf_param = $('meta[name=csrf-param]').attr('content');
        if (csrf_param && csrf_token) {
            s.extraData = s.extraData || {};
            s.extraData[csrf_param] = csrf_token;
        }

        // take a breath so that pending repaints get some cpu time before the upload starts
        function doSubmit() {
            // make sure form attrs are set
            var t = $form.attr2('target'), a = $form.attr2('action');

            // update form attrs in IE friendly way
            form.setAttribute('target',id);
            if (!method) {
                form.setAttribute('method', 'POST');
            }
            if (a != s.url) {
                form.setAttribute('action', s.url);
            }

            // ie borks in some cases when setting encoding
            if (! s.skipEncodingOverride && (!method || /post/i.test(method))) {
                $form.attr({
                    encoding: 'multipart/form-data',
                    enctype:  'multipart/form-data'
                });
            }

            // support timout
            if (s.timeout) {
                timeoutHandle = setTimeout(function() {timedOut = true;cb(CLIENT_TIMEOUT_ABORT);}, s.timeout);
            }

            // look for server aborts
            function checkState() {
                try {
                    var state = getDoc(io).readyState;
                    log('state = ' + state);
                    if (state && state.toLowerCase() == 'uninitialized')
                        setTimeout(checkState,50);
                }
                catch(e) {
                    log('Server abort: ' , e, ' (', e.name, ')');
                    cb(SERVER_ABORT);
                    if (timeoutHandle)
                        clearTimeout(timeoutHandle);
                    timeoutHandle = undefined;
                }
            }

            // add "extra" data to form if provided in options
            var extraInputs = [];
            try {
                if (s.extraData) {
                    for (var n in s.extraData) {
                        if (s.extraData.hasOwnProperty(n)) {
                           // if using the $.param format that allows for multiple values with the same name
                           if($.isPlainObject(s.extraData[n]) && s.extraData[n].hasOwnProperty('name') && s.extraData[n].hasOwnProperty('value')) {
                               extraInputs.push(
                               $('<input type="hidden" name="'+s.extraData[n].name+'">').val(s.extraData[n].value)
                                   .appendTo(form)[0]);
                           } else {
                               extraInputs.push(
                               $('<input type="hidden" name="'+n+'">').val(s.extraData[n])
                                   .appendTo(form)[0]);
                           }
                        }
                    }
                }

                if (!s.iframeTarget) {
                    // add iframe to doc and submit the form
                    $io.appendTo('body');
                    if (io.attachEvent)
                        io.attachEvent('onload', cb);
                    else
                        io.addEventListener('load', cb, false);
                }
                setTimeout(checkState,15);

                try {
                    form.submit();
                } catch(err) {
                    // just in case form has element with name/id of 'submit'
                    var submitFn = document.createElement('form').submit;
                    submitFn.apply(form);
                }
            }
            finally {
                // reset attrs and remove "extra" input elements
                form.setAttribute('action',a);
                if(t) {
                    form.setAttribute('target', t);
                } else {
                    $form.removeAttr('target');
                }
                $(extraInputs).remove();
            }
        }

        if (s.forceSync) {
            doSubmit();
        }
        else {
            setTimeout(doSubmit, 10); // this lets dom updates render
        }

        var data, doc, domCheckCount = 50, callbackProcessed;

        function cb(e) {
            if (xhr.aborted || callbackProcessed) {
                return;
            }

            doc = getDoc(io);
            if(!doc) {
                log('cannot access response document');
                e = SERVER_ABORT;
            }
            if (e === CLIENT_TIMEOUT_ABORT && xhr) {
                xhr.abort('timeout');
                deferred.reject(xhr, 'timeout');
                return;
            }
            else if (e == SERVER_ABORT && xhr) {
                xhr.abort('server abort');
                deferred.reject(xhr, 'error', 'server abort');
                return;
            }

            if (!doc || doc.location.href == s.iframeSrc) {
                // response not received yet
                if (!timedOut)
                    return;
            }
            if (io.detachEvent)
                io.detachEvent('onload', cb);
            else
                io.removeEventListener('load', cb, false);

            var status = 'success', errMsg;
            try {
                if (timedOut) {
                    throw 'timeout';
                }

                var isXml = s.dataType == 'xml' || doc.XMLDocument || $.isXMLDoc(doc);
                log('isXml='+isXml);
                if (!isXml && window.opera && (doc.body === null || !doc.body.innerHTML)) {
                    if (--domCheckCount) {
                        // in some browsers (Opera) the iframe DOM is not always traversable when
                        // the onload callback fires, so we loop a bit to accommodate
                        log('requeing onLoad callback, DOM not available');
                        setTimeout(cb, 250);
                        return;
                    }
                    // let this fall through because server response could be an empty document
                    //log('Could not access iframe DOM after mutiple tries.');
                    //throw 'DOMException: not available';
                }

                //log('response detected');
                var docRoot = doc.body ? doc.body : doc.documentElement;
                xhr.responseText = docRoot ? docRoot.innerHTML : null;
                xhr.responseXML = doc.XMLDocument ? doc.XMLDocument : doc;
                if (isXml)
                    s.dataType = 'xml';
                xhr.getResponseHeader = function(header){
                    var headers = {'content-type': s.dataType};
                    return headers[header];
                };
                // support for XHR 'status' & 'statusText' emulation :
                if (docRoot) {
                    xhr.status = Number( docRoot.getAttribute('status') ) || xhr.status;
                    xhr.statusText = docRoot.getAttribute('statusText') || xhr.statusText;
                }

                var dt = (s.dataType || '').toLowerCase();
                var scr = /(json|script|text)/.test(dt);
                if (scr || s.textarea) {
                    // see if user embedded response in textarea
                    var ta = doc.getElementsByTagName('textarea')[0];
                    if (ta) {
                        xhr.responseText = ta.value;
                        // support for XHR 'status' & 'statusText' emulation :
                        xhr.status = Number( ta.getAttribute('status') ) || xhr.status;
                        xhr.statusText = ta.getAttribute('statusText') || xhr.statusText;
                    }
                    else if (scr) {
                        // account for browsers injecting pre around json response
                        var pre = doc.getElementsByTagName('pre')[0];
                        var b = doc.getElementsByTagName('body')[0];
                        if (pre) {
                            xhr.responseText = pre.textContent ? pre.textContent : pre.innerText;
                        }
                        else if (b) {
                            xhr.responseText = b.textContent ? b.textContent : b.innerText;
                        }
                    }
                }
                else if (dt == 'xml' && !xhr.responseXML && xhr.responseText) {
                    xhr.responseXML = toXml(xhr.responseText);
                }

                try {
                    data = httpData(xhr, dt, s);
                }
                catch (err) {
                    status = 'parsererror';
                    xhr.error = errMsg = (err || status);
                }
            }
            catch (err) {
                log('error caught: ',err);
                status = 'error';
                xhr.error = errMsg = (err || status);
            }

            if (xhr.aborted) {
                log('upload aborted');
                status = null;
            }

            if (xhr.status) { // we've set xhr.status
                status = (xhr.status >= 200 && xhr.status < 300 || xhr.status === 304) ? 'success' : 'error';
            }

            // ordering of these callbacks/triggers is odd, but that's how $.ajax does it
            if (status === 'success') {
                if (s.success)
                    s.success.call(s.context, data, 'success', xhr);
                deferred.resolve(xhr.responseText, 'success', xhr);
                if (g)
                    $.event.trigger("ajaxSuccess", [xhr, s]);
            }
            else if (status) {
                if (errMsg === undefined)
                    errMsg = xhr.statusText;
                if (s.error)
                    s.error.call(s.context, xhr, status, errMsg);
                deferred.reject(xhr, 'error', errMsg);
                if (g)
                    $.event.trigger("ajaxError", [xhr, s, errMsg]);
            }

            if (g)
                $.event.trigger("ajaxComplete", [xhr, s]);

            if (g && ! --$.active) {
                $.event.trigger("ajaxStop");
            }

            if (s.complete)
                s.complete.call(s.context, xhr, status);

            callbackProcessed = true;
            if (s.timeout)
                clearTimeout(timeoutHandle);

            // clean up
            setTimeout(function() {
                if (!s.iframeTarget)
                    $io.remove();
                xhr.responseXML = null;
            }, 100);
        }

        var toXml = $.parseXML || function(s, doc) { // use parseXML if available (jQuery 1.5+)
            if (window.ActiveXObject) {
                doc = new ActiveXObject('Microsoft.XMLDOM');
                doc.async = 'false';
                doc.loadXML(s);
            }
            else {
                doc = (new DOMParser()).parseFromString(s, 'text/xml');
            }
            return (doc && doc.documentElement && doc.documentElement.nodeName != 'parsererror') ? doc : null;
        };
        var parseJSON = $.parseJSON || function(s) {
            /*jslint evil:true */
            return window['eval']('(' + s + ')');
        };

        var httpData = function( xhr, type, s ) { // mostly lifted from jq1.4.4

            var ct = xhr.getResponseHeader('content-type') || '',
                xml = type === 'xml' || !type && ct.indexOf('xml') >= 0,
                data = xml ? xhr.responseXML : xhr.responseText;

            if (xml && data.documentElement.nodeName === 'parsererror') {
                if ($.error)
                    $.error('parsererror');
            }
            if (s && s.dataFilter) {
                data = s.dataFilter(data, type);
            }
            if (typeof data === 'string') {
                if (type === 'json' || !type && ct.indexOf('json') >= 0) {
                    data = parseJSON(data);
                } else if (type === "script" || !type && ct.indexOf("javascript") >= 0) {
                    $.globalEval(data);
                }
            }
            return data;
        };

        return deferred;
    }
};

/**
 * ajaxForm() provides a mechanism for fully automating form submission.
 *
 * The advantages of using this method instead of ajaxSubmit() are:
 *
 * 1: This method will include coordinates for <input type="image" /> elements (if the element
 *    is used to submit the form).
 * 2. This method will include the submit element's name/value data (for the element that was
 *    used to submit the form).
 * 3. This method binds the submit() method to the form for you.
 *
 * The options argument for ajaxForm works exactly as it does for ajaxSubmit.  ajaxForm merely
 * passes the options argument along after properly binding events for submit elements and
 * the form itself.
 */
$.fn.ajaxForm = function(options) {
    options = options || {};
    options.delegation = options.delegation && $.isFunction($.fn.on);

    // in jQuery 1.3+ we can fix mistakes with the ready state
    if (!options.delegation && this.length === 0) {
        var o = {s: this.selector, c: this.context};
        if (!$.isReady && o.s) {
            log('DOM not ready, queuing ajaxForm');
            $(function() {
                $(o.s,o.c).ajaxForm(options);
            });
            return this;
        }
        // is your DOM ready?  http://docs.jquery.com/Tutorials:Introducing_$(document).ready()
        log('terminating; zero elements found by selector' + ($.isReady ? '' : ' (DOM not ready)'));
        return this;
    }

    if ( options.delegation ) {
        $(document)
            .off('submit.form-plugin', this.selector, doAjaxSubmit)
            .off('click.form-plugin', this.selector, captureSubmittingElement)
            .on('submit.form-plugin', this.selector, options, doAjaxSubmit)
            .on('click.form-plugin', this.selector, options, captureSubmittingElement);
        return this;
    }

    return this.ajaxFormUnbind()
        .bind('submit.form-plugin', options, doAjaxSubmit)
        .bind('click.form-plugin', options, captureSubmittingElement);
};

// private event handlers
function doAjaxSubmit(e) {
    /*jshint validthis:true */
    var options = e.data;
    if (!e.isDefaultPrevented()) { // if event has been canceled, don't proceed
        e.preventDefault();
        $(this).ajaxSubmit(options);
    }
}

function captureSubmittingElement(e) {
    /*jshint validthis:true */
    var target = e.target;
    var $el = $(target);
    if (!($el.is("[type=submit],[type=image]"))) {
        // is this a child element of the submit el?  (ex: a span within a button)
        var t = $el.closest('[type=submit]');
        if (t.length === 0) {
            return;
        }
        target = t[0];
    }
    var form = this;
    form.clk = target;
    if (target.type == 'image') {
        if (e.offsetX !== undefined) {
            form.clk_x = e.offsetX;
            form.clk_y = e.offsetY;
        } else if (typeof $.fn.offset == 'function') {
            var offset = $el.offset();
            form.clk_x = e.pageX - offset.left;
            form.clk_y = e.pageY - offset.top;
        } else {
            form.clk_x = e.pageX - target.offsetLeft;
            form.clk_y = e.pageY - target.offsetTop;
        }
    }
    // clear form vars
    setTimeout(function() {form.clk = form.clk_x = form.clk_y = null;}, 100);
}


// ajaxFormUnbind unbinds the event handlers that were bound by ajaxForm
$.fn.ajaxFormUnbind = function() {
    return this.unbind('submit.form-plugin click.form-plugin');
};

/**
 * formToArray() gathers form element data into an array of objects that can
 * be passed to any of the following ajax functions: $.get, $.post, or load.
 * Each object in the array has both a 'name' and 'value' property.  An example of
 * an array for a simple login form might be:
 *
 * [ { name: 'username', value: 'jresig' }, { name: 'password', value: 'secret' } ]
 *
 * It is this array that is passed to pre-submit callback functions provided to the
 * ajaxSubmit() and ajaxForm() methods.
 */
$.fn.formToArray = function(semantic, elements) {
    var a = [];
    if (this.length === 0) {
        return a;
    }

    var form = this[0];
    var els = semantic ? form.getElementsByTagName('*') : form.elements;
    if (!els) {
        return a;
    }

    var i,j,n,v,el,max,jmax;
    for(i=0, max=els.length; i < max; i++) {
        el = els[i];
        n = el.name;
        if (!n || el.disabled) {
            continue;
        }

        if (semantic && form.clk && el.type == "image") {
            // handle image inputs on the fly when semantic == true
            if(form.clk == el) {
                a.push({name: n, value: $(el).val(), type: el.type});
                a.push({name: n+'.x', value: form.clk_x}, {name: n+'.y', value: form.clk_y});
            }
            continue;
        }

        v = $.fieldValue(el, true);
        if (v && v.constructor == Array) {
            if (elements)
                elements.push(el);
            for(j=0, jmax=v.length; j < jmax; j++) {
                a.push({name: n, value: v[j]});
            }
        }
        else if (feature.fileapi && el.type == 'file') {
            if (elements)
                elements.push(el);
            var files = el.files;
            if (files.length) {
                for (j=0; j < files.length; j++) {
                    a.push({name: n, value: files[j], type: el.type});
                }
            }
            else {
                // #180
                a.push({name: n, value: '', type: el.type});
            }
        }
        else if (v !== null && typeof v != 'undefined') {
            if (elements)
                elements.push(el);
            a.push({name: n, value: v, type: el.type, required: el.required});
        }
    }

    if (!semantic && form.clk) {
        // input type=='image' are not found in elements array! handle it here
        var $input = $(form.clk), input = $input[0];
        n = input.name;
        if (n && !input.disabled && input.type == 'image') {
            a.push({name: n, value: $input.val()});
            a.push({name: n+'.x', value: form.clk_x}, {name: n+'.y', value: form.clk_y});
        }
    }
    return a;
};

/**
 * Serializes form data into a 'submittable' string. This method will return a string
 * in the format: name1=value1&amp;name2=value2
 */
$.fn.formSerialize = function(semantic) {
    //hand off to jQuery.param for proper encoding
    return $.param(this.formToArray(semantic));
};

/**
 * Serializes all field elements in the jQuery object into a query string.
 * This method will return a string in the format: name1=value1&amp;name2=value2
 */
$.fn.fieldSerialize = function(successful) {
    var a = [];
    this.each(function() {
        var n = this.name;
        if (!n) {
            return;
        }
        var v = $.fieldValue(this, successful);
        if (v && v.constructor == Array) {
            for (var i=0,max=v.length; i < max; i++) {
                a.push({name: n, value: v[i]});
            }
        }
        else if (v !== null && typeof v != 'undefined') {
            a.push({name: this.name, value: v});
        }
    });
    //hand off to jQuery.param for proper encoding
    return $.param(a);
};

/**
 * Returns the value(s) of the element in the matched set.  For example, consider the following form:
 *
 *  <form><fieldset>
 *      <input name="A" type="text" />
 *      <input name="A" type="text" />
 *      <input name="B" type="checkbox" value="B1" />
 *      <input name="B" type="checkbox" value="B2"/>
 *      <input name="C" type="radio" value="C1" />
 *      <input name="C" type="radio" value="C2" />
 *  </fieldset></form>
 *
 *  var v = $('input[type=text]').fieldValue();
 *  // if no values are entered into the text inputs
 *  v == ['','']
 *  // if values entered into the text inputs are 'foo' and 'bar'
 *  v == ['foo','bar']
 *
 *  var v = $('input[type=checkbox]').fieldValue();
 *  // if neither checkbox is checked
 *  v === undefined
 *  // if both checkboxes are checked
 *  v == ['B1', 'B2']
 *
 *  var v = $('input[type=radio]').fieldValue();
 *  // if neither radio is checked
 *  v === undefined
 *  // if first radio is checked
 *  v == ['C1']
 *
 * The successful argument controls whether or not the field element must be 'successful'
 * (per http://www.w3.org/TR/html4/interact/forms.html#successful-controls).
 * The default value of the successful argument is true.  If this value is false the value(s)
 * for each element is returned.
 *
 * Note: This method *always* returns an array.  If no valid value can be determined the
 *    array will be empty, otherwise it will contain one or more values.
 */
$.fn.fieldValue = function(successful) {
    for (var val=[], i=0, max=this.length; i < max; i++) {
        var el = this[i];
        var v = $.fieldValue(el, successful);
        if (v === null || typeof v == 'undefined' || (v.constructor == Array && !v.length)) {
            continue;
        }
        if (v.constructor == Array)
            $.merge(val, v);
        else
            val.push(v);
    }
    return val;
};

/**
 * Returns the value of the field element.
 */
$.fieldValue = function(el, successful) {
    var n = el.name, t = el.type, tag = el.tagName.toLowerCase();
    if (successful === undefined) {
        successful = true;
    }

    if (successful && (!n || el.disabled || t == 'reset' || t == 'button' ||
        (t == 'checkbox' || t == 'radio') && !el.checked ||
        (t == 'submit' || t == 'image') && el.form && el.form.clk != el ||
        tag == 'select' && el.selectedIndex == -1)) {
            return null;
    }

    if (tag == 'select') {
        var index = el.selectedIndex;
        if (index < 0) {
            return null;
        }
        var a = [], ops = el.options;
        var one = (t == 'select-one');
        var max = (one ? index+1 : ops.length);
        for(var i=(one ? index : 0); i < max; i++) {
            var op = ops[i];
            if (op.selected) {
                var v = op.value;
                if (!v) { // extra pain for IE...
                    v = (op.attributes && op.attributes['value'] && !(op.attributes['value'].specified)) ? op.text : op.value;
                }
                if (one) {
                    return v;
                }
                a.push(v);
            }
        }
        return a;
    }
    return $(el).val();
};

/**
 * Clears the form data.  Takes the following actions on the form's input fields:
 *  - input text fields will have their 'value' property set to the empty string
 *  - select elements will have their 'selectedIndex' property set to -1
 *  - checkbox and radio inputs will have their 'checked' property set to false
 *  - inputs of type submit, button, reset, and hidden will *not* be effected
 *  - button elements will *not* be effected
 */
$.fn.clearForm = function(includeHidden) {
    return this.each(function() {
        $('input,select,textarea', this).clearFields(includeHidden);
    });
};

/**
 * Clears the selected form elements.
 */
$.fn.clearFields = $.fn.clearInputs = function(includeHidden) {
    var re = /^(?:color|date|datetime|email|month|number|password|range|search|tel|text|time|url|week)$/i; // 'hidden' is not in this list
    return this.each(function() {
        var t = this.type, tag = this.tagName.toLowerCase();
        if (re.test(t) || tag == 'textarea') {
            this.value = '';
        }
        else if (t == 'checkbox' || t == 'radio') {
            this.checked = false;
        }
        else if (tag == 'select') {
            this.selectedIndex = -1;
        }
		else if (t == "file") {
			if (/MSIE/.test(navigator.userAgent)) {
				$(this).replaceWith($(this).clone(true));
			} else {
				$(this).val('');
			}
		}
        else if (includeHidden) {
            // includeHidden can be the value true, or it can be a selector string
            // indicating a special test; for example:
            //  $('#myForm').clearForm('.special:hidden')
            // the above would clean hidden inputs that have the class of 'special'
            if ( (includeHidden === true && /hidden/.test(t)) ||
                 (typeof includeHidden == 'string' && $(this).is(includeHidden)) )
                this.value = '';
        }
    });
};

/**
 * Resets the form data.  Causes all form elements to be reset to their original value.
 */
$.fn.resetForm = function() {
    return this.each(function() {
        // guard against an input with the name of 'reset'
        // note that IE reports the reset function as an 'object'
        if (typeof this.reset == 'function' || (typeof this.reset == 'object' && !this.reset.nodeType)) {
            this.reset();
        }
    });
};

/**
 * Enables or disables any matching elements.
 */
$.fn.enable = function(b) {
    if (b === undefined) {
        b = true;
    }
    return this.each(function() {
        this.disabled = !b;
    });
};

/**
 * Checks/unchecks any matching checkboxes or radio buttons and
 * selects/deselects and matching option elements.
 */
$.fn.selected = function(select) {
    if (select === undefined) {
        select = true;
    }
    return this.each(function() {
        var t = this.type;
        if (t == 'checkbox' || t == 'radio') {
            this.checked = select;
        }
        else if (this.tagName.toLowerCase() == 'option') {
            var $sel = $(this).parent('select');
            if (select && $sel[0] && $sel[0].type == 'select-one') {
                // deselect all other options
                $sel.find('option').selected(false);
            }
            this.selected = select;
        }
    });
};

// expose debug var
$.fn.ajaxSubmit.debug = false;

// helper fn for console logging
function log() {
    if (!$.fn.ajaxSubmit.debug)
        return;
    var msg = '[jquery.form] ' + Array.prototype.join.call(arguments,'');
    if (window.console && window.console.log) {
        window.console.log(msg);
    }
    else if (window.opera && window.opera.postError) {
        window.opera.postError(msg);
    }
}

})(jQuery);




/*
    src: hotriot.com/jsSrc/ajax/hotriot_ajax.js
    author: AS
    date: 9-03-2011
    intent: provide support for using HotRiot with AJAX based web applications
    package: production 1.0
    requires: jquery.1.7 or later. (http://ajax.googleapis.com/ajax/libs/jquery/1.7/jquery.js)
              jquery.form.js (http://malsup.github.com/jquery.form.js)

    The packages above are listed in the order they must appear on the host HTML page, followed by hotriot_ajax.js

    CREDITS: Many thanks to the developers of jquery.form (http://www.malsup.com/jquery/form/#getting-started). This jquery library for
    processing forms is a gem and relieved us of a ton of work. The hard work of the many contributors to this library is greatly appreciated.
    Of course, we are grateful to the developers of jQuery (http://jquery.org/). This is an fantastic javascript library that deserves the
    success it has seen. Without these two open source libraries, our programming effort for supporting AJAX would have been MUCH more difficult.
 */

var HotRiot = {};

HotRiot.sessionID = null;
HotRiot.lastHotRiotProcessingErrorCode = 0;
HotRiot.lastHotRiotProcessingError = '';

HotRiot.INVALID_DBN_FN_RN = [ 1, 'The database name, field name or record number is not valid.' ];
HotRiot.LOCATING_DBN_DBFN = [ 2, 'Could not locate either the database name or the database field names.' ];
HotRiot.LOCATING_FN_JDB = [ 3, 'Could not locate the field names for the join database: ' ];
HotRiot.LOCATING_FN_TDB = [ 4, 'Could not locate the field names for the trigger database: ' ];
HotRiot.INVALID_ACTION = [ 5, 'Invalid action.' ];
HotRiot.INVALID_RECORD_NUMBER = [ 6, 'Invalid record number.' ];
HotRiot.INVALID_QUERY_STRING = [ 7, 'Invalid query string.' ];

HotRiot.defines = {
    "SUCCESS": 0,
    "GENERAL_ERROR": -1,
    "SUBSCRIPTION_RECORD_LIMIT_EXCEPTION": 1,
    "INVALID_CAPTCHA_EXCEPTION": 2,
    "INVALID_DATA_EXCEPTION": 3,
    "NOT_UNIQUE_DATA_EXCEPTION": 4,
    "ACCESS_DENIED_EXCEPTION": 5,
    "FILE_SIZE_LIMIT_EXCEPTION": 6,
    "DB_FULL_EXCEPTION": 7,
    "BAD_OR_MISSING_ID_EXCEPTION": 8,
    "NO_RECORDS_FOUND_EXCEPTION": 9,
    "RECORD_NOT_FOUND_EXCEPTION": 10,
    "SESSION_TIMEOUT_EXCEPTION": 11,
    "UNAUTHORIZED_ACCESS_EXCEPTION": 12,
    "LOGIN_CREDENTIALS_NOT_FOUND": 13,
    "LOGIN_NOT_FOUND_EXCEPTION": 14,
    "INVALID_EMAIL_ADDRESS_EXCEPTION": 15,
    "MULTIPART_LIMIT_EXCEPTION": 16,
    "IP_ADDRESS_INSERT_RESTRICTION": 17,
    "INVALID_REQUEST": 18,
    "ANONYMOUS_USER_EXCEPTION": 19,
    "INVALID_UPDATE_CREDENTIALS" : 20
};

// Internal function that hides the URL parameters and is used to get and set these URLs.
HotRiot.processURLParams = (function()
{
    hotRiotProtocol = 'https://';
    fullyQualifiedHRDAURL = hotRiotProtocol + 'k222.k222.info/da';
    fullyQualifiedHRURL = hotRiotProtocol + 'k222.k222.info/process';
    
    return{
        getFullyQualifiedHRDAURL: function() {return fullyQualifiedHRDAURL;},
        getFullyQualifiedHRURL: function() {return fullyQualifiedHRURL;},
        
        setFullyQualifiedHRDAURL: function( nickname ) {fullyQualifiedHRDAURL = hotRiotProtocol + nickname  + '.k222.info/da';},
        setFullyQualifiedHRURL: function( nickname ) {fullyQualifiedHRURL = hotRiotProtocol + nickname + '.k222.info/process';}
    };

}());

/*
   Function: HotRiot.bindForm

   This function binds a form with the ID 'formID'. When a bound form is submitted (posted), the form data is automatically sent to the HotRiot server
   for processing. This function should be called for all forms on a page that you wish to post to HotRiot. This function should be called after the
   document has completed the load process using an 'onLoad' handler or jQuery's 'ready' function.

   Parameters:
      formID - The ID of the form that you wish to bind.

      requestPreProcessing - This is the callback function that is called just before the form is posted to the server, allowing for pre-processing.
                             Returning 'false' from this callback will cancel the post. Returning 'true' allows the post to proceed. You can pass
                             'null' for this parameter. This callback receives three arguments: formData is an array containing the form data that
                             will be passed to the server; jqForm is a jQuery object encapsulating the form element. To access the DOM element for
                             the form do this: var formElement = jqForm[0]; The final argument is the option map.

                             function requestPreProcessing( formData, jqForm, options);

      requestSuccessProcessing - The callback function that is called if the request succeeds. The function gets passed three arguments: The data returned
                                 from the server, formatted as json; a string describing the status; and the jqXHR. The the first argument to this
                                 callback (responseText) is the json data object returned by the server.

                                 function requestSuccessProcessing(responseText, statusText, xhr);

      requestErrorProcessing - The callback function that is called if the request fails. The function receives three arguments: The jqXHR object, a string describing
                               the type of error that occurred and an optional exception object, if one occurred. Possible values for the second argument (besides null)
                               are "timeout", "error", "abort", and "parsererror". When an HTTP error occurs, errorThrown receives the textual portion of the HTTP
                               status, such as "Not Found" or "Internal Server Error."

                              function requestErrorProcessing(jqXHR, textStatus, errorThrown);

   Returns: No return.
   Error Code: No error code is set by this function.
   See Also: <HotRiot.postLink>
*/
HotRiot.bindForm = function( formID, requestPreProcessing, requestSuccessProcessing, requestErrorProcessing )
{
    HotRiot.clearLastProcessingErrorCode();
    var bindOptions = new Object();

    bindOptions.dataType = 'json';
    bindOptions.timeout = 15000;  // Timeout request after 15 seconds.
    bindOptions.cache = false;
    if( requestPreProcessing != null )
        bindOptions.beforeSubmit = requestPreProcessing;
    bindOptions.beforeSerialize = HotRiot.beforeSerializeProcessing;
    bindOptions.success = requestSuccessProcessing;
    bindOptions.error = requestErrorProcessing;
    bindOptions.type = 'post';
    bindOptions.url = HotRiot.processURLParams.getFullyQualifiedHRURL();

    $('#' + formID).ajaxForm(bindOptions);
}

/*
   Function: HotRiot.init

   This function initializes the hotriot JavaScript library. It should be called once in the document ready.

   Parameters:
      nickname - This ias the nickname that you created when you registered with HotRiot.

   Returns: No return.
   Error Code: No error code is set by this function.
   See Also:
*/
HotRiot.init = function( nickname )
{
    HotRiot.clearLastProcessingErrorCode();

    HotRiot.processURLParams.setFullyQualifiedHRDAURL( nickname );
    HotRiot.processURLParams.setFullyQualifiedHRURL( nickname );
}

/*
   Function: HotRiot.postLink

   This function performs an ajax post of a link to the HotRiot server. Actually, it will post to wherever the parameer 'queryString' points to.
   This function is intended to be used to post links that are returned in the json responses by HotRiot, for example you would use this to
   post a 'sortLink' or a 'deleteRecordLink'.

   Parameters:
      queryString - The query string, including parameters, of the recepient of the GET request (the HotRiot server).

      requestSuccessProcessing - The callback function that is called if the request succeeds. The function gets passed three arguments: The data returned
                                 from the server, formatted as json; a string describing the status; and the jqXHR. The the first argument to this
                                 callback (responseText) is the json data object returned by the HotRiot server.

                                 function requestSuccessProcessing(responseText, statusText, xhr);

      requestErrorProcessing - The callback function that is called if the request fails. The function receives three arguments: The jqXHR object, a string describing
                               the type of error that occurred and an optional exception object, if one occurred. Possible values for the second argument (besides null)
                               are "timeout", "error", "abort", and "parsererror". When an HTTP error occurs, errorThrown receives the textual portion of the HTTP
                               status, such as "Not Found" or "Internal Server Error."

                              function requestErrorProcessing(jqXHR, textStatus, errorThrown);

   Returns: No return.
   Error Code: Sets 'lastHotRiotProcessingErrorCode=7' when the query string is invalid. Please note that the check of the query string is not exaustive and an invalid
               query string could pass as valid. You really should not encounter problems with the query string as long as you only use query strings that are returned
               by HotRiot.
   See Also: <HotRiot.bindForm>
*/
HotRiot.postLink = function( queryString, requestSuccessProcessing, requestErrorProcessing )
{
    HotRiot.clearLastProcessingErrorCode();

    var parts = queryString.split('?');
    if( parts.length == 2 )
    {
        if( HotRiot.sessionID !== null && HotRiot.sessionID !== undefined )
            parts[0] = parts[0].concat(';jsessionid=' + HotRiot.sessionID );

        $.ajax({
            url: parts[0],
            data: parts[1],
            success: [HotRiot.preSuccessProcessing, requestSuccessProcessing],
            error: requestErrorProcessing,
            timeout: 15000,
            xhrFields: {
                withCredentials: true
            },
            dataType: 'json'
        });
    }    
    else
        HotRiot.setLastProcessingError(HotRiot.INVALID_QUERY_STRING);
}


/*
   Function: HotRiot.submitRequest

   This function submits a processing request to HotRiot.

   Parameters:
      searchName - This is the name of the search which is to be invoked.

      searchCriterion - This is a JavaScript object that contains the name/value pairs for the search criterion posted to the search.

      requestSuccessProcessing - The callback function that is called if the request succeeds. The function gets passed three arguments: The data returned
                                 from the server, formatted as json; a string describing the status; and the jqXHR. The the first argument to this
                                 callback (responseText) is the json data object returned by the HotRiot server.

                                 function requestSuccessProcessing(responseText, statusText, xhr);

      requestErrorProcessing - The callback function that is called if the request fails. The function receives three arguments: The jqXHR object, a string describing
                               the type of error that occurred and an optional exception object, if one occurred. Possible values for the second argument (besides null)
                               are "timeout", "error", "abort", and "parsererror". When an HTTP error occurs, errorThrown receives the textual portion of the HTTP
                               status, such as "Not Found" or "Internal Server Error."

                              function requestErrorProcessing(jqXHR, textStatus, errorThrown);

   Returns: No return.
*/
HotRiot.submitRequest = function( requestData, requestSuccessProcessing, requestErrorProcessing )
{
    HotRiot.clearLastProcessingErrorCode();
    var url;
    if( HotRiot.sessionID !== null && HotRiot.sessionID !== undefined )
        url = HotRiot.processURLParams.getFullyQualifiedHRURL() + ';jsessionid=' + HotRiot.sessionID;
    else
        url = HotRiot.processURLParams.getFullyQualifiedHRURL();;

    $.ajax({
        url: url,
        data: requestData,
        success: [HotRiot.preSuccessProcessing, requestSuccessProcessing],
        error: requestErrorProcessing,
        timeout: 15000,
        type: 'post',
        xhrFields: {
            withCredentials: true
        },
        dataType: 'json'
    });

    return false;
}

HotRiot.preSuccessProcessing = function( jsonResponse )
{
    var sessionID = HotRiot.getGeneralInfo(jsonResponse, 'sessionID');
    if( sessionID !== '' )
        HotRiot.sessionID = sessionID;
}

/* This is a convenience function for posting a record to a database which simply forwards processing to the HotRiot.submitRequest function. This function posts a record
   to HotRiot. The database 'databaseName' is the database where the record will be stored. The JSON response object which contains the insert results is returned to the
   requestSuccessProcessing callback. This function can be used instead of the HotRiot.postRecord function for cases in which you do not wish to use a form to collect the
   record data, and instead would like to collect the data inputs manually. */
HotRiot.submitRecord = function( databaseName, recordData, requestSuccessProcessing, requestErrorProcessing )
{
    recordData['hsp-formname'] = databaseName;
    return HotRiot.submitRequest( recordData, requestSuccessProcessing, requestErrorProcessing );
}

HotRiot.submitUpdateRecord = function( databaseName, recordData, editPassword, recordID, requestSuccessProcessing, requestErrorProcessing )
{
    recordData['hsp-formname'] = databaseName;
    recordData['hsp-json'] = editPassword;
    recordData['hsp-recordID'] = recordID;
    return HotRiot.submitRequest( recordData, requestSuccessProcessing, requestErrorProcessing );
}

/* This is a convenience function for performing a search which simply forwards processing to the HotRiot.submitRequest function. This function posts a search request
   to HotRiot. The search 'searchName' is the search that will be executed. The JSON response object which contains the search results is returned to the
   requestSuccessProcessing callback. This function can be used instead of the HotRiot.postSearch function for cases in which you do not wish to use a form to collect the
   search criterion, and instead would like to collect the search inputs manually. */
HotRiot.submitSearch = function( searchName, searchCriterion, requestSuccessProcessing, requestErrorProcessing )
{
    searchCriterion['hsp-formname'] = searchName;
    return HotRiot.submitRequest( searchCriterion, requestSuccessProcessing, requestErrorProcessing );
}

/* This is a convenience function for performing a login which simply forwards processing to the HotRiot.submitRequest function. This function posts a login request
   to HotRiot. The login 'loginName' is the login that will be executed. The JSON response object which contains the login results is returned to the
   requestSuccessProcessing callback. This function can be used instead of the HotRiot.postLogin function for cases in which you do not wish to use a form to collect the
   login credentials, and instead would like to collect the login inputs manually. */
HotRiot.submitLogin = function( loginName, loginCredentials, requestSuccessProcessing, requestErrorProcessing )
{
    loginCredentials['hsp-formname'] = loginName;
    return HotRiot.submitRequest( loginCredentials, requestSuccessProcessing, requestErrorProcessing );
}

/* This is a convenience function for posting notification registration which simply forwards processing to the HotRiot.submitRequest function. This function posts a notification
   registration request to HotRiot. The database 'databaseName' is the database for which the notification is being registered. The JSON response object which contains the
   results is returned to the requestSuccessProcessing callback. This function can be used instead of the HotRiot.postNotification function for cases in which you do not wish to
   use a form to collect the notification record data, and instead would like to collect the data inputs manually. */
HotRiot.submitNotification = function( databaseName, recordData, requestSuccessProcessing, requestErrorProcessing )
{
    recordData['hsp-formname'] = databaseName;
    recordData['hsp-rtninsert'] = "1";
    return HotRiot.submitRequest( recordData, requestSuccessProcessing, requestErrorProcessing );
}

/* This is a convenience function for performing a lost login lookup which simply forwards processing to the HotRiot.submitRequest function. This function posts a login
   lookup request to HotRiot. The login 'loginName' is the login for which the login credentials are lost. The JSON response object which contains the lost login lookup
   results is returned to the requestSuccessProcessing callback. This function can be used instead of the HotRiot.postLostLoginLookup function for cases in which you do not
   wish to use a form to collect the login credentials, and instead would like to collect the login inputs manually. */
HotRiot.submitLostLoginLookup = function( loginName, loginEmailAddress, requestSuccessProcessing, requestErrorProcessing )
{
    loginEmailAddress['hsp-formname'] = loginName;
    return HotRiot.submitRequest( loginEmailAddress, requestSuccessProcessing, requestErrorProcessing );
}

// This function submits a record count request. The 'sll' flag is used for setting a standard record count request (false)
// or a record count that counts the number of reords since the last time the user was logged in (true). The JSON response
// object which contains the search results is returned to the requestSuccessProcessing callback.
HotRiot.submitRecordCountActual = function( recordCountObject, requestSuccessProcessing, requestErrorProcessing, sll )
{
    recordCountObject['hsp-initializepage'] = 'hsp-json';
    recordCountObject['hsp-action'] = 'recordcount';
    recordCountObject['hsp-sll'] = sll;
    recordCountObject.sinceLastLogin = false;
    return HotRiot.submitRequest( recordCountObject, requestSuccessProcessing, requestErrorProcessing );
}

// This is a wrapper function for the HotRiot.submitRecordCountActual. It submits a general record count request.
HotRiot.submitRecordCount = function( recordCountObject, requestSuccessProcessing, requestErrorProcessing )
{
    HotRiot.submitRecordCountActual( recordCountObject, requestSuccessProcessing, requestErrorProcessing, 'false' );
}

// This is a wrapper function for the HotRiot.submitRecordCountActual. It submits a since last login record count request.
HotRiot.submitRecordCountSLL = function( recordCountObject, requestSuccessProcessing, requestErrorProcessing )
{
    HotRiot.submitRecordCountActual( recordCountObject, requestSuccessProcessing, requestErrorProcessing, 'true' );
}

/*
   Function: HotRiot.postForm

   This function immediately posts a form with the ID 'formID' to HotRiot for processing. When a form is submitted (posted), the form data is immediately
   sent to the HotRiot server for processing. This function should be called when you are ready to post a particular form to HotRiot. This function should
   only be called after the document has completed the load process using an 'onLoad' handler or jQuery's 'ready' function.

   Parameters:
      formID - The ID of the form that you wish to bind.

      requestSuccessProcessing - The callback function that is called if the request succeeds. The function gets passed three arguments: The data returned
                                 from the server, formatted as json; a string describing the status; and the jqXHR. The the first argument to this
                                 callback (responseText) is the json data object returned by the server.

                                 function requestSuccessProcessing(responseText, statusText, xhr);

      requestErrorProcessing - The callback function that is called if the request fails. The function receives three arguments: The jqXHR object, a string describing
                               the type of error that occurred and an optional exception object, if one occurred. Possible values for the second argument (besides null)
                               are "timeout", "error", "abort", and "parsererror". When an HTTP error occurs, errorThrown receives the textual portion of the HTTP
                               status, such as "Not Found" or "Internal Server Error."

                              function requestErrorProcessing(jqXHR, textStatus, errorThrown);

   Returns: No return.
   Error Code: No error code is set by this function.
   See Also: <HotRiot.submitSearch, HotRiot.postRecord>
*/
HotRiot.postForm = function( formID, requestPreProcessing, requestSuccessProcessing, requestErrorProcessing, extra )
{
    HotRiot.clearLastProcessingErrorCode();
    var bindOptions = new Object();

    bindOptions.dataType = 'json';
    bindOptions.timeout = 15000;  // Timeout request after 15 seconds.
    bindOptions.cache = false;
    if( requestPreProcessing != null )
        bindOptions.beforeSubmit = requestPreProcessing;
    if( extra == null )
        bindOptions.beforeSerialize = HotRiot.beforeSerializeProcessing;
    else
        if( extra[0] == 'notification' )
            bindOptions.beforeSerialize = HotRiot.beforeSerializeNotificationProcessing;
        else
            if( extra[0] == 'recordUpdate' )
            {
                bindOptions.extra = extra;
                bindOptions.beforeSerialize = HotRiot.beforeSerializeRecordUpdateProcessing;
            }
    bindOptions.success = [HotRiot.preSuccessProcessing, requestSuccessProcessing];
    bindOptions.error = requestErrorProcessing;
    bindOptions.type = 'post';
    if( HotRiot.sessionID !== null && HotRiot.sessionID !== undefined )
        bindOptions.url = HotRiot.processURLParams.getFullyQualifiedHRURL() + ";jsessionid=" + HotRiot.sessionID;
    else
        bindOptions.url = HotRiot.processURLParams.getFullyQualifiedHRURL();
    bindOptions.crossDomain = true;
    bindOptions.xhrFields = new Object();
    bindOptions.xhrFields['withCredentials'] = true;

    $('#' + formID).ajaxSubmit( bindOptions );
    return false;
}

// This is a convenience function for saving a record to your databases which simply forwards processing to the HotRiot.postForm function.
HotRiot.postRecord = function( formID, requestSuccessProcessing, requestErrorProcessing )
{
    return HotRiot.postForm( formID, null, requestSuccessProcessing, requestErrorProcessing, null );
}

// This is a convenience function for saving a record to your databases which simply forwards processing to the HotRiot.postForm function.
HotRiot.postUpdateRecord = function( formID, editPassword, recordID, requestSuccessProcessing, requestErrorProcessing )
{
    return HotRiot.postForm( formID, null, requestSuccessProcessing, requestErrorProcessing, new Array('recordUpdate', editPassword, recordID) );
}

// This is a convenience function for performing a search which simply forwards processing to the HotRiot.postForm function.
HotRiot.postSearch = function( formID, requestSuccessProcessing, requestErrorProcessing )
{
    return HotRiot.postForm( formID, null, requestSuccessProcessing, requestErrorProcessing, null );
}

// This is a convenience function for performing a login which simply forwards processing to the HotRiot.postForm function.
HotRiot.postLogin = function( formID, requestSuccessProcessing, requestErrorProcessing )
{
    return HotRiot.postForm( formID, null, requestSuccessProcessing, requestErrorProcessing, null );
}

// This is a convenience function for posting a notification registration request which simply forwards processing to the HotRiot.postForm function.
HotRiot.postNotification = function( formID, requestSuccessProcessing, requestErrorProcessing )
{
    return HotRiot.postForm( formID, null, requestSuccessProcessing, requestErrorProcessing, new Array('notification') );
}

// This is a convenience function for posting a lost login lookup request which simply forwards processing to the HotRiot.postForm function.
HotRiot.postLostLoginLookup = function( formID, requestSuccessProcessing, requestErrorProcessing )
{
    return HotRiot.postForm( formID, null, requestSuccessProcessing, requestErrorProcessing, null );
}


/*
   Function: HotRiot.getResults

   This function tells you if HotRiot encountered an error processing the request. It returns all values from the json response that are related to
   the processing result. The values are returned in a javascript object.

   Parameters:
      jsonResponse - This is the json response object that is passed to the ajax success callback (requestSuccessProcessing). See 'HotRiot.bindForm'
                     and 'HotRiot.postLink' for more details.

   Returns: The 'processingResult' javascript object. This object includes four variables:
      resultCode - A value of 0 indicates success, anything other than 0 indicates an error.
      result - This will be 'Success' when 'resultCode' is 0, otherwise this will be a short description of the error.
      resultMessage - This will be 'Success' when 'resultCode' is 0, otherwise this will be a more detailed description of the error.
      processingTimeStamp - This is a timestamp of when the request reached HotRiot for processing, the format is: mm/dd/yyyy HH:MM:SS (24 hour time)

   Error Code: No error code is set by this function.
   See Also: <HotRiot.getResultCode, HotRiot.getResultText, HotRiot.getResultMessage, HotRiot.getProcessingTimestamp>
*/
HotRiot.getResults = function(jsonResponse)
{
    HotRiot.clearLastProcessingErrorCode();
    var processingResult = new Object();

    processingResult.resultCode = HotRiot.getResultCode(jsonResponse);
    processingResult.resultText = HotRiot.getResultText(jsonResponse);
    processingResult.resultMessage = HotRiot.getResultMessage(jsonResponse);
    processingResult.processingTimeStamp = HotRiot.getProcessingTimestamp(jsonResponse);

    return processingResult;
}

/*
   Function: HotRiot.getRecordCountInfo

   This function returns all values from the json response that are related to the number of records processed by the request. The values are returned in a javascript object.

   Parameters:
      jsonResponse - This is the json response object that is passed to the ajax success callback (requestSuccessProcessing). See 'HotRiot.bindForm'
                     and 'HotRiot.postLink' for more details.

   Returns: The 'recordCountInfo' javascript object. This object includes four variables:
      recordCount - This is the number of records returned on the current page of the search results. Let’s say you perform a search that locates 24 records and you set-up your search
                    results to return 10 records per page. In this case, the complete search results will be returned over three pages. On the first and second page of the search results
                    the record count will be 10, on the third page it will be 4.
      pageCount - This is the number of pages required to display all records located by a search. Let’s say you perform a search that locates 24 records and you set-up your search results
                  to return 10 records per page. In this case, the page count will be 3.
      pageNumber - This is the results page currently being shown.
      totalRecordsFound - This is the total number of records located by the search.

   Error Code: No error code is set by this function.
   See Also: <HotRiot.getRecordCountForThisPage, HotRiot.getPageCount, HotRiot.getPageNumber, HotRiot.getTotalRecordsFound>
*/
HotRiot.getRecordCountInfo = function(jsonResponse)
{
    HotRiot.clearLastProcessingErrorCode();
    var recordCountInfo = new Object();

    recordCountInfo.recordCount = HotRiot.getRecordCountForThisPage(jsonResponse);
    recordCountInfo.pageCount = HotRiot.getPageCount(jsonResponse);
    recordCountInfo.pageNumber = HotRiot.getPageNumber(jsonResponse);
    recordCountInfo.totalRecordsFound = HotRiot.getTotalRecordsFound(jsonResponse);

    return recordCountInfo;
}

/*
   Function: HotRiot.getSearchPageLinks

   This function returns all links from the json response that are related to navigating through search results that span multiple pages. The values are returned in a javascript opbect.
   These links are sent to HotRiot for processing using the 'HotRiot.postLink' function.

   Parameters:
      jsonResponse - This is the json response object that is passed to the ajax success callback (requestSuccessProcessing). See 'HotRiot.bindForm'
                     and 'HotRiot.postLink' for more details.

   Returns: The 'searchPageLinks' javascript object. This object includes four variables:
      firstPageSearchLink - This link returns the first page of the search result. This field will be blank if the first page of the search results is
                            currently being shown or the results do not span more than one page.
      nextPageSearchLink - This link returns the next page of the search result. This field will be blank if the last page of the search results is
                           currently being shown or the results do not span more than one page.
      previousPageSearchLink - This link returns the previous page of the search result. This field will be blank if the first page of the search results
                               is currently being shown or the results do not span more than one page
      returnToSearchLink - This link re-posts the original search request, returning the first page of the search results.

   Error Code: No error code is set by this function.
   See Also: <HotRiot.postLink, HotRiot.getFirstPageSearchLink, HotRiot.getNextPageSearchLink, HotRiot.getPreviousPageSearchLink, HotRiot.getReturnSearchLink>
*/
HotRiot.getSearchPageLinks = function(jsonResponse)
{
    HotRiot.clearLastProcessingErrorCode();
    var searchPageLinks = new Object();

    searchPageLinks.firstPageSearchLink = HotRiot.getFirstPageSearchLink(jsonResponse);
    searchPageLinks.nextPageSearchLink = HotRiot.getNextPageSearchLink(jsonResponse);
    searchPageLinks.previousPageSearchLink = HotRiot.getPreviousPageSearchLink(jsonResponse);
    searchPageLinks.returnToSearchLink = HotRiot.getReturnSearchLink(jsonResponse);

    return searchPageLinks;
}

/*
   Function: HotRiot.getSubscriptionInfo

   This function returns all values from the json response that are related to the currently logged-in users account status.

   Parameters:
      jsonResponse - This is the json response object that is passed to the ajax success callback (requestSuccessProcessing). See 'HotRiot.bindForm'
                     and 'HotRiot.postLink' for more details.

   Returns: The 'subscriptionInfo' javascript object. This object includes four variables:
      loggedInStatus - This is the name of the database that the currently logged in user is logged into. This field will be blank if the current user is anonymous (not logged in).
      subscriptionStatus - This is the subscription status of the currently logged in user. Possible values are "Active" or "Inactive".  This field will be set to Active if the
                           current user is anonymous (not logged in).
      loggedInUserID - This is the ID that uniquely identifies the currently logged in user. This field will be blank if the current user is anonymous (not logged in). In future version of HotRiot
                       you will be able to use this key to directly manipulate the logged-in users record data.
      loggedInUserInfoLink - This link is used to retreive all of the record data associated with the currently logged-in user. This field will be blank if the current user is anonymous (not logged in).
                             The record data for the logged-in user will be returned as formatted json. Included in the response is the field data submitted by the user in their registration,
                             subscription details for the user, their subscription payment history and other miscellaneous information. This links is sent to HotRiot for processing using the
                             'HotRiot.postLink' function.

   Error Code: No error code is set by this function.
   See Also: <HotRiot.getLoggedInStatus, HotRiot.getSubscriptionStatus, HotRiot.getLoggedInUserID, HotRiot.getLoggedInUserInfoLink>
*/
HotRiot.getSubscriptionInfo = function(jsonResponse)
{
    HotRiot.clearLastProcessingErrorCode();
    var subscriptionInfo = new Object();

    subscriptionInfo.loggedInStatus = HotRiot.getLoggedInStatus(jsonResponse);
    subscriptionInfo.subscriptionStatus = HotRiot.getSubscriptionStatus(jsonResponse);

/*
    // For future expansion. For now, don't return this values. Do not modify this code to return this value, it may be removed from the future version of the jsonResponse.s
    subscriptionInfo.loggedInUserID = HotRiot.getLoggedInUserID(jsonResponse);

    // For future expansion. For now, don't return this values. Do not modify this code to return this value, it may be removed from the future version of the jsonResponse.
    subscriptionInfo.loggedInUserInfoLink = HotRiot.getLoggedInUserInfoLink(jsonResponse);
*/

    return subscriptionInfo;
}

/*
   Function: HotRiot.getRecordLinkInfo

   This function returns the links from the json response that are related to a particular record.

   Parameters:
      recordNumber: The record number from where you would like to retrieve the link information. Record numbers start from 1.

      jsonResponse - This is the json response object that is passed to the ajax success callback (requestSuccessProcessing). See 'HotRiot.bindForm'
                     and 'HotRiot.postLink' for more details.

   Returns: The 'recordLinkInfo' javascript object. This object includes three variables:
      recordLink - This link returns the record data for the record 'recordNumber' The data is returned as json. Records pulled in by an associated table select trigger are also included
                   in the json response. This links is sent to HotRiot for processing using the 'HotRiot.postLink' function.
      deleteRecordLink - This link deletes the record referenced by the link (recordNumber), including records referenced by any associated delete trigger. The original search resulss, minus
                         the deleted record, is returned as json. This links is sent to HotRiot for processing using the 'HotRiot.postLink' function.
      editRecordPswd - This is the edit record password for the record 'recordNumber'. Please see the full documentation for how this password is used.

   Error Code: Sets 'lastHotRiotProcessingErrorCode=6' if 'recordNumber' is out of range. In this case, the three return values are set to an empty string.
   See Also: <HotRiot.postLink, HotRiot.getRecordLink, HotRiot.getDeleteRecordLink, HotRiot.getEditRecordPswd>
*/
HotRiot.getRecordLinkInfo = function(recordNumber, jsonResponse)
{
    HotRiot.clearLastProcessingErrorCode();
    var recordLinkInfo = new Object();

    if( HotRiot.isValidRecordNumber(recordNumber, jsonResponse) == true )
    {
        recordLinkInfo.recordLink = HotRiot.getRecordLink(recordNumber, jsonResponse);
        recordLinkInfo.deleteRecordLink = HotRiot.getDeleteRecordLink(recordNumber, jsonResponse);
        recordLinkInfo.editRecordPswd = HotRiot.getEditRecordPswd(recordNumber, jsonResponse);
    }
    else
    {
        recordLinkInfo.recordLink = '';
        recordLinkInfo.deleteRecordLink = '';
        recordLinkInfo.editRecordPswd = '';
    }

    return recordLinkInfo;
}

/*
   Function: HotRiot.getDatabaseFieldInfo

   This function returns all of the field data associated with a field in a record from a named database. You can call this function directly if you want to get the field
   data for a specific field in a database. However, this function is normally called by the 'HotRiot.getRecord' function.

   Parameters:
      recordNumber: The record number from where you would like to retreive the field data.

      fieldName: The field name in the record that you would like to retreive the field data.

      databaseName: The database that contains the field that you would like to retreive the field data. Normally this is the database returned by the function
                    'HotRiot.getDatabaseName(), however, if the results returned by HotRiot includes triggers or joins, this could be a database name returned by
                    'HotRiot.getJoinDatabaseNames()' or 'HotRiot.getTriggerDatabaseNames()';

      jsonResponse - This is the json response object that is passed to the ajax success callback (requestSuccessProcessing). See 'HotRiot.bindForm'
                     and 'HotRiot.postLink' for more details.

   Returns: The 'recordInfo' javascript object. This object includes between 7 and 9 variables:
      value - This is an array that holds the actual record data. The number of elements in the array is equal to the value in the 'dataCount' variable, normally this will be 1.
      dataType - This is the type of data in the 'value' array field. This can be 'Text", 'File', 'Email Address', 'Number' etc.
      dataCount - This is the number of elements in the 'value' array.
      sortLink - This link reprocesses the search, sorting the results based on the 'value' field for which the link appears. The first time a sort link is posted for a particular field,
                 the data is sorted in ascending order. If the same sort link is processed again (with no other sort links selected in-between), the data is sorted in descending
                 order. The record data is returned as json. The 'sortLink' may be empty if sorting is not applicable. This links is sent to HotRiot for processing using the
                 'HotRiot.postLink' function.
      fieldName - This is the name of the field whos data is returned by this function.
      databaseName - This is the name of the database that contains the field whos data is returned by this function.
      isPicture -  This will be 'true' if the value in the 'dataType' field is File and the file type is .JPG. It will be 'false' otherwise.
      fileLinkURL - If the 'dataType' field is File, this field will contain a URL that points to the file. Otherwise, this field will not appear in the 'recordInfo' object.
      thumbnailLinkURL - If the 'isPicture' field is true, this field will contain a URL that points to a thumbnail representation of the image. Otherwise, this filed will not appear in
                         the 'recordInfo' object.
      
   Error Code: Sets 'lastHotRiotProcessingErrorCode=1' if the database name, field name or record number is not valid.
   See Also: <HotRiot.postLink, HotRiot.getRecord, HotRiot.getTriggerRecordInfo, HotRiot.getJoinRecord>
*/
HotRiot.getDatabaseFieldInfo = function(recordNumber, fieldName, databaseName, jsonResponse)
{
    HotRiot.clearLastProcessingErrorCode();
    var dbFieldName = databaseName + '::' + fieldName;
    var finalRecordNumber = 'record_' + recordNumber;

    var recordInfo = null;
    if( jsonResponse.recordData[finalRecordNumber].fieldData[dbFieldName] != null )
    {
        recordInfo = new Object();

        recordInfo.value = jsonResponse.recordData[finalRecordNumber].fieldData[dbFieldName].value;
        recordInfo.dataType = jsonResponse.recordData[finalRecordNumber].fieldData[dbFieldName].dataType;
        recordInfo.dataCount = jsonResponse.recordData[finalRecordNumber].fieldData[dbFieldName].dataCount;
        recordInfo.sortLink = jsonResponse.recordData[finalRecordNumber].fieldData[dbFieldName].sortLink;
        recordInfo.fieldName = fieldName;
        recordInfo.databaseName = databaseName;
        if( recordInfo.dataType == "File")
        {
            recordInfo.fileLinkURL = jsonResponse.recordData[finalRecordNumber].fieldData[dbFieldName].fileLinkURL;
            if( (recordInfo.isPicture = HotRiot.isImage( recordInfo.value[0] )) == true )
                recordInfo.thumbnailLinkURL = jsonResponse.recordData[finalRecordNumber].fieldData[dbFieldName].thumbnailLinkURL;
            else
                recordInfo.thumbnailLinkURL = '';
        }
        else
            recordInfo.isPicture = false;
    }
    else
        HotRiot.setLastProcessingError(HotRiot.INVALID_DBN_FN_RN);

    return recordInfo;
}

/*
   Function: HotRiot.getResultCode - This function retrieves the processing result code.

   Parameters:
      jsonResponse - This is the json response object that is passed to the ajax success callback (requestSuccessProcessing). See 'HotRiot.bindForm'
                     and 'HotRiot.postLink' for more details.

   Returns: The processing result code. A value of 0 indicates success, anything other than 0 indicates HotRiot encountered an error processing the request.

   Error Code: Sets 'lastHotRiotProcessingErrorCode=5' if there was an error retreiving the result.
   See Also: <HotRiot.getResults>
*/
HotRiot.getResultCode = function(jsonResponse)
{
    return HotRiot.getGeneralInfo(jsonResponse, 'processingResultCode');
}

/*
   Function: HotRiot.getResult - This function retrieves the processing result.

   Parameters:
      jsonResponse - This is the json response object that is passed to the ajax success callback (requestSuccessProcessing). See 'HotRiot.bindForm'
                     and 'HotRiot.postLink' for more details.

   Returns: The processing result. This will be 'Success' if there was no error processing the request, otherwise a short description of the error will be returned.

   Error Code: Sets 'lastHotRiotProcessingErrorCode=5' if there was an error retreiving the result.
   See Also: <HotRiot.getResults>
*/
HotRiot.getResultText = function(jsonResponse)
{
    return HotRiot.getGeneralInfo(jsonResponse, 'processingResult');
}

/*
   Function: HotRiot.getResultMessage - This function retrieves the processing result message.

   Parameters:
      jsonResponse - This is the json response object that is passed to the ajax success callback (requestSuccessProcessing). See 'HotRiot.bindForm'
                     and 'HotRiot.postLink' for more details.

   Returns: The processing result message. This will be 'Success' if there was no error processing the request, otherwise a more detailed description of the error will be returned.

   Error Code: Sets 'lastHotRiotProcessingErrorCode=5' if there was an error retreiving the result.
   See Also: <HotRiot.getResults>
*/
HotRiot.getResultMessage = function(jsonResponse)
{
    return HotRiot.getGeneralInfo(jsonResponse, 'processingResultMessage');
}

/*
   Function: HotRiot.getProcessingTimestamp - This function retrieves the timestamp when HotRiot received the processing request.

   Parameters:
      jsonResponse - This is the json response object that is passed to the ajax success callback (requestSuccessProcessing). See 'HotRiot.bindForm'
                     and 'HotRiot.postLink' for more details.

   Returns: The timestamp when the request reached HotRiot for processing, the format is: mm/dd/yyyy HH:MM:SS (24 hour time).

   Error Code: Sets 'lastHotRiotProcessingErrorCode=5' if there was an error retreiving the result.
   See Also: <HotRiot.getResults>
*/
HotRiot.getProcessingTimestamp = function(jsonResponse)
{
    return HotRiot.getGeneralInfo(jsonResponse, 'timeStamp');
}

/*
   Function: HotRiot.getAction - This function retrieves the 'action' of the processing request. This is the operation that was requested.

   Parameters:
      jsonResponse - This is the json response object that is passed to the ajax success callback (requestSuccessProcessing). See 'HotRiot.bindForm'
                     and 'HotRiot.postLink' for more details.

   Returns: The 'action'. Please see the full documentation for the possible values for action and their meaning.

   Error Code: Sets 'lastHotRiotProcessingErrorCode=5' if there was an error retrieving the result.
   See Also: <>
*/
HotRiot.getAction = function(jsonResponse)
{
    return HotRiot.getGeneralInfo(jsonResponse, 'action');
}

/*
   Function: HotRiot.getLastLogin - This function retrieves the last time the current user logged-in.

   Parameters:
      jsonResponse - This is the json response object that is passed to the ajax success callback (requestSuccessProcessing). See 'HotRiot.bindForm'
                     and 'HotRiot.postLink' for more details.

   Returns: The last login date and time. The format for this timestamp will be whatever you set in the HotRiot system preferences page.

   Error Code: Sets 'lastHotRiotProcessingErrorCode=5' if there was an error retreiving the result.
   See Also: <>
*/
HotRiot.getLastLogin = function(jsonResponse)
{
    return HotRiot.getGeneralInfo(jsonResponse, 'lastLogin');
}

/*
   Function: HotRiot.getSearchName - This function retrieves the name of the search.

   Parameters:
      jsonResponse - This is the json response object that is passed to the ajax success callback (requestSuccessProcessing). See 'HotRiot.bindForm'
                     and 'HotRiot.postLink' for more details.

   Returns: When the "action" (see HotRiot.getAction) is "Search", this will be the name of the search that was submitted to HotRiot which was executed.
            If the action is anything else, this value will be empty.

   Error Code: Sets 'lastHotRiotProcessingErrorCode=5' if there was an error retreiving the result.
   See Also: <HotRiot.getAction>
*/
HotRiot.getSearchName = function(jsonResponse)
{
    return HotRiot.getGeneralInfo(jsonResponse, 'searchName');
}

/*
   Function: HotRiot.getPageCount - This function retrieves the page count.

   Parameters:
      jsonResponse - This is the json response object that is passed to the ajax success callback (requestSuccessProcessing). See 'HotRiot.bindForm'
                     and 'HotRiot.postLink' for more details.

   Returns: The is the number of pages required to display all records located by a search. Let’s say you perform a search that locates 24 records and
            you set-up your search results to return 10 records per page. In this case, the page count will be 3.

   Error Code: Sets 'lastHotRiotProcessingErrorCode=5' if there was an error retreiving the result.
   See Also: <HotRiot.getRecordCountInfo, HotRiot.getPageNumber, HotRiot.getTotalRecordsFound, HotRiot.getRecordCountForThisPage>
*/
HotRiot.getPageCount = function(jsonResponse)
{
    return HotRiot.getGeneralInfo(jsonResponse, 'pageCount');
}

/*
   Function: HotRiot.getPageNumber - This function retrieves the page number.

   Parameters:
      jsonResponse - This is the json response object that is passed to the ajax success callback (requestSuccessProcessing). See 'HotRiot.bindForm'
                     and 'HotRiot.postLink' for more details.

   Returns: This is the results page returned in this json response. See HotRiot.getPageCount.

   Error Code: Sets 'lastHotRiotProcessingErrorCode=5' if there was an error retreiving the result.
   See Also: <HotRiot.getRecordCountInfo, HotRiot.getTotalRecordsFound, HotRiot.getPageCount, HotRiot.getRecordCountForThisPage>
*/
HotRiot.getPageNumber = function(jsonResponse)
{
    return HotRiot.getGeneralInfo(jsonResponse, 'pageNumber');
}

/*
   Function: HotRiot.getTotalRecordsFound - This function retrieves the total number of records located by the last search.

   Parameters:
      jsonResponse - This is the json response object that is passed to the ajax success callback (requestSuccessProcessing). See 'HotRiot.bindForm'
                     and 'HotRiot.postLink' for more details.

   Returns: This is the total number of records located by the search.

   Error Code: Sets 'lastHotRiotProcessingErrorCode=5' if there was an error retreiving the result.
   See Also: <HotRiot.getRecordCountInfo, HotRiot.getPageNumber, HotRiot.getPageCount, HotRiot.getRecordCountForThisPage>
*/
HotRiot.getTotalRecordsFound = function(jsonResponse)
{
    return HotRiot.getGeneralInfo(jsonResponse, 'totalRecordsFound');
}

/*
   Function: HotRiot.getLoggedInStatus - Retrieves the name of the database that the current user is logged into.

   Parameters:
      jsonResponse - This is the json response object that is passed to the ajax success callback (requestSuccessProcessing). See 'HotRiot.bindForm'
                     and 'HotRiot.postLink' for more details.

   Returns: This is the name of the database that the current user is logged into. This field will be blank if the current user is anonymous (not logged in).

   Error Code: Sets 'lastHotRiotProcessingErrorCode=5' if there was an error retreiving the result.
   See Also: <HotRiot.getSubscriptionInfo, sHotRiot.getSubscriptionStatus, HotRiot.getLoggedInUserID, HotRiot.getLoggedInUserInfoLink>
*/
HotRiot.getLoggedInStatus = function(jsonResponse)
{
    return HotRiot.getGeneralInfo(jsonResponse, 'loggedInStatus');
}

/*
   Function: HotRiot.getSubscriptionStatus - Retrieves the subscription status of the currently logged in user.

   Parameters:
      jsonResponse - This is the json response object that is passed to the ajax success callback (requestSuccessProcessing). See 'HotRiot.bindForm'
                     and 'HotRiot.postLink' for more details.

   Returns: This is the subscription status of the currently logged in user. Possible values are "Active" or "Inactive".  This field will be set to
            Active if the current user is anonymous (not logged in).

   Error Code: Sets 'lastHotRiotProcessingErrorCode=5' if there was an error retreiving the result.
   See Also: <HotRiot.getSubscriptionInfo, HotRiot.getLoggedInStatus, HotRiot.getLoggedInUserID, HotRiot.getLoggedInUserInfoLink>
*/
HotRiot.getSubscriptionStatus = function(jsonResponse)
{
    return HotRiot.getGeneralInfo(jsonResponse, 'subscriptionStatus');
}

/*
   Function: HotRiot.getLoggedInUserID - Retrieves the ID that uniquely identifies the currently logged in user.

   Parameters:
      jsonResponse - This is the json response object that is passed to the ajax success callback (requestSuccessProcessing). See 'HotRiot.bindForm'
                     and 'HotRiot.postLink' for more details.

   Returns: This is the ID that uniquely identifies the currently logged in user. This field will be blank if the current user is anonymous (not logged in).
            In future version of HotRiot you will be able to use this key to directly manipulate the logged in users record data.

   Error Code: Sets 'lastHotRiotProcessingErrorCode=5' if there was an error retreiving the result.
   See Also: <HotRiot.getSubscriptionInfo, HotRiot.getLoggedInStatus, sHotRiot.getSubscriptionStatus, HotRiot.getLoggedInUserInfoLink>
*/
HotRiot.getLoggedInUserID = function(jsonResponse)
{
    return HotRiot.getGeneralInfo(jsonResponse, 'loggedInUserID');
}

/*
   Function: HotRiot.getLoggedInUserInfoLink - link is used to retrieve all of the record data associated with the currently logged-in user.

   Parameters:
      jsonResponse - This is the json response object that is passed to the ajax success callback (requestSuccessProcessing). See 'HotRiot.bindForm'
                     and 'HotRiot.postLink' for more details.

   Returns: This link is used to retreive all of the record data associated with the currently logged-in user. This field will be blank if the current user is the(not logged in).
            The record data for the logged-in user will be returned as formatted json. Included in the response is the field data submitted by the user in their registration,
            subscription details for the user, their subscription payment history and other miscellaneous information. This links is sent to HotRiot for processing using the
            'HotRiot.postLink' function.

   Error Code: Sets 'lastHotRiotProcessingErrorCode=5' if there was an error retreiving the result.
   See Also: <HotRiot.getSubscriptionInfo, HotRiot.postLink, HotRiot.getLoggedInStatus, sHotRiot.getSubscriptionStatus, HotRiot.getLoggedInUserID>
*/
HotRiot.getLoggedInUserInfoLink = function(jsonResponse)
{
    return HotRiot.getGeneralInfo(jsonResponse, 'loggedInUserInfoLink');
}

/*
   Function: HotRiot.getRecordCountForThisPage - This is the number of records returned on the current page of the search results (this json response).

   Parameters:
      jsonResponse - This is the json response object that is passed to the ajax success callback (requestSuccessProcessing). See 'HotRiot.bindForm'
                     and 'HotRiot.postLink' for more details.

   Returns: This is the number of records returned on the current page of the search results (this json response). Let’s say you perform a search that locates
            24 records and you set-up your search results to return 10 records per page. In this case, the complete search results will be returned over three
            pages. On the first and second page of the search results the record count will be 10, on the third page it will be 4.

   Error Code: Sets 'lastHotRiotProcessingErrorCode=5' if there was an error retreiving the result.
   See Also: <HotRiot.getRecordCountInfo, HotRiot.getPageNumber, HotRiot.getTotalRecordsFound, HotRiot.getPageCount>
*/
HotRiot.getRecordCountForThisPage = function(jsonResponse)
{
    return HotRiot.getGeneralInfo(jsonResponse, 'recordCount');
}

/*
   Function: HotRiot.getFirstPageSearchLink - Returns the first page of the search result..

   Parameters:
      jsonResponse - This is the json response object that is passed to the ajax success callback (requestSuccessProcessing). See 'HotRiot.bindForm'
                     and 'HotRiot.postLink' for more details.

   Returns: This link returns the first page of the search result. This field will be blank if the first page of the search results is currently being
            shown or the results do not span more than one page. This links is sent to HotRiot for processing using the 'HotRiot.postLink' function.

   Error Code: Sets 'lastHotRiotProcessingErrorCode=5' if there was an error retreiving the result.
   See Also: <HotRiot.getSearchPageLinks, HotRiot.postLink, HotRiot.getNextPageSearchLink, HotRiot.getPreviousPageSearchLink, HotRiot.getReturnSearchLink>
*/
HotRiot.getFirstPageSearchLink = function(jsonResponse)
{
    return HotRiot.getGeneralInfo(jsonResponse, 'firstPageLinkURL');
}

/*
   Function: HotRiot.getNextPageSearchLink - Returns the next page of the search result for a search that returns a number of records that spans multiple pages.

   Parameters:
      jsonResponse - This is the json response object that is passed to the ajax success callback (requestSuccessProcessing). See 'HotRiot.bindForm'
                     and 'HotRiot.postLink' for more details.

   Returns: This link returns the next page of the search result for a search that returns a number of records that spans multiple pages. This field will be blank
            if the last page of the search results is currently being shown or the results do not span more than one page. This links is sent to HotRiot for processing
            using the 'HotRiot.postLink' function.

   Error Code: Sets 'lastHotRiotProcessingErrorCode=5' if there was an error retreiving the result.
   See Also: <HotRiot.getSearchPageLinks, HotRiot.postLink, HotRiot.getFirstPageSearchLink, HotRiot.getPreviousPageSearchLink, HotRiot.getReturnSearchLink>
*/
HotRiot.getNextPageSearchLink = function(jsonResponse)
{
    return HotRiot.getGeneralInfo(jsonResponse, 'nextPageLinkURL');
}

/*
   Function: HotRiot.getPreviousPageSearchLink - Returns the previous page of the search result for a search that returns a number of records that spans multiple pages.

   Parameters:
      jsonResponse - This is the json response object that is passed to the ajax success callback (requestSuccessProcessing). See 'HotRiot.bindForm'
                     and 'HotRiot.postLink' for more details.

   Returns: This link returns the previous page of the search result for a search that returns a number of records that spans multiple pages. This field will be blank
            if the first page of the search results is currently being shown or the results do not span more than one page. This links is sent to HotRiot for processing
            using the 'HotRiot.postLink' function.

   Error Code: Sets 'lastHotRiotProcessingErrorCode=5' if there was an error retreiving the result.
   See Also: <HotRiot.getSearchPageLinks, HotRiot.postLink, HotRiot.getFirstPageSearchLink, HotRiot.getNextPageSearchLink, HotRiot.getReturnSearchLink>
*/
HotRiot.getPreviousPageSearchLink = function(jsonResponse)
{
    return HotRiot.getGeneralInfo(jsonResponse, 'previousPageLinkURL');
}

/*
   Function: HotRiot.getReturnSearchLink - This link re-posts the original search request, returning the first page of the search results.

   Parameters:
      jsonResponse - This is the json response object that is passed to the ajax success callback (requestSuccessProcessing). See 'HotRiot.bindForm'
                     and 'HotRiot.postLink' for more details.

   Returns: This link re-posts the original search request, returning the first page of the search results. This links is sent to HotRiot for processing
            using the 'HotRiot.postLink' function.

   Error Code: Sets 'lastHotRiotProcessingErrorCode=5' if there was an error retreiving the result.
   See Also: <HotRiot.getSearchPageLinks, HotRiot.postLink, HotRiot.getFirstPageSearchLink, HotRiot.getNextPageSearchLink, HotRiot.getPreviousPageSearchLink>
*/
HotRiot.getReturnSearchLink = function(jsonResponse)
{
    return HotRiot.getGeneralInfo(jsonResponse, 'returnToSearchLink');
}

/*
   Function: HotRiot.getCallbackData - Retreive the user data that was sent along with the original HotRiot processing request.

   Parameters:
      jsonResponse - This is the json response object that is passed to the ajax success callback (requestSuccessProcessing). See 'HotRiot.bindForm'
                     and 'HotRiot.postLink' for more details.

   Returns: When posting a request that returns a json response, you can include in the request data that is returned back in the response. This data can
            be anything you choose. You pass along this user data in a field (normally a hidden field) named hsp-userdata. When HotRiot constructs the json
            response, it will pass the data back in this field of the response object.

   Error Code: Sets 'lastHotRiotProcessingErrorCode=5' if there was an error retreiving the result.
   See Also: <>
*/
HotRiot.getCallbackData = function(jsonResponse)
{
    return HotRiot.getGeneralInfo(jsonResponse, 'userData');
}

/*
   Function: HotRiot.isUpdate - This function retrieves record update flag.

   Parameters:
      jsonResponse - This is the json response object that is passed to the ajax success callback (requestSuccessProcessing). See 'HotRiot.bindForm'
                     and 'HotRiot.postLink' for more details.

   Returns: This field will be blank when the 'action' is search. Otherwise, it will be either ‘true’ or ‘false’.

            • true – this post updates an existing record.
            • false – this post creates a new record.

   Error Code: Sets 'lastHotRiotProcessingErrorCode=5' if there was an error retreiving the result.
   See Also: <HotRiot.getAction>
*/
HotRiot.isUpdate = function(jsonResponse)
{
    return HotRiot.getGeneralInfo(jsonResponse, 'isUpdate');
}

/*
   Function: HotRiot.getDatePosted - This function retrieves the date and time that the record was created.

   Parameters:
      jsonResponse - This is the json response object that is passed to the ajax success callback (requestSuccessProcessing). See 'HotRiot.bindForm'
                     and 'HotRiot.postLink' for more details.

   Returns: This field will be blank when the 'action' is search. Otherwise, this field is the date and time that the record was created.
            The format is as follows: YYYY-MM-DD  HH:MM:SS  This timestamp is saved with the record in HotRiot. The time is in GMT.

   Error Code: Sets 'lastHotRiotProcessingErrorCode=5' if there was an error retreiving the result.
   See Also: <HotRiot.getAction>
*/
HotRiot.getDatePosted = function(jsonResponse)
{
    return HotRiot.getGeneralInfo(jsonResponse, 'datePosted');
}

/*
   Function: HotRiot.getRequestProcessingTime - This function retrieves the date and time that the request was processed.

   Parameters:
      jsonResponse - This is the json response object that is passed to the ajax success callback (requestSuccessProcessing). See 'HotRiot.bindForm'
                     and 'HotRiot.postLink' for more details.

   Returns: The date and time that the request was processed. The date is in U.S format and the time is formatted as 24 hour GMT. For example,
            the format is as follows: mm/dd/yyyy HH:MM:SS

   Error Code: Sets 'lastHotRiotProcessingErrorCode=5' if there was an error retreiving the result.
   See Also: <>
*/
HotRiot.getRequestProcessingTime = function(jsonResponse)
{
    return HotRiot.getGeneralInfo(jsonResponse, 'timeStamp');
}

/*
   Function: HotRiot.getRecordLink - This function returns the get record data link for the record recordNumber. This function does not perform validation on the record number.
                                You can use the HotRiot. = functionisValidRecordNumber to validate the record number.

   Parameters:
      recordNumber: The record number for which you would like to retreive the record link information. Record numbers start from 1.

      jsonResponse - This is the json response object that is passed to the ajax success callback (requestSuccessProcessing). See 'HotRiot.bindForm'
                     and 'HotRiot.postLink' for more details.

   Returns: The get record link for the record recordNumber.  This link returns the record data for the record 'recordNumber'. The data is returned as json.
            Records pulled in by an associated table select trigger are also included in the json response. This links is sent to HotRiot for processing
            using the 'HotRiot.postLink' function. s

   Error Code: No error code is set by this function.
   See Also: <HotRiot.postLink, HotRiot.getRecordLinkInfo, HotRiot.getDeleteRecordLink, HotRiot.getEditRecordPswd>
*/
HotRiot.getRecordLink = function(recordNumber, jsonResponse)
{
    return jsonResponse.recordData['record_' + recordNumber].recordLink;
}

/*
   Function: HotRiot.getDeleteRecordLink - This function returns the delete record link for the record recordNumber. This function does not perform validation on the record number.
                                           You can use the HotRiot. = functionisValidRecordNumber to validate the record number.

   Parameters:
      recordNumber: The record number for which you would like to retreive the delete record link information. Record numbers start from 1.

      jsonResponse - This is the json response object that is passed to the ajax success callback (requestSuccessProcessing). See 'HotRiot.bindForm'
                     and 'HotRiot.postLink' for more details.

   Returns: The delete record link for the record 'recordNumber'. This link deletes the record referenced by the link (recordNumber), including records referenced
            by any associated delete triggers. The original search resulss, minus the deleted record, is returned after the record is deleted. This links is sent
            to HotRiot for processing using the 'HotRiot.postLink' function.

   Error Code: No error code is set by this function.
   See Also: <HotRiot.postLink, HotRiot.getRecordLinkInfo, HotRiot.getDeleteRecordLink, HotRiot.getEditRecordPswd, HotRiot.isValidRecordNumber>
*/
HotRiot.getDeleteRecordLink = function(recordNumber, jsonResponse)
{
    return jsonResponse.recordData['record_' + recordNumber].deleteRecordLink;
}

/*
   Function: HotRiot.getEditRecordPswd - The is the edit record password for the record 'recordNumber'. This function does not perform validation on the record number.
                                         You can use the HotRiot. = functionisValidRecordNumber to validate the record number.

   Parameters:
      recordNumber: The record number for which you would like to retreive the edit record password. Record numbers start from 1.

      jsonResponse - This is the json response object that is passed to the ajax success callback (requestSuccessProcessing). See 'HotRiot.bindForm'
                     and 'HotRiot.postLink' for more details.

   Returns: The is the edit record password for the record 'recordNumber'.

   Error Code: No error code is set by this function.
   See Also: <HotRiot.postLink, HotRiot.getRecordLinkInfo, HotRiot.getRecordLink, HotRiot.getDeleteRecordLink, HotRiot.isValidRecordNumber>
*/
HotRiot.getEditRecordPswd = function(recordNumber, jsonResponse)
{
    return jsonResponse.recordData['record_' + recordNumber].editRecordPswd;
}

HotRiot.getRecID = function(recordNumber, jsonResponse)
{
    return jsonResponse.recordData['record_' + recordNumber].recordID;
}

/*
   Function: HotRiot.getDatabaseName - This function retrieves the name of the database acted on by the last HotRiot processing request.

   Parameters:
      jsonResponse - This is the json response object that is passed to the ajax success callback (requestSuccessProcessing). See 'HotRiot.bindForm'
                     and 'HotRiot.postLink' for more details.

   Returns: The interpretation of the returned database name is dependent on the 'action' (see HotRiot.getAction).
            • When the "action" is "Insert", this is the name of the primary database being written to by the insert. We say "primary" because there
              may be other databases that are also updated if the primary database has an associated insert trigger.
            • When the "action" is "Search", this is the name of the primary database being searched by the search. We say primary because there may
              be other databases that are also part of the search if the search includes joins (see the join field below).
            • When the "action" is "recordDetails", this is the name of the database where the record data was retrieved from.
            • When the "action" is "getUserData", this is the name of the logged-in users registration database.

   Error Code: Sets 'lastHotRiotProcessingErrorCode=5' if there was an error retrieving the result.
   See Also: <HotRiot.getAction, HotRiot.getFieldNames>
*/
HotRiot.getDatabaseName = function(jsonResponse)
{
    return HotRiot.getGeneralInfo(jsonResponse, 'databaseName');
}

/*
   Function: HotRiot.getFieldNames - This function retrieves the names of the fields in the database 'databaseName' (see HotRiot.getDatabaseName).

   Parameters:
      jsonResponse - This is the json response object that is passed to the ajax success callback (requestSuccessProcessing). See 'HotRiot.bindForm'
                     and 'HotRiot.postLink' for more details.

   Returns: An array that contains the names of the fields in the database 'databaseName' (see HotRiot.getDatabaseName).

   Error Code: Sets 'lastHotRiotProcessingErrorCode=5' if there was an error retreiving the result.
   See Also: <HotRiot.getAction, HotRiot.getDatabaseName>
*/
HotRiot.getFieldNames = function(jsonResponse)
{
    return HotRiot.getGeneralInfo(jsonResponse, 'databaseFieldNames');
}

/*
   Function: HotRiot.getRecord - This function retrieves the record information for the record number 'recordNumber' from the database 'databaseName' (see HotRiot.getDatabaseName).

   Parameters:
      recordNumber: The record number from which you would like to retrieve the record information. Record numbers start from 1.

      jsonResponse - This is the json response object that is passed to the ajax success callback (requestSuccessProcessing). See 'HotRiot.bindForm'
                     and 'HotRiot.postLink' for more details.

   Returns: An object that contains the record information. Below is an example of the Javascript that might be used to access the record information
            for the first record in the json response:

                var databaseRecordInfo = HotRiot.getRecord(jsonResponse, 1); // Get the record information for the first record.
                var carModel = databaseRecordInfo.model;  // Get the field information for the 'model' field.
                alert( "Car Model: " + carModel.value  + "  Data Type: " + carModel.dataType); // Display the model of the car and the data type for this field.

            See HotRiot.getDatabaseFieldInfo for the complet list of field data in the object returned by this function.

   Error Code: Sets 'lastHotRiotProcessingErrorCode=2' if there was an error accessing the database name or the database field names.
   See Also: <HotRiot.getDatabaseFieldInfo, HotRiot.getDatabaseName>
*/
HotRiot.getRecord = function(jsonResponse, recordNumber)
{
    var recordInfo = null;

    if( recordNumber == null || recordNumber == undefined|| recordNumber == ''  )
        recordNumber = 1;

    if( HotRiot.isValidRecordNumber(recordNumber, jsonResponse) == true )
    {
        var databaseName = HotRiot.getDatabaseName(jsonResponse);
        var databaseFieldNames = HotRiot.getFieldNames(jsonResponse);

        if( databaseName != '' && databaseFieldNames != '' )
        {
            recordInfo = new Object();

            for( var i=0; i<databaseFieldNames.length; i++ )
                recordInfo[databaseFieldNames[i]] = HotRiot.getDatabaseFieldInfo(recordNumber, databaseFieldNames[i], databaseName, jsonResponse)
        }
        else
            HotRiot.setLastProcessingError(HotRiot.LOCATING_DBN_DBFN);
    }

    return recordInfo;
}

/*
   Function: HotRiot.getJoinDatabaseNames - This function retrieves the names of the databases that were joined with the last search request.

   Parameters:
      jsonResponse - This is the json response object that is passed to the ajax success callback (requestSuccessProcessing). See 'HotRiot.bindForm'
                     and 'HotRiot.postLink' for more details.

   Returns: If the "action" (see HotRiot.getAction) is "Search", the return wil be an array containing the names of all the databases that were included
            in the search as a join. This field will be blank if the action is anything other than search or the search did not include any joins.

   Error Code: Sets 'lastHotRiotProcessingErrorCode=5' if there was an error retreiving the result.
   See Also: <HotRiot.getAction>
*/
HotRiot.getJoinDatabaseNames = function(jsonResponse)
{
    return HotRiot.getGeneralInfo(jsonResponse, 'join');
}

/*
   Function: HotRiot.getJoinFieldNames - This function retrieves the names of the fields in the joined database 'joinDatabaseName' (see HotRiot.getJoinDatabaseNames).

   Parameters:
      joinDatabaseName - The name of the joined database from which you would like to retrieve the field names.

      jsonResponse - This is the json response object that is passed to the ajax success callback (requestSuccessProcessing). See 'HotRiot.bindForm'
                     and 'HotRiot.postLink' for more details.

   Returns: An array that contains the names of the fields in the joined database 'joinDatabaseName' (see HotRiot.getJoinDatabaseNames).

   Error Code: Sets 'lastHotRiotProcessingErrorCode=5' if there was an error retreiving the result.
   See Also: <HotRiot.getAction, HotRiot.getJoinDatabaseNames>
*/
HotRiot.getJoinFieldNames = function(joinDatabaseName, jsonResponse)
{
    HotRiot.clearLastProcessingErrorCode();
    var joinDatabaseNames = HotRiot.getJoinDatabaseNames(jsonResponse);

    if( joinDatabaseNames != '' )
        for( var i=0; i<joinDatabaseNames.length; i++ )
            if( joinDatabaseNames[i] == joinDatabaseName )
                return jsonResponse.generalInformation.joinFieldNames[i];

    return new Array();
}

/*
   Function: HotRiot.getJoinRecord - This function retrieves the record information for the record number 'recordNumber' from the joined database
             'joinDatabaseName' (see HotRiot.getJoinDatabaseNames).

   Parameters:
      recordNumber: The record number from which you would like to retreive the record information. Record numbers start from 1.

      joinDatabaseName - The name of the joined database from which you would like to retrieve the record information.

      jsonResponse - This is the json response object that is passed to the ajax success callback (requestSuccessProcessing). See 'HotRiot.bindForm'
                     and 'HotRiot.postLink' for more details.

   Returns: An object that contains the record information. Below is an example of the Javascript that might be used to access the record information
            for the first record in the json response:

                var joinDBNames = HotRiot.getJoinDatabaseNames(responseText);  // Get all of the joined database names.
                alert( 'joinDatabaseNamesCount: ' + joinDBNames.length ); // display the count of joined database names.

                var joinDatabaseRecordInfo = HotRiot.getJoinRecord(1, joinDBNames[0], responseText); // Get the record information for the first joined database
                                                                                                         // (joinDBNames[0]) from the first returned record.
                var joinFieldInfo = joinDatabaseRecordInfo.city; // Get the field data for the 'city' field.
                alert( 'The city: ' + joinFieldInfo.value );  // Display the city.

            See HotRiot.getDatabaseFieldInfo for the complet list of field data in the object returned by this function.

   Error Code: Sets 'lastHotRiotProcessingErrorCode=3' if there was an error accessing the database field names.
   See Also: <HotRiot.getDatabaseFieldInfo, HotRiot.getJoinDatabaseNames, HotRiot.getJoinFieldNames>
*/
HotRiot.getJoinRecord = function(recordNumber, joinDatabaseName, jsonResponse)
{
    HotRiot.clearLastProcessingErrorCode();
    var recordInfo = null;

    if( HotRiot.isValidRecordNumber(recordNumber, jsonResponse) == true )
    {
        var joinDatabaseFieldNames = HotRiot.getJoinFieldNames(joinDatabaseName, jsonResponse);
        if( joinDatabaseFieldNames.length > 0 )
        {
            recordInfo = new Object();

            for( var i=0; i<joinDatabaseFieldNames.length; i++ )
                recordInfo[joinDatabaseFieldNames[i]] = HotRiot.getDatabaseFieldInfo(recordNumber, joinDatabaseFieldNames[i], joinDatabaseName, jsonResponse)
        }
        else
        {
            HotRiot.setLastProcessingError( HotRiot.appendToErrorMessage( HotRiot.LOCATING_FN_JDB, joinDatabaseName + '.' ) );
        }
    }

    return recordInfo;
}

/*
   Function: HotRiot.getTriggerDatabaseNames - This function retrieves the names of the trigger databases.

   Parameters:
      jsonResponse - This is the json response object that is passed to the ajax success callback (requestSuccessProcessing). See 'HotRiot.bindForm'
                     and 'HotRiot.postLink' for more details.

   Returns: If the "action" (see HotRiot.getAction) is recordDetails, the return wil be an array containing the names of all the record select
            trigger databases associated with the database returned by the HotRiot.getDatabaseName function. This field will be blank
            if the action is anything other than recordDetails or there is no record select trigger associated with the the database returned
            by HotRiot.getDatabaseName.

   Error Code: Sets 'lastHotRiotProcessingErrorCode=5' if there was an error retreiving the result.
   See Also: <HotRiot.getAction, HotRiot.getDatabaseName>
*/
HotRiot.getTriggerDatabaseNames = function(jsonResponse)
{
    return HotRiot.getGeneralInfo(jsonResponse, 'trigger');
}

/*
   Function: HotRiot.getTriggerFieldNames - This function retrieves the names of the fields in the trigger database 'triggerDatabaseName' (see HotRiot.getTriggerDatabaseNames).

   Parameters:
      triggerDatabaseName - The name of the trigger database from which you would like to retrieve the field names.

      jsonResponse - This is the json response object that is passed to the ajax success callback (requestSuccessProcessing). See 'HotRiot.bindForm'
                     and 'HotRiot.postLink' for more details.

   Returns: An array that contains the names of the fields in the trigger database 'triggerDatabaseName' (see HotRiot.getTriggerDatabaseNames).

   Error Code: Sets 'lastHotRiotProcessingErrorCode=5' if there was an error retreiving the result.
   See Also: <HotRiot.getAction, HotRiot.getTriggerDatabaseNames>
*/
HotRiot.getTriggerFieldNames = function(triggerDatabaseName, jsonResponse)
{
    HotRiot.clearLastProcessingErrorCode();
    var triggerDatabaseNames = HotRiot.getTriggerDatabaseNames(jsonResponse);

    if( triggerDatabaseNames != '' )
        for( var i=0; i<triggerDatabaseNames.length; i++ )
            if( triggerDatabaseNames[i] == triggerDatabaseName )
                return jsonResponse.generalInformation.triggerFieldNames[i];

    return new Array();
}

/*
   Function: HotRiot.getTriggerRecordInfo - This function retrieves the record information for the record number 'recordNumber' from the trigger database
             'triggerDatabaseName' (see HotRiot.getTriggerFieldNames).

   Parameters:
      recordNumber: The record number from which you would like to retreive the record information. Record numbers start from 1.

      joinDatabaseName - The name of the trigger database from which you would like to retrieve the record information.

      jsonResponse - This is the json response object that is passed to the ajax success callback (requestSuccessProcessing). See 'HotRiot.bindForm'
                     and 'HotRiot.postLink' for more details.

   Returns: An object that contains the record information. Below is an example of the Javascript that might be used to access the record information
            for the first record in the json response:

                var triggerDBNames = HotRiot.getTriggerDatabaseNames(responseText);  // Get all of the trigger database names.
                alert( 'Trigger database names count: ' + triggerDBNames.length ); // display the count of trigger database names.

                var triggerDatabaseRecordInfo = HotRiot.getTriggerRecordInfo(1, triggerDBNames[0], responseText); // Get the record information for the first trigger database
                                                                                                                  // (triggerDBNames[0]) from the first returned record.
                var triggerFieldInfo = triggerDatabaseRecordInfo.firstName; // Get the field data for the 'firstName' field.
                alert( 'First name: ' + triggerFieldInfo.value );  // Display the first name.

            See HotRiot.getDatabaseFieldInfo for the complet list of field data in the object returned by this function.

   Error Code: Sets 'lastHotRiotProcessingErrorCode=4' if there was an error accessing the database field names.
   See Also: <HotRiot.getDatabaseFieldInfo, HotRiot.getTriggerDatabaseNames, HotRiot.getDatabaseName>
*/
HotRiot.getTriggerRecordInfo = function(recordNumber, triggerDatabaseName, jsonResponse)
{
    HotRiot.clearLastProcessingErrorCode();
    var recordInfo = null;
    if( HotRiot.isValidRecordNumber(recordNumber, jsonResponse) == true )
    {
        var triggerDatabaseFieldNames = HotRiot.getTriggerFieldNames(triggerDatabaseName, jsonResponse);
        if( triggerDatabaseFieldNames.length > 0 )
        {
            recordInfo = new Object();

            for( i=0; i<triggerDatabaseFieldNames.length; i++ )
                recordInfo[triggerDatabaseFieldNames[i]] = HotRiot.getDatabaseFieldInfo(recordNumber, triggerDatabaseFieldNames[i], triggerDatabaseName, jsonResponse)
        }
        else
            HotRiot.setLastProcessingError( HotRiot.appendToErrorMessage( HotRiot.LOCATING_FN_TDB, triggerDatabaseName + '.' ) );
    }

    return recordInfo;
}

/*
   Function: HotRiot.getNextPage

   This function retrieves the next page of the search results for searches that span multiple pages. That is, for searches that locate more
   records than can fit on a single page.

   Parameters:
      jsonResponse - This is the json response object that is passed to the ajax success callback (requestSuccessProcessing). See 'HotRiot.bindForm'
                     and 'HotRiot.postLink' for more details.

      requestSuccessProcessing - The callback function that is called if the request succeeds. The function gets passed three arguments: The data returned
                                 from the server, formatted as json; a string describing the status; and the jqXHR. The the first argument to this
                                 callback (responseText) is the json data object returned by the server.

                                 function requestSuccessProcessing(responseText, statusText, jqXHR);

      requestErrorProcessing - The callback function that is called if the request fails. The function receives three arguments: The jqXHR object, a string describing
                               the type of error that occurred and an optional exception object, if one occurred. Possible values for the second argument (besides null)
                               are "timeout", "error", "abort", and "parsererror". When an HTTP error occurs, errorThrown receives the textual portion of the HTTP
                               status, such as "Not Found" or "Internal Server Error."

                              function requestErrorProcessing(jqXHR, textStatus, errorThrown);

   Returns: 'false' if there are no more pages, this jsonResponse is the last page of the results, otherwise 'true' is returned.
   Error Code: Sets 'lastHotRiotProcessingErrorCode=5' if there was an error retrieving the result.
               Sets 'lastHotRiotProcessingErrorCode=7' if there was an error with the query string.
   See Also:
*/
HotRiot.getNextPage = function( jsonResponse, successProcessing, errorProcessing )
{
    HotRiot.clearLastProcessingErrorCode();
    var nextPage = HotRiot.getNextPageSearchLink(jsonResponse);
    if( nextPage != null && nextPage != '' )
    {
        HotRiot.postLink( nextPage, successProcessing, errorProcessing );
        return true;
    }

    return false;
}

/*
   Function: HotRiot.getPreviousPage

   This function retrieves the previous page of the search results for searches that span multiple pages. That is, for searches that locate more
   records than can fit on a single page.

   Parameters:
      jsonResponse - This is the json response object that is passed to the ajax success callback (requestSuccessProcessing). See 'HotRiot.bindForm'
                     and 'HotRiot.postLink' for more details.

      requestSuccessProcessing - The callback function that is called if the request succeeds. The function gets passed three arguments: The data returned
                                 from the server, formatted as json; a string describing the status; and the jqXHR. The the first argument to this
                                 callback (responseText) is the json data object returned by the server.

                                 function requestSuccessProcessing(responseText, statusText, jqXHR);

      requestErrorProcessing - The callback function that is called if the request fails. The function receives three arguments: The jqXHR object, a string describing
                               the type of error that occurred and an optional exception object, if one occurred. Possible values for the second argument (besides null)
                               are "timeout", "error", "abort", and "parsererror". When an HTTP error occurs, errorThrown receives the textual portion of the HTTP
                               status, such as "Not Found" or "Internal Server Error."

                              function requestErrorProcessing(jqXHR, textStatus, errorThrown);

   Returns: 'false' if there is no previous page, this jsonResponse is the first page of the results, otherwise 'true' is returned.
   Error Code: Sets 'lastHotRiotProcessingErrorCode=5' if there was an error retreiving the result.
               Sets 'lastHotRiotProcessingErrorCode=7' if there was an error with the query string.
See Also:
*/
HotRiot.getPreviousPage = function( jsonResponse, successProcessing, errorProcessing )
{
    HotRiot.clearLastProcessingErrorCode();
    var previousPage = HotRiot.getPreviousPageSearchLink(jsonResponse);
    if( previousPage != null && previousPage != '' )
    {
        HotRiot.postLink( previousPage, successProcessing, errorProcessing );
        return true;
    }

    return false;
}

/*
   Function: HotRiot.getFirstPage

   This function retrieves the first page of the search results for searches that span multiple pages. That is, for searches that locate more
   records than can fit on a single page.

   Parameters:
      jsonResponse - This is the json response object that is passed to the ajax success callback (requestSuccessProcessing). See 'HotRiot.bindForm'
                     and 'HotRiot.postLink' for more details.

      requestSuccessProcessing - The callback function that is called if the request succeeds. The function gets passed three arguments: The data returned
                                 from the server, formatted as json; a string describing the status; and the jqXHR. The the first argument to this
                                 callback (responseText) is the json data object returned by the server.

                                 function requestSuccessProcessing(responseText, statusText, jqXHR);

      requestErrorProcessing - The callback function that is called if the request fails. The function receives three arguments: The jqXHR object, a string describing
                               the type of error that occurred and an optional exception object, if one occurred. Possible values for the second argument (besides null)
                               are "timeout", "error", "abort", and "parsererror". When an HTTP error occurs, errorThrown receives the textual portion of the HTTP
                               status, such as "Not Found" or "Internal Server Error."

                              function requestErrorProcessing(jqXHR, textStatus, errorThrown);

   Returns: 'false' if this jsonResponse is the first page of the results, otherwise 'true' is returned.
   Error Code: Sets 'lastHotRiotProcessingErrorCode=5' if there was an error retreiving the result.
               Sets 'lastHotRiotProcessingErrorCode=7' if there was an error with the query string.
   See Also:
*/
HotRiot.getFirstPage = function( jsonResponse, successProcessing, errorProcessing )
{
    HotRiot.clearLastProcessingErrorCode();
    var firstPage = HotRiot.getFirstPageSearchLink(jsonResponse);
    if( firstPage != null && firstPage != '' )
    {
        HotRiot.postLink( firstPage, successProcessing, errorProcessing );
        return true;
    }

    return false;
}

/*
   Function: HotRiot.repostSearch

   This function re-posts the original search.

   Parameters:
      returnSearchLink - This is a link which is returned by the HotRiot. = functiongetReturnSearchLink that is used by this function to get a copy of the jsonResponse
                         from which the link was retrieved.

      requestSuccessProcessing - The callback function that is called if the request succeeds. The function gets passed three arguments: The data returned
                                 from the server, formatted as json; a string describing the status; and the jqXHR. The the first argument to this
                                 callback (responseText) is the json data object returned by the server.

                                 function requestSuccessProcessing(responseText, statusText, jqXHR);

      requestErrorProcessing - The callback function that is called if the request fails. The function receives three arguments: The jqXHR object, a string describing
                               the type of error that occurred and an optional exception object, if one occurred. Possible values for the second argument (besides null)
                               are "timeout", "error", "abort", and "parsererror". When an HTTP error occurs, errorThrown receives the textual portion of the HTTP
                               status, such as "Not Found" or "Internal Server Error."

                              function requestErrorProcessing(jqXHR, textStatus, errorThrown);

   Returns: 'false' if returnSearcLink is null or empty, otherwise 'true' is returned.
   Error Code: Sets 'lastHotRiotProcessingErrorCode=5' if there was an error retreiving the result.
               Sets 'lastHotRiotProcessingErrorCode=7' if there was an error with the query string.
   See Also:
*/
HotRiot.getJsonResponseFromRSL = function( returnSearchLink, successProcessing, errorProcessing )
{
    HotRiot.clearLastProcessingErrorCode();
    if( returnSearchLink != null && returnSearchLink != '' )
    {
        HotRiot.postLink( returnSearchLink, successProcessing, errorProcessing );
        return true;
    }

    return false;
}

/*
   Function: HotRiot.sortSearchResults

   This function sorts the search results on the 'fieldName' parameters. The first time this function is called for a particular field, the
   data is sorted in ascending order. If this function is called again for the same field (with no other calls to it in between), the data
   is sorted in descending order. This function actually reprocesses the search. The record data is returned to the success callback.

   Parameters:
      fieldName: This is the field in the database that you would like the search sorted on.

      jsonResponse - This is the json response object that is passed to the ajax success callback (requestSuccessProcessing). See 'HotRiot.bindForm'
                     and 'HotRiot.postLink' for more details.

      requestSuccessProcessing - The callback function that is called if the request succeeds. The function gets passed three arguments: The data returned
                                 from the server, formatted as json; a string describing the status; and the jqXHR. The the first argument to this
                                 callback (responseText) is the json data object returned by the server.

                                 function requestSuccessProcessing(responseText, statusText, jqXHR);

      requestErrorProcessing - The callback function that is called if the request fails. The function receives three arguments: The jqXHR object, a string describing
                               the type of error that occurred and an optional exception object, if one occurred. Possible values for the second argument (besides null)
                               are "timeout", "error", "abort", and "parsererror". When an HTTP error occurs, errorThrown receives the textual portion of the HTTP
                               status, such as "Not Found" or "Internal Server Error."

                              function requestErrorProcessing(jqXHR, textStatus, errorThrown);

   Returns: 'false' if the sort request could not be posted, otherwise 'true' is returned, meaning the sort (search) was posted.
   Error Code: Sets 'lastHotRiotProcessingErrorCode=5' if there was an error retrieving the result.
               Sets 'lastHotRiotProcessingErrorCode=7' if there was an error with the query string.
   See Also:
*/
HotRiot.sortSearchResults = function( fieldName, jsonResponse, successProcessing, errorProcessing )
{
    HotRiot.clearLastProcessingErrorCode();
    return HotRiot.sortSearchResultsEx( null, fieldName, jsonResponse, successProcessing, errorProcessing )
}

/*
   Function: HotRiot.sortSearchResultsEx

   This function sorts the search results based on the 'databaseName' and 'fieldName' parameters. The first time this function
   is called for a particular field, the data is sorted in ascending order. If this function is called again for the same field
   (with no other calls to it in between), the data is sorted in descending order. This function actually reprocesses the search.
   The record data is returned to the success callback.

   Parameters:
       databaseName: This is the name of the database that contains the field you wish to sort on. You can use the simpler sort function,
                     HotRiot.sortSearchResults, unless both conditions below are true.

                     1. The search that returned this jsonResponse object includes either a join or a trigger.

                     2. The field name you wish to sort on is present in more than one database included in the
                     search. For example, imagine you created a search that searches an automobile database, and this search also joins
                     with the owner registration database. Further, assume both the automobile database and owner registration database both
                     include a 'name' field. If you wish to sort on the name field, you will need to use this sort function because you will
                     need to explicitly tell HotRiot which name you want to sort on, is it the automobile name or the owner name.


      fieldName: This is the field in the database that you would like the search sorted on.

      jsonResponse - This is the json response object that is passed to the ajax success callback (requestSuccessProcessing). See 'HotRiot.bindForm'
                     and 'HotRiot.postLink' for more details.

      requestSuccessProcessing - The callback function that is called if the request succeeds. The function gets passed three arguments: The data returned
                                 from the server, formatted as json; a string describing the status; and the jqXHR. The the first argument to this
                                 callback (responseText) is the json data object returned by the server.

                                 function requestSuccessProcessing(responseText, statusText, jqXHR);

      requestErrorProcessing - The callback function that is called if the request fails. The function receives three arguments: The jqXHR object, a string describing
                               the type of error that occurred and an optional exception object, if one occurred. Possible values for the second argument (besides null)
                               are "timeout", "error", "abort", and "parsererror". When an HTTP error occurs, errorThrown receives the textual portion of the HTTP
                               status, such as "Not Found" or "Internal Server Error."

                              function requestErrorProcessing(jqXHR, textStatus, errorThrown);

   Returns: 'false' if the sort request could not be posted, otherwise 'true' is returned, meaning the sort (search) was posted.
   Error Code: Sets 'lastHotRiotProcessingErrorCode=5' if there was an error retrieving the result.
               Sets 'lastHotRiotProcessingErrorCode=7' if there was an error with the query string.
   See Also:
*/
HotRiot.sortSearchResultsEx = function( databaseName, fieldName, jsonResponse, successProcessing, errorProcessing )
{
    HotRiot.clearLastProcessingErrorCode();
    var recordInfo;

    if( databaseName == null )
    {
        databaseName = HotRiot.getDatabaseName( jsonResponse );
        recordInfo = HotRiot.getDatabaseFieldInfo(1, fieldName, databaseName, jsonResponse);

        if( recordInfo == null )
        {
            var joinDatabaseNames = HotRiot.getJoinDatabaseNames( jsonResponse );
            if( joinDatabaseNames != '' && joinDatabaseNames.length > 0 )
                for( var i=0; i<joinDatabaseNames.length; i++ )
                {
                    recordInfo = HotRiot.getDatabaseFieldInfo(1, fieldName, joinDatabaseNames[i], jsonResponse);
                    if( recordInfo != null )
                        break;
                }
        }

        if( recordInfo == null )
        {
            var triggerDatabaseNames = HotRiot.getTriggerDatabaseNames( jsonResponse );
            if( triggerDatabaseNames != '' && triggerDatabaseNames.length > 0 )
                for( var x=0; x<triggerDatabaseNames.length; x++ )
                {
                    recordInfo = HotRiot.getDatabaseFieldInfo(1, fieldName, triggerDatabaseNames[x], jsonResponse);
                    if( recordInfo != null )
                        break;
                }
            }

        if( recordInfo != null )
        {
            HotRiot.postLink( recordInfo.sortLink, successProcessing, errorProcessing );
            return true;
        }
    }
    else
    {
        recordInfo = HotRiot.getDatabaseFieldInfo(1, fieldName, databaseName, jsonResponse);
        if( recordInfo != null )
        {
            HotRiot.postLink( recordInfo.sortLink, successProcessing, errorProcessing );
            return true;
        }
    }

    return false;
}

/*
   Function: HotRiot.getGeneralInfo - This function retrieves the data named by the 'dataBit' parameter from the 'jsonResponse' object and returns it to the caller.
                                      This function can be used to retrieve any data item in the jsonResponse object.

   Parameters:
      jsonResponse - This is the json response object that is passed to the ajax success callback (requestSuccessProcessing). See 'HotRiot.bindForm'
                     and 'HotRiot.postLink' for more details.

   Returns: This function returns the data named in the 'dataBit' parameter which was retrieved from the 'jsonResponse' object.

   Error Code: Sets 'lastHotRiotProcessingErrorCode=5' if there was an error retreiving data.
   See Also: <>
*/
HotRiot.getGeneralInfo = function(jsonResponse, dataBit)
{
    HotRiot.clearLastProcessingErrorCode();
    var generalInfoDataBit;

    try
    {
        generalInfoDataBit = jsonResponse.generalInformation[dataBit];
        if( generalInfoDataBit == null )
            generalInfoDataBit = '';
    }
    catch(error)
    {
        generalInfoDataBit = '';
    }

    return generalInfoDataBit;
}

/*
   Function: HotRiot.isValidRecordNumber - This function determines if the passed in record number is valid, in range.

   Parameters:
      recordNumber - The record number you would like checked
      jsonResponse - This is the json response object that is passed to the ajax success callback (requestSuccessProcessing). See 'HotRiot.bindForm'
                     and 'HotRiot.postLink' for more details.

   Returns: 'true' if the number is valid and 'false' if it is not.

   Error Code: Sets 'lastHotRiotProcessingErrorCode=6' if the record number is invalid.
   See Also: <>
*/
HotRiot.isValidRecordNumber = function(recordNumber, jsonResponse)
{
    HotRiot.clearLastProcessingErrorCode();
    if( recordNumber > 0 && recordNumber <= HotRiot.getRecordCountForThisPage(jsonResponse) )
        return true;
    else
    {
        HotRiot.setLastProcessingError( HotRiot.INVALID_RECORD_NUMBER )
        return false;
    }
}

/*
   Function: HotRiot.isImage - This function determines if the filename represents a jpeg image.

   Parameters:
      fileName - The file name you would like checked.

   Returns: 'true' if the filename represents an image file, otherwise 'false'. The determination is made simply based on the file extension.
            Checking if a field in a database is an image is a two step process. First, you must determine if the field is a file field. You
            do this by checking that the recordInfo.dataType = "File". If this is true, you then call this function to see if the file is a
            jpeg image. See the HotRiot. = functiongetDatabaseFieldInfo for an example of this.

   Error Code: 
   See Also: <HotRiot.getDatabaseFieldInfo>
*/
HotRiot.isImage = function( filename )
{
    HotRiot.clearLastProcessingErrorCode();
    var parts = filename.split('.');
    if( parts.length > 1 )
    {
        var extension = parts[parts.length-1];
        if( extension == 'jpg' || extension == 'jpeg' )
            return true;
    }

    return false;
}

// This function returns the last processing error code and then clears the error code. This
// function should be called after making a call to any function that may set the error code.
HotRiot.getLastProcessingErrorCode = function()
{
    return HotRiot.lastHotRiotProcessingErrorCode;
}

// This function returns the last processing error message. Don't call this function unless the
// error code returned from HotRiot.getLastProcessingErrorCode is something other than zero.
HotRiot.getLastProcessingErrorMessage = function()
{
    return HotRiot.lastHotRiotProcessingError;
}

// This function clears out the last processing error code. You should call this function or
// HotRiot.getLastProcessingErrorCode before making a call to any fuction that sets the error code.
HotRiot.clearLastProcessingErrorCode = function()
{
    HotRiot.lastHotRiotProcessingErrorCode = 0;
    HotRiot.lastHotRiotProcessingError = '';
}

/*
   Function: HotRiot.getFormID - This function is intended to be called from the preProcessing() function and returns the ID of the passed in form data ovject.

   Parameters:
      formData - This is the array of objects representing the form data.

   Returns: This method returns the ID of the form, which is the same as the name of the database that the form is bound to. If no ID could be found, the function returns null.

   Error Code:
   See Also: <HotRiot.getFormDataValue, HotRiot.getAllFormFieldNames>
*/
HotRiot.getFormID = function( formData )
{
    return HotRiot.getFormDataValue( formData, 'hsp-formname' );
}

/*
   Function: HotRiot.getFormDataValue - This function is intended to be called from the preProcessing() function and returns the ID of the passed in form data ovject.

   Parameters:
      formData - This is the array of objects representing the form data.

      dataBit - This is the name of the field in the form for which you would lik to query.

   Returns: This method returns the value of a particular field in the form, or null if the field is not present. Replace dataBit with the name of the field
            you would like to query.

   Error Code:
   See Also: <HotRiot.getFormID, HotRiot.getAllFormFieldNames>
*/
HotRiot.getFormDataValue = function( formData, dataBit )
{
    HotRiot.clearLastProcessingErrorCode();
    for( var i=0; i<formData.length; i++ )
        if( formData[i].name == dataBit )
            return formData[i].value;

    return null;
}

/*
   Function: HotRiot.getAllFormFieldNames - This function is intended to be called from the preProcessing() function and returns, as an array,
                                       all of the form field names present in the formData object.

   Parameters:
      formData - This is the array of objects representing the form data.

   Returns: This method returns, as an array, all of the form field names present in the formData object.

   Error Code:
   See Also: <HotRiot.getFormID, HotRiot.getFormDataValue>
*/
HotRiot.getAllFormFieldNames = function( formData )
{
    HotRiot.clearLastProcessingErrorCode();
    var fd = new Array();
    
    for( var i=0; i<formData.length; i++ )
        fd[i] = formData[i].name;

    return fd;
}

// Internal function used by this library.
HotRiot.setLastProcessingError = function(errorObject)
{
    lastHotRiotProcessingErrorCode = errorObject[0];
    lastHotRiotProcessingError = errorObject[1];
}

// Internal function used by this library.
HotRiot.beforeSerializeProcessing = function(jqForm, options)
{
    var formObj = jqForm[0];

    var input = document.createElement("input");
        input.setAttribute("type", "hidden");
        input.setAttribute("name", "hsp-formname");
        input.setAttribute("value", formObj.id);

    //Append form element to the form.
    formObj.appendChild(input);
}

// Internal function used by this library.
HotRiot.beforeSerializeNotificationProcessing = function(jqForm, options)
{
    HotRiot.beforeSerializeProcessing(jqForm, options);

    var inputNote = document.createElement("input");
        inputNote.setAttribute("type", "hidden");
        inputNote.setAttribute("name", "hsp-rtninsert");
        inputNote.setAttribute("value", "1");

    //Append form element to the form.
    formObj.appendChild(inputNote);
}

HotRiot.beforeSerializeRecordUpdateProcessing = function(jqForm, options)
{
    HotRiot.beforeSerializeProcessing(jqForm, options);

    var updatePswd = document.createElement("input");
        updatePswd.setAttribute("type", "hidden");
        updatePswd.setAttribute("name", "hsp-json");
        updatePswd.setAttribute("value", options.extra[1]);
    //Append form element to the form.
    formObj.appendChild(updatePswd);

    var recID = document.createElement("input");
        recID.setAttribute("type", "hidden");
        recID.setAttribute("name", "hsp-recordID");
        recID.setAttribute("value", options.extra[2]);
    //Append form element to the form.
    formObj.appendChild(recID);

    delete options.extra;

}

// Internal function used by this library.
HotRiot.appendToErrorMessage = function( errorArrray, textToAppend )
{
    var na = new Array( errorArrray[0], errorArrray[1] + textToAppend );
    return na;
}

/*
   Function: HotRiot.getUserInfo

   This function retrieves the complete user information for the currently logged in user. This includes their subscription setting and subscription payment history.

   Parameters:
      jsonResponse - This is the json response object that is passed to the ajax success callback (requestSuccessProcessing). See 'HotRiot.bindForm'
                     and 'HotRiot.postLink' for more details.

      requestSuccessProcessing - The callback function that is called if the request succeeds. The function gets passed three arguments: The data returned
                                 from the server, formatted as json; a string describing the status; and the jqXHR. The the first argument to this
                                 callback (responseText) is the json data object returned by the server.

                                 function requestSuccessProcessing(responseText, statusText, jqXHR);

      requestErrorProcessing - The callback function that is called if the request fails. The function receives three arguments: The jqXHR object, a string describing
                               the type of error that occurred and an optional exception object, if one occurred. Possible values for the second argument (besides null)
                               are "timeout", "error", "abort", and "parsererror". When an HTTP error occurs, errorThrown receives the textual portion of the HTTP
                               status, such as "Not Found" or "Internal Server Error."

                              function requestErrorProcessing(jqXHR, textStatus, errorThrown);

   Returns: 'false' if there is no currently logged in user, otherwise returns 'true'.
   See Also:
*/
HotRiot.getUserInfo = function( jsonResponse, successProcessing, errorProcessing )
{
    HotRiot.clearLastProcessingErrorCode();
    
    var loggedInUserInfoLink = HotRiot.getLoggedInUserInfoLink(jsonResponse);
    if( loggedInUserInfoLink != '' )
    {
        HotRiot.postLink( loggedInUserInfoLink, successProcessing, errorProcessing );
        return true;
    }
    else
        return false;
}

HotRiot.deleteRecord = function( recordNumber, repost, jsonResponse, successProcessing, errorProcessing )
{
    HotRiot.clearLastProcessingErrorCode();
    if( HotRiot.isValidRecordNumber(recordNumber, jsonResponse) == true )
    {
        var deleteRecordLink = HotRiot.getDeleteRecordLink(recordNumber, jsonResponse);
        if( deleteRecordLink != null && deleteRecordLink != '' )
            return HotRiot.deleteRecordDirect( deleteRecordLink, repost, successProcessing, errorProcessing );
        else
            return false;
    }
    else
        return false;
}

HotRiot.getEditRecordPassword = function( jsonResponse, recordNumber )
{
    if( recordNumber == null || recordNumber == undefined || recordNumber == ''  )
        recordNumber = 1;

    var editRecordPswd = '';
    if( HotRiot.isValidRecordNumber(recordNumber, jsonResponse) == true )
    {
        editRecordPswd = HotRiot.getEditRecordPswd(recordNumber, jsonResponse);
        if( editRecordPswd == null )
            editRecordPswd = '';
    }

    return editRecordPswd;
}

HotRiot.getRecordID = function( jsonResponse, recordNumber )
{
    if( recordNumber == null || recordNumber == undefined || recordNumber == '' )
        recordNumber = 1;

    var recordID = '';
    if( HotRiot.isValidRecordNumber(recordNumber, jsonResponse) == true )
    {
        recordID = HotRiot.getRecID(recordNumber, jsonResponse);
        if( recordID == null )
            recordID = '';
    }
    
    return recordID;
}

HotRiot.getRegRecord = function( jsonResponse )
{
    return HotRiot.getRecord( jsonResponse, 1 );
}

HotRiot.getInsertData = function( jsonResponse )
{
    return HotRiot.getRecord( jsonResponse, 1 );
}

HotRiot.getTriggerRecord = function( triggerDatabaseName, jsonResponse)
{
    return HotRiot.getTriggerRecordInfo(1, triggerDatabaseName, jsonResponse);
}

HotRiot.isActionValid = function( jsonResponse, validAction )
{
    var action = HotRiot.getAction( jsonResponse );
    if( action == validAction )
        return true;
    else
        return false;
}

HotRiot.getSubscriptionDetails = function( jsonResponse )
{
    HotRiot.clearLastProcessingErrorCode();
    if( HotRiot.isActionValid( jsonResponse, 'userData' ) == false )
    {
        HotRiot.setLastProcessingError( HotRiot.INVALID_ACTION )
        return '';
    }

    var subscriptionDetails = new Object();

    subscriptionDetails.servicePlan = jsonResponse.subscriptionDetails['servicePlan'];
    subscriptionDetails.accountStatus = jsonResponse.subscriptionDetails['accountStatus'];

    if( subscriptionDetails.accountStatus != 'Inactive' && subscriptionDetails.accountStatus != 'Always Active' )
    {
        if( subscriptionDetails.accountStatus == 'Active for a number of days' )
            subscriptionDetails.remainingDaysActive = jsonResponse.subscriptionDetails['remainingdaysActive'];

        if( subscriptionDetails.accountStatus == 'Active while account balance is positive' )
        {
            subscriptionDetails.currentAccountBalance = jsonResponse.subscriptionDetails['currentAccountBalance'];
            subscriptionDetails.dailyRate = jsonResponse.subscriptionDetails['dailyRate'];
        }
    }

    if( subscriptionDetails.accountStatus != 'Inactive' )
    {
        subscriptionDetails.usageRestrictions = jsonResponse.subscriptionDetails['usageRestrictions'];
        if( subscriptionDetails.usageRestrictions == 'By number of records' )
            subscriptionDetails.recordStorageRestriction = jsonResponse.subscriptionDetails['recordStorageRestriction'];
    }

    return subscriptionDetails;
}

HotRiot.getRegDatabaseName = function(jsonResponse)
{
    return HotRiot.getDatabaseName(jsonResponse);
}

HotRiot.getRegFieldNames = function(jsonResponse)
{
    return HotRiot.getFieldNames(jsonResponse);
}

HotRiot.getInsertDatabaseName = function(jsonResponse)
{
    return HotRiot.getDatabaseName(jsonResponse);
}

HotRiot.getInsertFieldNames = function(jsonResponse)
{
    return HotRiot.getFieldNames(jsonResponse);
}

HotRiot.getPaymentInfo = function( paymentNumber, jsonResponse )
{
    var subscriptionPaymentInfo = new Object();

    if( HotRiot.isValidPaymentNumber(paymentNumber, jsonResponse) == true )
    {
        var finalPaymentNumber = 'payment_' + paymentNumber;

        subscriptionPaymentInfo.paymentAmount = jsonResponse.subscriptionPaymentInfo[finalPaymentNumber].paymentAmount;
        subscriptionPaymentInfo.servicePlan = jsonResponse.subscriptionPaymentInfo[finalPaymentNumber].servicePlan;
        subscriptionPaymentInfo.paymentProcessor = jsonResponse.subscriptionPaymentInfo[finalPaymentNumber].paymentProcessor;
        subscriptionPaymentInfo.transactionID = jsonResponse.subscriptionPaymentInfo[finalPaymentNumber].transactionID;
        subscriptionPaymentInfo.transactionDate = jsonResponse.subscriptionPaymentInfo[finalPaymentNumber].transactionDate;
        subscriptionPaymentInfo.currency = jsonResponse.subscriptionPaymentInfo[finalPaymentNumber].currency;
    }

    return subscriptionPaymentInfo;
}

HotRiot.isValidPaymentNumber = function(recordNumber, jsonResponse)
{
    HotRiot.clearLastProcessingErrorCode();
    if( recordNumber > 0 && recordNumber <= HotRiot.getPaymentCount(jsonResponse) )
        return true;
    else
    {
        HotRiot.setLastProcessingError( HotRiot.INVALID_RECORD_NUMBER )
        return false;
    }
}

HotRiot.getPaymentCount = function( jsonResponse )
{
    HotRiot.clearLastProcessingErrorCode();

    var paymentCount = jsonResponse.subscriptionPaymentInfo.paymentCount;
    if( paymentCount == null )
        paymentCount = 0;
    return paymentCount;
}

HotRiot.getTotalPaid = function( jsonResponse )
{
    HotRiot.clearLastProcessingErrorCode();
    
    if( HotRiot.getPaymentCount( jsonResponse ) == 0 )
        return 0;
    else
        return jsonResponse.subscriptionPaymentInfo.totalPaid;
}

HotRiot.getTotalPaid = function( jsonResponse )
{
    return HotRiot.getRecord( jsonResponse, 1 );
}

HotRiot.getLoginName = function(jsonResponse)
{
    return HotRiot.getSearchName(jsonResponse);
}

HotRiot.getNotificationDatabaseName = function(jsonResponse)
{
    return HotRiot.getDatabaseName(jsonResponse);
}

HotRiot.getNotificationFieldNames = function(jsonResponse)
{
    return HotRiot.getFieldNames(jsonResponse);
}

HotRiot.getNotificationData = function( jsonResponse )
{
    return HotRiot.getRecord( jsonResponse, 1 );
}

HotRiot.getExcelDownloadLink = function(jsonResponse)
{
    return HotRiot.getGeneralInfo(jsonResponse, 'excelDownloadLink');
}

HotRiot.getRecordDetails = function( recordNumber, jsonResponse, successProcessing, errorProcessing )
{
    HotRiot.clearLastProcessingErrorCode();
    if( HotRiot.isValidRecordNumber(recordNumber, jsonResponse) == true )
    {
        var recordLink = HotRiot.getRecordLink(recordNumber, jsonResponse);
        if( recordLink != null && recordLink != '' )
        {
            HotRiot.postLink( recordLink, successProcessing, errorProcessing );
            return true;
        }
        else
            return false;
    }
    else
        return false;
}

HotRiot.getRecordCountDatabaseName = function(jsonResponse)
{
    return HotRiot.getDatabaseName(jsonResponse);
}

HotRiot.getRecordCount = function(jsonResponse)
{
    return HotRiot.getGeneralInfo(jsonResponse, 'recordCount');
}

HotRiot.getOptionalRecordCountParameters = function(jsonResponse)
{
    HotRiot.clearLastProcessingErrorCode();
    var optionalRecordCountParameters = new Object();

    optionalRecordCountParameters.fieldName  = HotRiot.getGeneralInfo(jsonResponse, 'fieldName');
    optionalRecordCountParameters.operator   = HotRiot.getGeneralInfo(jsonResponse, 'operator');
    optionalRecordCountParameters.comparator = HotRiot.getGeneralInfo(jsonResponse, 'comparator');

    return optionalRecordCountParameters;
}

HotRiot.getSinceLastLoginFlag = function(jsonResponse)
{
    return HotRiot.getGeneralInfo(jsonResponse, 'sll');
}

HotRiot.logout = function(logoutOptions, successProcessing, errorProcessing)
{
    var logoutParameters = new String('');

    if( logoutOptions != null && logoutOptions != undefined)
    {
        var callbackData = logoutOptions['hsp-callbackdata'];
        if( callbackData != null && callbackData != undefined && callbackData != '' )
        {
            logoutParameters += '&hsp-callbackdata=';
            logoutParameters += callbackData;
        }
    }

    HotRiot.postLink( HotRiot.processURLParams.getFullyQualifiedHRDAURL() + '?hsp-logout=hsp-json' + logoutParameters, successProcessing, errorProcessing );
    return true;
}

// This function retrieves the update password assigned to the join database record for the database 'databaseName' for the record 'recordNumber'.
// Returns an empty string if the record update password is not present or if the record number is out of bounds. Sets the error code HotRiot.INVALID_RECORD_NUMBER
// if the record number is out of bounds.
HotRiot.getJoinEditRecordPassword = function(recordNumber, databaseName, jsonResponse)
{
    return HotRiot.getJoinRecordSystemFieldData(recordNumber, "hsp-editRecordPswd", databaseName, jsonResponse);
}

// This function retrieves the record ID assigned to the join database record for the database 'databaseName' for the record 'recordNumber'.
// Returns an empty string if the join record ID is not present or if the record number is out of bounds. Sets the error code HotRiot.INVALID_RECORD_NUMBER
// if the record number is out of bounds.
HotRiot.getJoinRecordID = function(recordNumber, databaseName, jsonResponse)
{
    return HotRiot.getJoinRecordSystemFieldData(recordNumber, "hsp-recordID", databaseName, jsonResponse);
}

// This function retrieves the delete record link assigned to the join database record for the database 'databaseName' for the record 'recordNumber'.
// Returns an empty string if the delete record command is not present or if the record number is out of bounds. Sets the error code HotRiot.INVALID_RECORD_NUMBER
// if the record number is out of bounds.
HotRiot.getJoinDeleteRecordCommand = function(recordNumber, databaseName, jsonResponse)
{
    return HotRiot.getJoinRecordSystemFieldData(recordNumber, "hsp-deleteRecordLink", databaseName, jsonResponse);
}

// Returns an empty string if the 'systemFieldName' is not present or the record number is out of bounds.
// Sets the error code HotRiot.INVALID_RECORD_NUMBER if the record number is out of bounds.
HotRiot.getJoinRecordSystemFieldData = function(recordNumber, systemFieldName, databaseName, jsonResponse)
{
    var fieldData = '';

    HotRiot.clearLastProcessingErrorCode();
    var dbFieldName = databaseName + '::' + systemFieldName;
    var finalRecordNumber = 'record_' + recordNumber;

    if( HotRiot.isValidRecordNumber(recordNumber, jsonResponse) == true )
    {
        fieldData = jsonResponse.recordData[finalRecordNumber].fieldData[dbFieldName];
        if( fieldData === undefined )
            fieldData = '';
    }

    return fieldData;
}

// This returns the delete record link, which is to be used with the deleteRecordDirect function. Returns an empty string
// if the delete record link is not present or if the recordNumber is out of bounds. Sets the error code HotRiot.INVALID_RECORD_NUMBER
// if the record number is out of bounds.
HotRiot.getDeleteRecordCommand = function( recordNumber, jsonResponse )
{
var deleteRecordLink = '';

    HotRiot.clearLastProcessingErrorCode();
    if( HotRiot.isValidRecordNumber(recordNumber, jsonResponse) == true )
        deleteRecordLink = HotRiot.getDeleteRecordLink(recordNumber, jsonResponse);
    
    return deleteRecordLink;
}

// This function deletes a joined record from a database.
HotRiot.deleteJoinRecord = function( recordNumber, databaseName, repost, jsonResponse, successProcessing, errorProcessing )
{
    HotRiot.clearLastProcessingErrorCode();
    if( HotRiot.isValidRecordNumber(recordNumber, jsonResponse) == true )
    {
        var deleteRecordLink = HotRiot.getJoinDeleteRecordLink(recordNumber, databaseName, jsonResponse);
        if( deleteRecordLink != null && deleteRecordLink != '' )
            return HotRiot.deleteRecordDirect( deleteRecordLink, repost, successProcessing, errorProcessing );
        else
            return false;
    }
    else
        return false;
}

// This function deletes a record using the delete record link (command) directly. It is meant to be used with the
// functions 'getJoinRecordDeleteRecordLink' and 'getDeleteRecordLink'. This function is called directly by the
// functions deleteRecord and deleteJoinRecord.
HotRiot.deleteRecordDirect = function( deleteRecordLink, repost, successProcessing, errorProcessing )
{
    if( deleteRecordLink === undefined || deleteRecordLink === null || deleteRecordLink === '' || deleteRecordLink.split('?').length !== 2 ){
        HotRiot.clearLastProcessingErrorCode();
        HotRiot.setLastProcessingError(HotRiot.INVALID_QUERY_STRING);
    }
    else
    {
        if( repost === false )
            deleteRecordLink = deleteRecordLink + "&norepost=true"
        HotRiot.postLink( deleteRecordLink, successProcessing, errorProcessing );
    }

    return true;
}

