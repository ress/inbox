
var Stream = require("stream").Stream,
    utillib = require("util"),
    net = require("net"),
    tls = require("tls"),
    starttls = require("./starttls").starttls,
    IMAPLineParser = require("./lineparser"),
    mimelib = require("mimelib");

module.exports.createConnection = createConnection;

function createConnection(port, host, options){
    return new IMAPClient(port, host, options);
}

function IMAPClient(port, host, options){
    Stream.call(this);

    this.writable = true;
    this.readable = true;
    
    this.options = options || {};
    
    this.port = port || (this.options.secureConnection ? 993 : 143);
    this.host = host || "localhost";
    
    this.debug = !!this.options.debug;
    
    this._init();
}
utillib.inherits(IMAPClient, Stream);

IMAPClient.prototype.states = {
    PREAUTH: 0x1,
    AUTH: 0x2,
    SELECTED: 0x3,
    LOGOUT: 0x4
};

IMAPClient.prototype.modes = {
    COMMAND: 0x1,
    DATA: 0x2
};

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
    this._currentState = this.states.PREAUTH;
    
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
     * Should the client go in idle mode when possible
     */
    this._shouldIdle = true;
    
    /**
     * Timer for entering idle mode after other commands
     */
    this._shouldIdleTimer = true;
    
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
     * Callback for currently fetched message
     */
    this._messageCallback = false;
    
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

IMAPClient.prototype.connect = function(){

    if(this.options.secureConnection){
        this._connection = tls.connect(this.port, this.host, {}, this._onConnect.bind(this));
    }else{
        this._connection = net.connect(this.port, this.host);
        this._connection.on("connect", this._onConnect.bind(this));
    }
    
    this._connection.on("error", this._onError.bind(this));
};

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

IMAPClient.prototype.close = function(){
    var socket = this._connection.socket || this._connection;
    if(socket && !socket.destroyed){
        socket.end();
    }
};

