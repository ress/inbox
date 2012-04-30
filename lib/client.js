/**
 * @fileOverview Provides an simple API for IMAP mailbox access
 * @author Andris Reinman
 */

// TODO: On error close the connection when needed

var Stream = require("stream").Stream,
    utillib = require("util"),
    net = require("net"),
    tls = require("tls"),
    starttls = require("./starttls").starttls,
    IMAPLineParser = require("./lineparser"),
    mimelib = require("mimelib"),
    xoauth = require("./xoauth");

/**
 * Expose to the world
 * @namespace inbox
 */
module.exports.createConnection = createConnection;
module.exports.createXOAuthGenerator = createXOAuthGenerator;
module.exports.IMAPClient = IMAPClient;

/**
 * Create an IMAP inbox object, shorthand for new IMAPClient.
 * 
 * @memberOf inbox
 * @param {Number} port IMAP server port to connect to
 * @param {String} host IMAP server hostname
 * @param {Object} options Options object for authentication etc.
 */
function createConnection(port, host, options){
    return new IMAPClient(port, host, options);
}

/**
 * Create a XOAUTH login token generator
 * 
 * @memberOf inbox
 * @param {Object} options Options object, see {@see xoauth}
 */
function createXOAuthGenerator(options){
    return new xoauth.XOAuthGenerator(options);
}


/**
 * Creates an IMAP connection object for communicating with the server
 * 
 * @constructor
 * @memberOf inbox
 * @param {Number} port IMAP server port to connect to
 * @param {String} host IMAP server hostname
 * @param {String} options Options object for authentication etc.
 */
function IMAPClient(port, host, options){
    Stream.call(this);

    /**
     * Make this stream writeable. For future reference only, currently not needed
     */
    this.writable = true;
    
    /**
     * Make this stream readable. Should be on by default though
     */
    this.readable = true;
    
    /**
     * Options object for this instance
     */
    this.options = options || {};
    
    /**
     * Port to use for connecting to the server
     */
    this.port = port || (this.options.secureConnection ? 993 : 143);
    
    /**
     * Server hostname
     */
    this.host = host || "localhost";
    
    /**
     * If set to true, print traffic between client and server to the console
     */
    this.debug = !!this.options.debug;
    
    this._init();
}
utillib.inherits(IMAPClient, Stream);

/**
 * States constants for the client FSM.
 */
IMAPClient.prototype.states = {
    NONE: 0x1,
    PREAUTH: 0x2,
    AUTH: 0x3,
    SELECTED: 0x4,
    LOGOUT: 0x5
};

/**
 * States constants for current command parsing.
 */
IMAPClient.prototype.modes = {
    COMMAND: 0x1,
    DATA: 0x2
};

/**
 * Delay for breaking IDLE loop and running NOOP
 */
IMAPClient.prototype.IDLE_TIMEOUT = 15 * 1000;

/**
 * Delay for entering IDLE mode after any command
 */
IMAPClient.prototype.ENTER_IDLE = 1 * 1000;

/**
 * How much time to wait for the initial greeting
 */
IMAPClient.prototype.GREETING_TIMEOUT = 15 * 1000;

/**
 * Reset instance variables
 */
IMAPClient.prototype._init = function(){
    
    /**
     * Should the connection be over TLS or NET
     */
    this.options.secureConnection = !!this.options.secureConnection;
    
    /**
     * Authentication details
     */
    this.options.auth = this.options.auth || {user: "", pass:""};
    
    /**
     * Connection socket to the server
     */
    this._connection = false;
    
    /**
     * Is the connection currently in secure mode, changes with STARTTLS
     */
    this._secureMode = !!this.options.secureConnection;
    
    /**
     * Current protocol state.
     */
    this._currentState = this.states.NONE;
    
    /**
     * Current stream mode for incoming data 
     */
    this._currentMode = this.modes.COMMAND;
    
    /**
     * Expected remaining data length on stream data mode
     */
    this._expectedDataLength = 0;
    
    /**
     * Data that was not part of the last command
     */
    this._remainder = "";
    
    /**
     * Counter for generating unique command tags
     */
    this._tagCounter = 0;
    
    /**
     * Currently active command
     */
    this._currentRequest = false;
    
    /**
     * Unprocessed commands
     */
    this._commandQueue = [];
    
    /**
     * Server capabilities
     */
    this._capabilities = [];
    
    /**
     * Are the capabilities updated
     */
    this._updatedCapabilities = false;
    
    /**
     * Currently in idle
     */
    this.idling = false;
    
    /**
     * Waiting for idle start after issuing IDLE command
     */
    this._idleWait = false;
    
    /**
     * Waiting for the idle to end
     */
    this._idleEnd = false;
    
    /**
     * Timer to run NOOP when in idle
     */
    this._idleTimer = false;
    
    /**
     * Timer for entering idle mode after other commands
     */
    this._shouldIdleTimer = true;
    
    /**
     * Timeout to wait for a successful greeting from the server
     */
    this._greetingTimeout = false;
    
    /**
     * Should the FETCH responses collected into an array
     */
    this._collectMailList = false;
    
    /**
     * An array of collected FETCH responses
     */
    this._mailList = [];
    
    /**
     * If set to true emit FETCH responses as new emails
     */
    this._checkForNewMail = false;
    
    /**
     * Currently selected mailbox data
     */
    this._selectedMailbox = {};
    
    /**
     * Currently streaming possible literal values
     */
    this._literalStreaming = false;
    
    /**
     * Message Stream object for streaming requested messages
     */
    this._messageStream = false;
    
    /**
     * Personal mailbox root
     */
    this._mailboxRoot = "";
    
    /**
     * Delimiter for mailbox hierarchy
     */
    this._mailboxDelimiter = "/";
    
    /**
     * Default INBOX name
     */
    this._inboxName = "INBOX";
    
    /**
     * Default Sent folder name
     */
    this._outgoingName = this.options.outgoingName || "";
    
    /**
     * Active mailbox list
     */
    this._mailboxList = {};
    
    /**
     * Ignore all incoming data while in TLS negotiations
     */
    this._ignoreData = false;
    
    /**
     * Lineparser object to feed the incoming data to
     */
    this.lineparser = new IMAPLineParser();
    
    /**
     * Initially send the incoming data to greeting handler
     */
    this._currentHandler = this._handlerGreeting;
    
    this.lineparser.on("line", this._onServerResponse.bind(this));
};

