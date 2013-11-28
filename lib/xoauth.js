"use strict";

// this module is inspired by xoauth.py
// http://code.google.com/p/google-mail-xoauth-tools/

var crypto = require("crypto");

/**
 * Expose to the world
 * @namespace xoauth
 */
module.exports.XOAuthGenerator = XOAuthGenerator;

/**
 * Create a XOAUTH login token generator
 *
 * @constructor
 * @memberOf xoauth
 * @param {Object} options
 * @param {String} [options.consumerKey="anonymous"] OAuth consumer key
 * @param {String} [options.consumerSecret="anonymous"] OAuth consumer secret
 * @param {String} [options.requestorId] 2 legged OAuth requestor ID
 * @param {String} [options.nonce] Nonce value to be used for OAuth
 * @param {Number} [options.timestamp] Unix timestamp value to be used for OAuth
 * @param {String} options.user Username
 * @param {String} [options.requestUrl] OAuth request URL
 * @param {String} [options.method="GET"] OAuth request method
 * @param {String} options.token OAuth token
 * @param {String} options.tokenSecret OAuth token secret
 */
function XOAuthGenerator(options){
    this.options = options || {};
}

/**
 * Generate a XOAuth login token
 *
 * @param {Function} [callback] Callback function to run when the access token is genertaed
 * @return {String|undefined} If callback is not set, return the token value, otherwise run callback instead
 */
XOAuthGenerator.prototype.generate = function(callback){
    return generateXOAuthStr(this.options, callback);
};

// Helper functions

function escapeAndJoin(arr){
    return arr.map(encodeURIComponent).join("&");
}

function hmacSha1(str, key){
    var hmac = crypto.createHmac("sha1", key);
    hmac.update(str);
    return hmac.digest("base64");
}

function initOAuthParams(options){
    return {
            oauth_consumer_key: options.consumerKey || "anonymous",
            oauth_nonce: options.nonce || "" + Date.now() + Math.round(Math.random()*1000000),
            oauth_signature_method: "HMAC-SHA1",
            oauth_version: "1.0",
            oauth_timestamp: options.timestamp || "" + Math.round(Date.now()/1000)
        };
}

function generateOAuthBaseStr(method, requestUrl, params){
    var reqArr = [method, requestUrl].concat(Object.keys(params).sort().map(function(key){
            return key + "=" + encodeURIComponent(params[key]);
        }).join("&"));
    return escapeAndJoin(reqArr);
}

function generateXOAuthStr(options, callback){
    options = options || {};

    var params = initOAuthParams(options),
        requestUrl = options.requestUrl || "https://mail.google.com/mail/b/" + (options.user || "") + "/imap/",
        baseStr, signatureKey, paramsStr, returnStr;

    if(options.token && !options.requestorId){
        params.oauth_token = options.token;
    }

    baseStr = generateOAuthBaseStr(options.method || "GET", requestUrl, params);

    if(options.requestorId){
        baseStr += encodeURIComponent("&xoauth_requestor_id=" + encodeURIComponent(options.requestorId));
    }

    signatureKey = escapeAndJoin([options.consumerSecret || "anonymous", options.tokenSecret || ""]);

    params.oauth_signature = hmacSha1(baseStr, signatureKey);

    paramsStr = Object.keys(params).sort().map(function(key){
        return key+"=\""+encodeURIComponent(params[key])+"\"";
    }).join(",");

    // Liidab kokku üheks pikaks stringiks kujul "METHOD URL BODY"
    // 2-legged variandi puhul lisab BODY parameetritele otsa ka requestor_id väärtuse
    returnStr = [options.method || "GET", requestUrl +
            (options.requestorId ? "?xoauth_requestor_id=" + encodeURIComponent(options.requestorId) : ""), paramsStr].join(" ");

    if(typeof callback == "function"){
        callback(null, new Buffer(returnStr, "utf-8").toString("base64"));
    }else{
        return new Buffer(returnStr, "utf-8").toString("base64");
    }
}