IMAPClient.prototype._onData = function(chunk){
    if(this._ignoreData){
        // TLS negotiations going on
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
 
            if((match = line.match(/\{(\d+)\}\s*$/))){
                this._expectedDataLength = Number(match[1]);
                this.lineparser.write(line);
                
                this._currentMode = this.modes.DATA;
                
                if(this._literalStreaming){
                    this._messageStream = new Stream();
                    
                    if(typeof this._messageCallback == "function"){
                        this._messageCallback(null, this._messageStream);
                    }else{
                        this.emit("message", this._messageStream);
                    }
                    
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

IMAPClient.prototype._onClose = function(){
    if(this.debug){
        console.log("EVENT: CLOSE");
    }
};

IMAPClient.prototype._onEnd = function(){
    if(this.debug){
        console.log("EVENT: END");
    }
};

IMAPClient.prototype._onError = function(error){
    throw error;
};

IMAPClient.prototype._onServerResponse = function(data){
    this._currentHandler(data);
};


IMAPClient.prototype._send = function(data, callback, prewrite){
    data = (data || "").toString();
    var tag = "A" + (++this._tagCounter);
    
    this._commandQueue.push({tag: tag, data: tag + " " + data + "\r\n", callback: callback, prewrite: prewrite});

    if(this.idling || !this._currentRequest){
        this._processCommandQueue();
    }
};

IMAPClient.prototype._processCommandQueue = function(){
    
    if(!this._commandQueue.length){
        return;
    }

    if(this._idleWait || this.idling){
        clearTimeout(this._idleTimer);
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
        console.log("CLIENT: "+ (command.data || "").trim());
    }
    
    this._currentRequest = {
        tag: command.tag,
        callback: (function(status, params){
            clearTimeout(this._shouldIdleTimer);
            
            if(!this.idling && !this._idleWait && this._shouldIdle){
                this._shouldIdleTimer = setTimeout(this.idle.bind(this), 1 * 1000);
            }
            
            if(typeof command.callback == "function"){
                command.callback(status, params);
            }
            this._currentRequest = false;

            this._processCommandQueue();
        }).bind(this)
    };
};

IMAPClient.prototype._handlerGreeting = function(data){
    if(!data || !Array.isArray(data)){
        throw new Error("Invalid input");
    }

    if(data[0] != "*" && data[1] != "OK"){
        throw new Error("Bad greeting");
    }
    
    this._currentHandler = this._responseRouter;
    
    this._send("CAPABILITY", this._handlerTaggedCapability.bind(this));
};

IMAPClient.prototype._handlerTaggedCapability = function(status){
    if(status == "OK"){
        if(!this._secureMode && this._capabilities.indexOf("STARTTLS")>=0){
            this._send("STARTTLS", this._handlerTaggedStartTLS.bind(this));
            return;
        }
        
        this._postCapability();
    }
};

IMAPClient.prototype._postAuth = function(){
     if(this._capabilities.indexOf("NAMESPACE")>=0){
        this._send("NAMESPACE", this._handlerTaggedNamespace.bind(this));
    }else{
        this.fetchMailboxList(this._postReady.bind(this));
    }
};

IMAPClient.prototype._postCapability = function(){
    if(this._currentState == this.states.PREAUTH){
        this._updatedCapabilities = false;
        this._send("LOGIN "+this._escapeString(this.options.auth.user)+" "+
            this._escapeString(this.options.auth.pass), this._handlerTaggedLogin.bind(this));
    }else if(this._currentState == this.states.AUTH){
       this._postAuth();
    }else{
        //throw new Error("Unhandled event state");
    }
};

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
        throw new Error("Unhandled event starttls");
    }
};

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


IMAPClient.prototype._handlerTaggedNamespace = function(status){
    if(status == "OK"){
        this.fetchMailboxList(this._postReady.bind(this));
    }else{
        throw new Error("Unhandled event namespace");
    }
};

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

        this._shouldIdle = true;
        if(this._shouldIdle){
            clearTimeout(this._shouldIdleTimer);
            this._shouldIdleTimer = setTimeout(this.idle.bind(this), 1000);
        }

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

IMAPClient.prototype._handlerIdleTimeout = function(){
    this._send("NOOP", this.idle.bind(this));
};

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

IMAPClient.prototype._handlerUntaggedCapability = function(list){
    this._updatedCapabilities = true;
    this._capabilities = list;
};

IMAPClient.prototype._handlerUntaggedNamespace = function(list){
    // check only personal inbox, skip others
    if(Array.isArray(list[0] && list[0][0])){
        this._mailboxRoot = list[0][0][0];
        this._mailboxDelimiter = list[0][0][1];
    }
};

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

IMAPClient.prototype._handlerUntaggedIdle = function(){
    this._idleWait = false;
    this.idling = true;
    this._processCommandQueue();
};

IMAPClient.prototype._handlerUntaggedSearch = function(list){
    //console.log(list);
};

IMAPClient.prototype._handlerUntaggedFetch = function(list){
    var envelope = list[1] || [],
        nextUID = Number(this._selectedMailbox.UIDNext) || 0,
        currentUID = Number(envelope[1]) || 0,
        envelopeData = this._formatEnvelope((list || [])[3]);
        
    if(!nextUID || nextUID <= currentUID){
        this._selectedMailbox.UIDNext = currentUID+1;
    }
    
    if(this._collectMailList){
        this._mailList.push(envelopeData);
    }
    
    if(this._checkForNewMail){
        this.emit("new", envelopeData);
    }
};

IMAPClient.prototype._escapeString = function(str){
    return "\"" + str.replace(/(["\\])/g, "\\$1").replace(/[\r\n]/g, " ") + "\"";
};

IMAPClient.prototype._responseRouter = function(data){
    if(!data || !Array.isArray(data)){
        return;
    }
    
    if(this._currentRequest && this._currentRequest.tag == data[0]){
        this._currentRequest.callback(data[1], data.slice(2));
        return;
    }
    
    if(data[0]=="+"){
        if(this._idleWait){
            this._handlerUntaggedIdle();
        }
    }
    
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
        
        if(!isNaN(data[1]) && data[2] == "EXISTS"){
            if(this._selectedMailbox.count != Number(data[1])){
                this._selectedMailbox.count = Number(data[1]) || this._selectedMailbox.count || 0;
                if(this.idling){
                    this._checkNewMail();
                }
            }  
            return;
        }
        
        if(!isNaN(data[1]) && data[2] == "EXPUNGE"){
            if(this._selectedMailbox.count){
                this._selectedMailbox.count--;
            }
        }
        
    }
};

IMAPClient.prototype.fetchMessage = function(uid, callback){
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
    
    this._send("UID FETCH "+uid+":"+uid+" BODY[]", (function(status){
        this._collectMailList = false;
        this._literalStreaming = false;
        
        if(typeof callback != "function"){
            return;
        }
        
        if(!this._mailList.length && typeof callback == "function"){
            if(status == "OK"){
                callback(null, null);
            }else{
                callback(new Error("Error fetching message"));
            }
        }
        
        this._messageCallback = false;
        
    }).bind(this),
    (function(){
        this._collectMailList = true;
        this._literalStreaming = true;
        this._mailList = [];
        this._messageCallback = callback;
    }).bind(this));
};

IMAPClient.prototype.listMessages = function(from, count, callback){
    var to;
    
    from = Number(from) || 0;
    
    if(typeof count == "function" && !callback){
        callback = count; 
        count = undefined;
    }
    
    count = Number(count) || 0;
    
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
    
    if(count){
        to = from + count;
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

IMAPClient.prototype._checkNewMail = function(err, mailboxList){
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
        message.flags = dataObject.FLAGS || [];
    }
    
    if(dataObject.ENVELOPE){
        message.date = new Date(dataObject.ENVELOPE[0] || Date.now());
        
        message.title = (dataObject.ENVELOPE[1] || "").toString().
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

IMAPClient.prototype._postReady = function(err){
    if(err){
        this.emit("error", err);
    }else{
        this.emit("connect");
    }
};

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

IMAPClient.prototype.openMailbox = function(mailboxName, options, callback){
    var command = "SELECT";
    
    if(typeof options == "function" && !callback){
        callback = options;
        options = undefined;
    }
    
    options = options || {};
    
    if(options.readOnly){
        command = "EXAMINE";
    }
    
    mailboxName = mailboxName || this._inboxName || "INBOX";
    
    this._selectedMailbox = {
        name: mailboxName
    };
    
    this._send(command + " " + this._escapeString(mailboxName), this._handlerTaggedSelect.bind(this, callback));
};

IMAPClient.prototype.fetchMailboxList = function(callback){
    var command = "LIST";
    if(this._capabilities.indexOf("XLIST")>=0){
        command = "XLIST";
    }
    
    this._mailboxList = {};
    this._send(command+" "+this._escapeString(this._mailboxRoot)+" %", this._handlerTaggedListRoot.bind(this, callback));
};

IMAPClient.prototype.getMailboxList = function(){
    return this._mailboxList;
};

IMAPClient.prototype.getCurrentMailbox = function(){
    return this._selectedMailbox;
};

IMAPClient.prototype.idle = function(){
    this._send("IDLE", (function(){
        this.idling = false;
        this._idleEnd = false;
    }).bind(this), (function(){
        this._idleWait = true;
        this._idleEnd = false;
        this._idleTimer = setTimeout(this._handlerIdleTimeout.bind(this), 15*1000);
    }).bind(this));
};