/**
 * Connect to the server using either TLS or NET
 */
IMAPClient.prototype.connect = function(){

    if(this.options.secureConnection){
        this._connection = tls.connect(this.port, this.host, {}, this._onConnect.bind(this));
    }else{
        this._connection = net.connect(this.port, this.host);
        this._connection.on("connect", this._onConnect.bind(this));
    }
    
    this._connection.on("error", this._onError.bind(this));
    
    this._greetingTimeout = setTimeout(this._handleGreetingTimeout.bind(this), this.GREETING_TIMEOUT);
};

// CONNECTION EVENTS

/**
 * 'connect' event for the connection to the server. Setup other events when connected
 * 
 * @event
 */
IMAPClient.prototype._onConnect = function(){

    if("setKeepAlive" in this._connection){
        this._connection.setKeepAlive(true);
    }else if(this._connection.socket && "setKeepAlive" in this._connection.socket){
        this._connection.socket.setKeepAlive(true); // secure connection
    }
    
    this._connection.on("data", this._onData.bind(this));
    this._connection.on("close", this._onClose.bind(this));
    this._connection.on("end", this._onEnd.bind(this));
    
};

/**
 * 'data' event coming from the server connection. Split the lines on line breaks
 * and if in COMMAND mode pass the line to the line parser and when in DATA
 * mode, pass it as a literal or stream if needed. If there's a remainder left from
 * the end of the line, rerun the function with it
 * 
 * @event
 * @param {Buffer} chunk incoming binary data chunk
 */
IMAPClient.prototype._onData = function(chunk){
    if(this._ignoreData){
        // TLS negotiations going on, ignore everything received
        return;
    }
    
    var data = chunk && chunk.toString("binary") || "",
        line, match;
    
    if(this._remainder){
        data = this._remainder + data;
        this._remainder = "";
    }
    
    if(this._currentMode == this.modes.DATA){
        if(this._expectedDataLength <= data.length){
            
            if(this._expectedDataLength){
                
                if(!this._literalStreaming){
                    this.lineparser.writeLiteral(data.substr(0, this._expectedDataLength));
                }else{
                    this._messageStream.emit("data", new Buffer(data.substr(0, this._expectedDataLength), "binary"));
                }
              
                this._remainder = data.substr(this._expectedDataLength);
                this._expectedDataLength = 0;
            }else{
                this._remainder = data;
            }
            
            if(this._literalStreaming){
                this._messageStream.emit("end");
                this._messageStream.removeAllListeners();
            }
                        
            this._currentMode = this.modes.COMMAND;
            
            return this._onData(); // rerun with the remainder
        }else{
            
            if(!this._literalStreaming){
                this.lineparser.writeLiteral(data);
            }else{
                this._messageStream.emit("data", new Buffer(data, "binary"));
            }
            
            this._expectedDataLength -= data.length;
            return;
        }
    }
    
    if(this._currentMode == this.modes.COMMAND){
        if((match = data.match(/\r?\n/))){ // find the line ending
            line = data.substr(0, match.index);
            this._remainder = data.substr(match.index + match[0].length) || "";
 
            if(this.debug){
                console.log("SERVER: "+line);
            }
 
            // check if the line ends with a literal notion
            if((match = line.match(/\{(\d+)\}\s*$/))){
                this._expectedDataLength = Number(match[1]);
                this.lineparser.write(line);
                
                this._currentMode = this.modes.DATA;
                
                if(this._literalStreaming){
                    this.lineparser.writeLiteral(""); // create empty literal object
                }
            }else{
                this.lineparser.end(line);
            }
 
            if(this._remainder){
                return this._onData(); // rerun with the remainder
            }
        }else{
            this._remainder = data; // keep it for later
        }
    }
};

/**
 * 'close' event when disconnected from the server
 * @event
 */
IMAPClient.prototype._onClose = function(){
    if(this.debug){
        console.log("EVENT: CLOSE");
    }
};

/**
 * 'end' event when disconnected from the server
 * @event
 */
IMAPClient.prototype._onEnd = function(){
    this.emit("end");
    
    if(this.debug){
        console.log("EVENT: END");
    }
};

/**
 * 'error' event, re-emit it
 * @event
 */
IMAPClient.prototype._onError = function(error){
    this.emit("error", error);
};


// INCOMING COMMANDS

/**
 * When the input command has been parsed pass it to the current command handler.
 * Basically there's just two - the initial greeting handler and universal
 * response router
 * 
 * @param {Array} data Parsed command, split into parameters
 */
IMAPClient.prototype._onServerResponse = function(data){
    this._currentHandler(data);
};

/**
 * Run as the handler for the initial command coming from the server. If it
 * is a greeting with status OK, enter PREAUTH state and run CAPABILITY
 * command
 * 
 * @param {Array} data Parsed command
 */
IMAPClient.prototype._handlerGreeting = function(data){
    clearTimeout(this._greetingTimeout);
    
    if(!data || !Array.isArray(data)){
        throw new Error("Invalid input");
    }

    if(data[0] != "*" && data[1] != "OK"){
        return this.emit("error", "Bad greeting from the server");
    }
    
    this._currentState = this.states.PREAUTH;
    this._currentHandler = this._responseRouter;
    
    this._send("CAPABILITY", this._handlerTaggedCapability.bind(this));
};

/**
 * When the greeting is not received in GREETING_TIMEOUT time,
 * emit an error and close the socket
 */
IMAPClient.prototype._handleGreetingTimeout = function(){
    this.emit("error", "Timeout waiting for a greeting");
    this.close();
};

/**
 * Checks the command data and routes it to the according handler
 * 
 * @param {Array} data Parsed command
 */
IMAPClient.prototype._responseRouter = function(data){
    if(!data || !Array.isArray(data)){
        return;
    }
    
    // Handle tagged commands
    if(this._currentRequest && this._currentRequest.tag == data[0]){
        this._currentRequest.callback(data[1], data.slice(2));
        return;
    }
    
    // handle commands tagged with +
    if(data[0]=="+"){
        if(this._idleWait){
            this._handlerUntaggedIdle();
        }
    }
    
    // handle untagged commands (tagged with *)
    if(data[0]=="*"){
        switch(data[1]){
            case "CAPABILITY":
                this._handlerUntaggedCapability(data.slice(2));
                return;
            case "NAMESPACE":
                this._handlerUntaggedNamespace(data.slice(2));
                return;
            case "FLAGS":
                this._selectedMailbox.flags = data[2] || [];
                return;
            case "SEARCH":
                this._handlerUntaggedSearch(data.slice(2));
                return;
            case "XLIST":
            case "LIST":
                this._handlerUntaggedList(data.slice(2));
                return;
            case "OK":
                if(typeof data[2] == "object"){
                    if(Array.isArray(data[2].params)){
                        if(data[2].params[0] == "UIDVALIDITY"){
                            this._selectedMailbox.UIDValidity = data[2].params[1];
                            return;
                        }else if(data[2].params[0] == "UIDNEXT"){
                            this._selectedMailbox.UIDNext = data[2].params[1];
                            return;
                        }else if(data[2].params[0] == "UNSEEN"){
                            this._selectedMailbox.unseen = data[2].params[1];
                            return;
                        }else if(data[2].params[0] == "PERMANENTFLAGS"){
                            this._selectedMailbox.permanentFlags = data[2].params[1] || [];
                            return;
                        }
                    }
                }
                return;
        }
        
        if(!isNaN(data[1]) && data[2] == "FETCH"){
            this._handlerUntaggedFetch(data);
            return;
        }
        
        if(!isNaN(data[1]) && data[2] == "EXPUNGE"){
            if(this._selectedMailbox.count){
                this._selectedMailbox.count--;
            }
        }
        
        if(!isNaN(data[1]) && data[2] == "EXISTS"){
            if(this._selectedMailbox.count != Number(data[1])){
                this._selectedMailbox.count = Number(data[1]) || this._selectedMailbox.count || 0;
                if(this.idling){
                    this._checkNewMail();
                }
            }  
            return;
        }
        
    }
};

// OUTGOING COMMANDS

/**
 * Prepend a tag for a command and put into command queue
 * 
 * @param {String} data Command to be sent to the server
 * @param {Function} [callback] Callback function to run when the command is completed
 * @param {Function} [prewrite] Function to run before the command is sent
 */
IMAPClient.prototype._send = function(data, callback, prewrite){
    data = (data || "").toString();
    var tag = "A" + (++this._tagCounter);
    
    this._commandQueue.push({tag: tag, data: tag + " " + data + "\r\n", callback: callback, prewrite: prewrite});

    if(this.idling || !this._currentRequest){
        this._processCommandQueue();
    }
};

/**
 * Send a command form the command queue to the server
 */
IMAPClient.prototype._processCommandQueue = function(){
    
    if(!this._commandQueue.length){
        return;
    }

    // If the client is currently on idle, stop it
    clearTimeout(this._shouldIdleTimer);
    clearTimeout(this._idleTimer);
    if(this._idleWait || this.idling){
        if(!this._idleWait && this.idling && !this._idleEnd){
            if(this.debug){
                console.log("CLIENT: DONE");
            }
            this._connection.write("DONE\r\n");
            this._idleEnd = true;
        }
        setTimeout(this._processCommandQueue.bind(this), 100);
        return;
    }

    var command = this._commandQueue.shift();
    
    if(typeof command.prewrite == "function"){
        command.prewrite();
    }
    
    this._connection.write(command.data);
    
    if(this.debug){
        console.log("CLIENT: "+ (command.data || "").trim());
    }
    
    this._currentRequest = {
        tag: command.tag,
        callback: (function(status, params){
            
            clearTimeout(this._shouldIdleTimer);
            clearTimeout(this._idleTimer);
            if(!this.idling && !this._idleWait && this._currentState == this.states.SELECTED){
                this._shouldIdleTimer = setTimeout(this.idle.bind(this), this.ENTER_IDLE);
            }
            
            if(typeof command.callback == "function"){
                command.callback(status, params);
            }
            this._currentRequest = false;

            this._processCommandQueue();
        }).bind(this)
    };
};

// HANDLERS FOR TAGGED RESPONSES

/**
 * Handle tagged CAPABILITY. If in plaintext mode and STARTTLS is advertised,
 * run STARTTLS, otherwise report success to _postCapability()
 * 
 * @param {String} status If "OK" then the command succeeded
 */
IMAPClient.prototype._handlerTaggedCapability = function(status){
    if(status == "OK"){
        if(!this._secureMode && this._capabilities.indexOf("STARTTLS")>=0){
            this._send("STARTTLS", this._handlerTaggedStartTLS.bind(this));
            return;
        }
        
        this._postCapability();
    }else{
        this.emit("error", new Error("Invalid capability response"));
        this.close();
    }
};

/**
 * Handle tagged STARTTLS. If status is OK perform a TLS handshake and rerun
 * CAPABILITY on success.
 * 
 * @param {String} status If "OK" then the command succeeded
 */
IMAPClient.prototype._handlerTaggedStartTLS = function(status){
    if(status == "OK"){
        this._ignoreData = true;
        starttls(this._connection, (function(socket){

            this._connection = socket;
            this._ignoreData = false;
            this._secureMode = true;
            this._connection.on("data", this._onData.bind(this));
            
            if("setKeepAlive" in this._connection){
                this._connection.setKeepAlive(true);
            }else if(this._connection.socket && "setKeepAlive" in this._connection.socket){
                this._connection.socket.setKeepAlive(true); // secure connection
            }
            
            this._send("CAPABILITY", this._handlerTaggedCapability.bind(this));
        }).bind(this));
    }else{
        this.emit("error", new Error("Invalid starttls response"));
        this.close();
    }
};

/**
 * Handle LOGIN response. If status is OK, consider the user logged in.
 * 
 * @param {String} status If "OK" then the command succeeded
 */
IMAPClient.prototype._handlerTaggedLogin = function(status){
    if(status == "OK"){
        this._currentState = this.states.AUTH;
        if(!this._updatedCapabilities){
            this._send("CAPABILITY", this._handlerTaggedCapability.bind(this));
        }else{
            this._postAuth();
        }
    }else{
        this.emit("error", new Error("Authentication failed"));
        this.close();
    }
};

/**
 * Handle NAMESPACE command. We don't reaaly care if the NAMESPACE succeeded or 
 * not as it is just some informational data. If it failed we still might be
 * able to access the mailbox
 * 
 * @param {String} status If "OK" then the command succeeded
 */
IMAPClient.prototype._handlerTaggedNamespace = function(status){
    this.fetchMailboxList(this._postReady.bind(this));
};

/**
 * Handle SELECT and EXAMINE commands. If succeeded, move to SELECTED state.
 * If callback is set runs it with selected mailbox data
 * 
 * 
 * @param {Function} callback Callback function to run on completion
 * @param {String} status If "OK" then the command succeeded
 * @params {Array} params Parsed params excluding tag and SELECT
 */
IMAPClient.prototype._handlerTaggedSelect = function(callback, status, params){
    if(status == "OK"){
        this._currentState = this.states.SELECTED;
        
        if(Array.isArray(params) && params[0] && params[0].params){
            if(params[0].params[0] == "READ-WRITE"){
                this._selectedMailbox.readOnly = false;
            }else if(params[0].params[0] == "READ-ONLY"){
                this._selectedMailbox.readOnly = true;
            }
        }

        clearTimeout(this._shouldIdleTimer);
        clearTimeout(this._idleTimer);
        this._shouldIdleTimer = setTimeout(this.idle.bind(this), this.ENTER_IDLE);

        if(typeof callback == "function"){
            callback(null, this._selectedMailbox);
        }else{
            this.emit("mailbox", this._selectedMailbox);
        }
    }else{
        if(typeof callback == "function"){
            callback(null, new Error("Mailbox select failed"));
        }else{
            this.emit("error", new Error("Mailbox select failed"));
        }
    }
};

/**
 * Handle LIST % command. If any of the mailboxes has children, check these as well
 * 
 * @param {Function} callback Callback function to run on completion
 * @param {String} status If "OK" then the command succeeded
 */
IMAPClient.prototype._handlerTaggedListRoot = function(callback, status){
    var command = "LIST", mailboxes, i, len;
    
    if(this._capabilities.indexOf("XLIST")){
        command = "XLIST";
    }
    
    if(status == "OK"){
        // check if child boxes available
        mailboxes = Object.keys(this._mailboxList);
        for(i=0, len = mailboxes.length; i<len; i++){
            if(this._mailboxList[mailboxes[i]].childNodes){
                this._send(command+" "+this._escapeString(this._mailboxRoot)+" %"+this._mailboxDelimiter+"%", this._handlerTaggedListSubs.bind(this, callback));
                return;
            }
        }
        this._postFetchList(callback);
    }else{
        if(typeof callback == "function"){
            callback(new Error("Mailbox listing failed"));
        }else{
            this.emit("error", new Error("Mailbox listing failed"));
        }
    }
};

/**
 * Handle LIST %/% command.
 * 
 * @param {Function} callback Callback function to run on completion
 * @param {String} status If "OK" then the command succeeded
 */
IMAPClient.prototype._handlerTaggedListSubs = function(callback, status){
    if(status == "OK"){
        this._postFetchList(callback);
    }else{
        if(typeof callback == "function"){
            callback(new Error("Mailbox listing failed"));
        }else{
            this.emit("error", new Error("Mailbox listing failed"));
        }
    }
};

// HANDLERS FOR UNTAGGED RESPONSES

/**
 * Handle untagged CAPABILITY response, store params to _capabilities array
 * 
 * @param {Array} list Params for "* CAPABILITY" as an array
 */
IMAPClient.prototype._handlerUntaggedCapability = function(list){
    this._updatedCapabilities = true;
    this._capabilities = list;
};

/**
 * Handle untagged NAMESPACE response, fetch root and delimiter for personal
 * mailbox. Check only personal inbox, skip others.
 * 
 * @param {Array} list Params
 */
IMAPClient.prototype._handlerUntaggedNamespace = function(list){
    if(Array.isArray(list[0] && list[0][0])){
        this._mailboxRoot = list[0][0][0];
        this._mailboxDelimiter = list[0][0][1];
    }
};

/**
 * Handle untagged LIST and XLIST responses, for mailbox data. Store mailbox 
 * info into _mailboxList property.
 * 
 * @param {Array} list Params for LIST
 */
IMAPClient.prototype._handlerUntaggedList = function(list){
    var tags = list.shift() || [],
        delimiter = list.shift() || this._mailboxDelimiter,
        fullname = (list.shift() || "").substr(this._mailboxRoot.length),
        nameParts = delimiter?fullname.split(delimiter):[fullname],
        name,
        mailboxList = this._mailboxList,
        mailbox = {};
    
    this._mailboxDelimiter = delimiter || this._mailboxDelimiter;
    
    if(!fullname){
        return; // nothing to do here
    }
    
    if(nameParts.length>1){
        if(mailboxList[nameParts[0]] && mailboxList[nameParts[0]].childNodes){
            mailboxList = mailboxList[nameParts[0]].childNodes;
            name = nameParts.slice(1).join(delimiter);
        }else{
            return;
        }
    }else{
        name = fullname;
    }
    
    mailbox = {
        name: this._mailboxRoot + fullname
    };
    
    if(tags.indexOf("\\HasChildren")>=0){
        mailbox.childNodes = {};
    }
    
    if(tags.indexOf("\\Inbox")>=0){
        mailbox.name = "INBOX";
        name = "INBOX";
        mailbox.inbox = true;
        this._inboxName = "INBOX";
    }
    
    if(tags.indexOf("\\Sent")>=0){
        mailbox.sent = true;
        this._outgoingName = this._outgoingName || fullname; // prefer previous
    }
    
    if(tags.indexOf("\\Noselect")>=0){
        mailbox.disabled = true;
    }
    
    mailboxList[name] = mailbox;
};

/**
 * Handle untagged IDLE, this means that idle mode has been entered.
 */
IMAPClient.prototype._handlerUntaggedIdle = function(){
    this._idleWait = false;
    this.idling = true;
    this._processCommandQueue();
};

/**
 * Handle search responses, not yet implemented
 * TODO: andle search responses
 */
IMAPClient.prototype._handlerUntaggedSearch = function(list){
    //console.log(list);
};

/**
 * Handle untagged FETCH responses, these have data about individual messages.
 * 
 * @param {Array} list Params about a message
 */
IMAPClient.prototype._handlerUntaggedFetch = function(list){
    var envelope = list[1] || [],
        nextUID = Number(this._selectedMailbox.UIDNext) || 0,
        currentUID = Number(envelope[1]) || 0,
        envelopeData = this._formatEnvelope((list || [])[3]);
        
    if(!nextUID || nextUID <= currentUID){
        this._selectedMailbox.UIDNext = currentUID+1;
    }
    
    if(this._collectMailList){
        this._mailList.push(envelopeData);
    }
    
    // emit as new message
    if(this._checkForNewMail){
        this.emit("new", envelopeData);
    }
};

/**
 * Timeout function for idle mode - if sufficient time has passed, break the
 * idle and run NOOP. After this, re-enter IDLE
 */
IMAPClient.prototype._idleTimeout = function(){
    this._send("NOOP", this.idle.bind(this));
};

// STATE RELATED HANDLERS

/**
 * Run after CAPABILITY response is received. If in PREAUTH state, initiate login,
 * if in AUTH mode, run _postAuth
 */
IMAPClient.prototype._postCapability = function(){
    if(this._currentState == this.states.PREAUTH){
        this._updatedCapabilities = false;

        if(this._capabilities.indexOf("AUTH=XOAUTH")>=0 && this.options.auth.XOAuthToken){
            if(typeof this.options.auth.XOAuthToken == "object"){
                this._send("AUTHENTICATE XOAUTH " + this.options.auth.XOAuthToken.generate(),
                     this._handlerTaggedLogin.bind(this));
            }else{
                this._send("AUTHENTICATE XOAUTH "+(this.options.auth.XOAuthToken || "").toString(),
                     this._handlerTaggedLogin.bind(this));
            }
        }else{
            this._send("LOGIN "+this._escapeString(this.options.auth.user)+" "+
                this._escapeString(this.options.auth.pass), this._handlerTaggedLogin.bind(this));
        }
    }else if(this._currentState == this.states.AUTH){
        this._postAuth();
    }else{
        throw new Error("Unhandled event state");
    }
};

/**
 * Run when user is successfully entered AUTH state. If NAMESPACE capability
 * is detected, run it, otherwise fetch the mailbox list.
 */
IMAPClient.prototype._postAuth = function(){
     if(this._capabilities.indexOf("NAMESPACE")>=0){
        this._send("NAMESPACE", this._handlerTaggedNamespace.bind(this));
    }else{
        this.fetchMailboxList(this._postReady.bind(this));
    }
};

/**
 * Run it when all the required jobs for setting up an authorized connection
 * are completed. Emit 'connect' event.
 * 
 * @param {Object} err Error object, if an error appeared
 */
IMAPClient.prototype._postReady = function(err){
    if(err){
        this.emit("error", err);
    }else{
        this.emit("connect");
    }
};

/**
 * Run after LIST command is completed. Sort the mailbox array and return it
 * with callback
 * 
 * @param {Function} callback Callback function to run after LIST data is gathered
 */
IMAPClient.prototype._postFetchList = function(callback){
    var keys = Object.keys(this._mailboxList), 
        i, len,
        sortedList = {};
    
    if(!this._outgoingName){
        for(i=0, len = keys.length; i<len; i++){
            if(keys[i].match(/^Sent\b/i)){
                this._mailboxList[keys[i]].sent = true;
                this._outgoingName = keys[i];
                break;
            }
        }
    }
    
    if(this._inboxName == "INBOX" && keys.indexOf("INBOX")<0){
        this._mailboxList.INBOX = {
            name: "INBOX",
            inbox: true
        };
        keys.push("INBOX");
    }
    
    keys.sort((function(a, b){
        if(this._mailboxList[a].inbox){
            return -1;
        }
        if(this._mailboxList[b].inbox){
            return 1;
        }
        if(this._mailboxList[a].sent){
            return -1;
        }
        if(this._mailboxList[b].sent){
            return 1;
        }
        return a.localeCompare(b);
    }).bind(this));
    
    keys.forEach((function(key){
        sortedList[key] = this._mailboxList[key];
    }).bind(this));
    
    this._mailboxList = sortedList;
    
    if(typeof callback == "function"){
        callback(null, this._mailboxList);
    }else{
        this.emit("list", this._mailboxList);
    }
};

// HELPER FUNNCTIONS

/**
 * Escapes a string and encloses it with double quotes.
 * 
 * @param {String} str String to escape
 */
IMAPClient.prototype._escapeString = function(str){
    return "\"" + (str || "").toString().replace(/(["\\])/g, "\\$1").replace(/[\r\n]/g, " ") + "\"";
};

/**
 * Format envelope object from (FLAGS ENVELOPE) response object
 * 
 * @param {Array} envelopeData An array with FLAGS and ENVELOPE response data
 * @return {Object} structured envelope data
 */
IMAPClient.prototype._formatEnvelope = function(envelopeData){

    if(!Array.isArray(envelopeData)){
        return null;
    }
    
    var dataObject = {}, lastKey = false;
    
    for(var i=0, len = envelopeData.length; i<len; i++){
        if(!lastKey){
            lastKey = (envelopeData[i] || "").toString();
        }else{
            dataObject[lastKey] = envelopeData[i];
            lastKey = false;
        }
    }    
    
    var message = {
        UIDValidity: this._selectedMailbox.UIDValidity
    };
    
    if(dataObject.UID){
        message.UID = Number(dataObject.UID) || 0;
    }
    
    if(dataObject.FLAGS){
        message.flags = dataObject.FLAGS || [];
    }
    
    if(dataObject.ENVELOPE){
        message.date = new Date(dataObject.ENVELOPE[0] || Date.now());
        
        message.title = (dataObject.ENVELOPE[1] || "").toString().
            replace(/\=\?[^?]+\?[QqBb]\?[^?]+\?=/g, 
                function(mimeWord){
                    return mimelib.decodeMimeWord(mimeWord);
                });
        if(dataObject.ENVELOPE[2] && dataObject.ENVELOPE[2].length){
            message.from = dataObject.ENVELOPE[2].map(this._formatEnvelopeAddress);
            if(message.from.length == 1){
                message.from = message.from[0];
            }
        }
        
        if(dataObject.ENVELOPE[5] && dataObject.ENVELOPE[5].length){
            message.to = dataObject.ENVELOPE[5].map(this._formatEnvelopeAddress);
        }
        if(dataObject.ENVELOPE[6] && dataObject.ENVELOPE[6].length){
            message.cc = dataObject.ENVELOPE[6].map(this._formatEnvelopeAddress);
        }
        message.messageId = (dataObject.ENVELOPE[9] || "").toString();
    }
    
    return message;

};

/**
 * Formats an IMAP ENVELOPE address in simpler {name, address} format
 * 
 * @param {Array} address IMAP ENVELOPE address array [name, smtp route, user, domain]
 * @return {Object} simple {name, address} format
 */
IMAPClient.prototype._formatEnvelopeAddress = function(address){
    var name = address[0],
        email = (address[2] || "") + "@" + (address[3] || "");
    
    if(email == "@"){
        email = "";
    }
    
    return {
        name: (name || email).replace(/\=\?[^?]+\?[QqBb]\?[^?]+\?=/g, 
                function(mimeWord){
                    return mimelib.decodeMimeWord(mimeWord);
                }),
        address: email
    };
};

/**
 * Check for new mail, since the last known UID
 */
IMAPClient.prototype._checkNewMail = function(){
    if(isNaN(this._selectedMailbox.UIDNext)){
        return;
    }
    
    this._send("UID FETCH "+this._selectedMailbox.UIDNext+":* (FLAGS ENVELOPE)", (function(){
        this._checkForNewMail = false;
    }).bind(this), 
    (function(){
        this._checkForNewMail = true;  
    }).bind(this));
};


// PUBLIC API

/**
 * Fetches a structured list of mailboxes
 * 
 * @param {Function} callback Callback function to run with the mailbox list
 */
IMAPClient.prototype.fetchMailboxList = function(callback){
    var command = "LIST";
    if(this._capabilities.indexOf("XLIST")>=0){
        command = "XLIST";
    }
    
    this._mailboxList = {};
    this._send(command+" "+this._escapeString(this._mailboxRoot)+" %", this._handlerTaggedListRoot.bind(this, callback));
};

/**
 * Returns the cached mailbox list
 * 
 * @return {Array} Mailbox list
 */
IMAPClient.prototype.getMailboxList = function(){
    return this._mailboxList;
};

/**
 * Opens a selected mailbox. This is needed before you can open any message.
 * 
 * @param {String} mailboxName Mailbox name with full path, ie "INBOX/Sent Items"
 * @param {Object} [options] Optional options object
 * @param {Boolean} [options.readOnly] If set to true, open the mailbox in read-only mode (seen/unseen flags won't be touched)
 * @param {Function} callback Callback function to run when the mailbox is opened 
 */
IMAPClient.prototype.openMailbox = function(mailboxName, options, callback){
    var command = "SELECT";
    
    if(typeof options == "function" && !callback){
        callback = options;
        options = undefined;
    }
    
    options = options || {};
    
    if(options.readOnly){
        command = "EXAMINE";
    }
    
    mailboxName = mailboxName || this._inboxName || "INBOX";
    
    this._selectedMailbox = {
        name: mailboxName
    };
    
    this._send(command + " " + this._escapeString(mailboxName), this._handlerTaggedSelect.bind(this, callback));
};

/**
 * Returns the current mailbox data object
 * 
 * @return {Object} Information about currently selected mailbox
 */
IMAPClient.prototype.getCurrentMailbox = function(){
    return this._selectedMailbox;
};

/**
 * Lists message envelopes for selected range. Negative numbers can be used to
 * count from the end of the list (most recent messages).
 * 
 * @param {Number} from List from position (0 based)
 * @param {Number} limit How many messages to fetch, defaults to all from selected position
 * @param {Function} callback Callback function to run with the listed envelopes 
 */
IMAPClient.prototype.listMessages = function(from, limit, callback){
    var to;
    
    from = Number(from) || 0;
    
    if(typeof limit == "function" && !callback){
        callback = limit; 
        limit = undefined;
    }
    
    limit = Number(limit) || 0;
    
    if(this._currentState != this.states.SELECTED){
        if(typeof callback == "function"){
            callback(new Error("No mailbox selected"));
        }
        return;
    }
    
    if(from < 0){
        from = this._selectedMailbox.count + from;
    }
    
    if(from < 0){
        from = 0;
    }
    
    if(limit){
        to = from + limit;
    }else{
        to = "*";
    }

    from++;
    
    this._collectMailList = true;
    this._mailList = [];
    this._send("FETCH "+from+":"+to+" (UID FLAGS ENVELOPE)", (function(status){
        this._collectMailList = false;
        
        if(typeof callback != "function"){
            return;
        }
        
        if(status == "OK"){
            callback(null, this._mailList);
        }else{
            callback(new Error("Error fetching list"));
        }
    }).bind(this));
};

/**
 * Updates flags for selected message
 * 
 * @param {Number} uid Message identifier
 * @param {Array} flags Flags to set for a message
 * @param {String} [updateType=""] If empty, replace flags; + add flag; - remove flag
 * @param {Function} callback Callback function to run, returns an array of flags
 */
IMAPClient.prototype.updateFlags = function(uid, flags, updateType, callback){
    uid = Number(uid) || 0;
    flags = flags || [];
    
    if(!callback && typeof updateType == "function"){
        callback = updateType;
        updateType = undefined;
    }
    
    updateType = (updateType || "").toString().trim();
    
    if(!uid){
        if(typeof callback == "function"){
            callback(new Error("Invalid UID value"));
        }
        return;
    }
    
    if(!Array.isArray(flags)){
        if(typeof callback == "function"){
            callback(new Error("Invalid flags value"));
        }
        return;
    }
    
    if(this._currentState != this.states.SELECTED){
        if(typeof callback == "function"){
            callback(new Error("No mailbox selected"));
        }
        return;
    }
    
    this._send("UID STORE "+uid+":"+uid+" "+updateType+"FLAGS ("+
      flags.join(" ")
      +")", (function(status){
        this._collectMailList = false;
        
        if(typeof callback != "function"){
            return;
        }
        
        if(typeof callback == "function"){
            if(status == "OK"){
                if(!this._mailList.length){
                    callback(null, true);
                }else{
                    callback(null, this._mailList[0].flags || []);
                }
            }else{
                callback(new Error("Error fetching message data"));
            }
        }
        
    }).bind(this),
    (function(){
        this._collectMailList = true;
        this._mailList = [];
    }).bind(this));
}

/**
 * Add flags for selected message
 * 
 * @param {Number} uid Message identifier
 * @param {Array} flags Flags to set for a message
 * @param {Function} callback Callback function to run, returns an array of flags
 */
IMAPClient.prototype.addFlags = function(uid, flags, callback){
    if(typeof flags == "string"){
        flags = [flags];
    }
    this.updateFlags(uid, flags, "+", callback);
}

/**
 * Removes flags for selected message
 * 
 * @param {Number} uid Message identifier
 * @param {Array} flags Flags to remove from a message
 * @param {Function} callback Callback function to run, returns an array of flags
 */
IMAPClient.prototype.removeFlags = function(uid, flags, callback){
    if(typeof flags == "string"){
        flags = [flags];
    }
    this.updateFlags(uid, flags, "-", callback);
}

/**
 * Fetches envelope object for selected message
 * 
 * @param {Number} uid Message identifier
 * @param {Function} callback Callback function to run with the envelope object
 */
IMAPClient.prototype.fetchData = function(uid, callback){
    uid = Number(uid) || 0;
    
    if(!uid){
        if(typeof callback == "function"){
            callback(new Error("Invalid UID value"));
        }
        return;
    }
    
    if(this._currentState != this.states.SELECTED){
        if(typeof callback == "function"){
            callback(new Error("No mailbox selected"));
        }
        return;
    }
    
    this._send("UID FETCH "+uid+":"+uid+" (FLAGS ENVELOPE)", (function(status){
        this._collectMailList = false;
        
        if(typeof callback != "function"){
            return;
        }
        
        if(typeof callback == "function"){
            if(status == "OK"){
                if(!this._mailList.length){
                    callback(null, null);
                }else{
                    callback(null, this._mailList[0]);
                }
            }else{
                callback(new Error("Error fetching message data"));
            }
        }
        
    }).bind(this),
    (function(){
        this._collectMailList = true;
        this._mailList = [];
    }).bind(this));
};

/**
 * Creates a Readable Stream for a selected message.
 * 
 * @param {Number} uid Message identifier
 */
IMAPClient.prototype.createMessageStream = function(uid){
    var stream = new Stream();
    
    uid = Number(uid) || 0;
    
    if(!uid){
        process.nextTick(this.emit.bind(this, new Error("Invalid UID value")));
        return;
    }
    
    if(this._currentState != this.states.SELECTED){
        process.nextTick(this.emit.bind(this, new Error("No inbox selected")));
        return;
    }
    
    this._send("UID FETCH "+uid+":"+uid+" BODY[]", (function(status){
        this._collectMailList = false;
        this._literalStreaming = false;
        
        
        
        if(!this._mailList.length){
            if(status == "OK"){
                stream.emit("error", new Error("Selected message not found"));
            }else{
                stream.emit("error", new Error("Error fetching message"));
            }
        }
        
        this._messageStream = null;
        
    }).bind(this),
    (function(){
        this._collectMailList = true;
        this._literalStreaming = true;
        this._mailList = [];
        this._messageStream = stream;
    }).bind(this));
    
    return stream;
};

/**
 * Enter IDLE mode
 */
IMAPClient.prototype.idle = function(){
    this._send("IDLE", (function(){
        this.idling = false;
        this._idleEnd = false;
    }).bind(this), (function(){
        this._idleWait = true;
        this._idleEnd = false;
        this._idleTimer = setTimeout(this._idleTimeout.bind(this), this.IDLE_TIMEOUT);
    }).bind(this));
};

/**
 * Closes the socket to the server
 * // FIXME - should LOGOUT first!
 */
IMAPClient.prototype.close = function(){
    var socket = this._connection.socket || this._connection;
    if(socket && !socket.destroyed){
        socket.destroy();
    }
};