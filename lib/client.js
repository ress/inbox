
var Stream = require("stream").Stream,
    utillib = require("util"),
    net = require("net"),
    tls = require("tls"),
    starttls = require("./starttls").starttls,
    IMAPLineParser = require("./lineparser"),
    mimelib = require("mimelib");

module.exports = IMAPClient;

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
    NONAUTH: 0x1,
    AUTH: 0x2,
    SELECTED: 0x3,
    LOGOUT: 0x4
};

IMAPClient.prototype.modes = {
    COMMAND: 0x1,
    DATA: 0x2
};

IMAPClient.prototype._init = function(){
    
    this.options.secureConnection = !!this.options.secureConnection;
    this.options.auth = this.options.auth || false;
    
    this.client = false;
    
    this._secureMode = !!this.options.secureConnection;
    this._currentState = this.states.NONAUTH;
    this._currentMode = this.modes.COMMAND;
    
    this._expectedDataLength = 0;
    
    this._tagCounter = 0;
    this._currentTag = false;
    this._remainder = "";
    this._commandQueue = [];
    
    this._capabilities = [];
    this._updatedCapabilities = false;
    
    this._idleing = false;
    this._idleWait = false;
    this._idleTimer = false;
    
    this._collectMailList = false;
    this._mailList = [];
    
    this._selectedMailbox = {};
    
    this._streamLiteral = false;
    this._streamedMessage = {};
    
    this._mailboxRoot = "";
    this._mailboxDelimiter = "/";
    this._inboxName = "INBOX";
    this._outgoingName = this.options.outgoingName || "";
    
    this._mailboxList = {};
    
    this._ignoreData = false;
    
    this.lineparser = false;
    
    this.lineparser = new IMAPLineParser();
    this.lineparser.on("line", this._onServerResponse.bind(this));    
    
    this._currentHandler = this._handlerGreeting;
};

IMAPClient.prototype.connect = function(){

    if(this.options.secureConnection){
        this.client = tls.connect(this.port, this.host, {}, this._onConnect.bind(this));
    }else{
        this.client = net.connect(this.port, this.host);
        this.client.on("connect", this._onConnect.bind(this));
    }
    
    this.client.on("error", this._onError.bind(this));
};

IMAPClient.prototype._onConnect = function(){

    if("setKeepAlive" in this.client){
        this.client.setKeepAlive(true);
    }else if(this.client.socket && "setKeepAlive" in this.client.socket){
        this.client.socket.setKeepAlive(true); // secure connection
    }
    
    this.client.on("data", this._onData.bind(this));
    this.client.on("close", this._onClose.bind(this));
    this.client.on("end", this._onEnd.bind(this));
};

IMAPClient.prototype.close = function(){
    var socket = this.client.socket || this.client;
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
        line, match, envelopeData;
    
    if(this._remainder){
        data = this._remainder + data;
        this._remainder = "";
    }
    
    if(this._currentMode == this.modes.DATA){
        if(this._expectedDataLength <= data.length){
            
            if(this._expectedDataLength){
                
                if(!this._streamLiteral){
                    this.lineparser.writeLiteral(data.substr(0, this._expectedDataLength));
                }else{
                    this.emit("messageData", this._streamedMessage, new Buffer(data.substr(0, this._expectedDataLength), "binary"));
                    this.emit("messageEnd", this._streamedMessage);
                }
                
                this._remainder = data.substr(this._expectedDataLength);
                this._expectedDataLength = 0;
            }else{
                this._remainder = data;
            }
            this._currentMode = this.modes.COMMAND;
            
            return this._onData(); // rerun with the remainder
        }else{
            
            if(!this._streamLiteral){
                this.lineparser.writeLiteral(data);
            }else{
                this.emit("messageData", this._streamedMessage, new Buffer(data, "binary"));
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
                
                if(this._streamLiteral){
                    envelopeData = this.lineparser.finalize() || [];
                    this._streamedMessage = this._formatEnvelope(envelopeData[3]);
                    this.emit("message", this._streamedMessage);
                    this.lineparser.writeLiteral("");
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


IMAPClient.prototype._send = function(data, callback){
    
    if(this._idleing){
        this._idleing = false;
        clearTimeout(this._idleTimer);
        
        if(this.debug){
            console.log("CLIENT: DONE");
        }
        
        this.client.write("DONE\r\n");
    }
    
    
    data = (data || "").toString();
    var tag = "A" + (++this._tagCounter);
    
    this._commandQueue.push({tag: tag, data: tag + " " + data + "\r\n", callback: callback});
    
    if(!this._currentTag){
        this._processCommandQueue();
    }
};

IMAPClient.prototype._processCommandQueue = function(){
    var command = this._commandQueue.shift();
    if(!command){
        return;
    }
    
    this.client.write(command.data);
    
    if(this.debug){
        console.log("CLIENT: "+ (command.data || "").trim());
    }
    
    this._currentTag = {
        tag: command.tag,
        callback: (function(status, params){
            if(typeof command.callback == "function"){
                command.callback(status, params);
            }
            this._currentTag = false;
            this._processCommandQueue();
        }).bind(this)
    }
}

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
        this.fetchMailboxes(this._selectDefaultMailbox.bind(this));
    }
};

IMAPClient.prototype._postCapability = function(){
    if(this._currentState == this.states.NONAUTH){
        this._updatedCapabilities = false;
        this._send("LOGIN "+this._escapeString(this.options.auth.user)+" "+
            this._escapeString(this.options.auth.pass), this._handlerTaggedLogin.bind(this));
    }else if(this._currentState == this.states.AUTH){
       this._postAuth();
    }else{
        throw new Error("Unhandled event state");
    }
};

IMAPClient.prototype._handlerTaggedStartTLS = function(status){
    if(status == "OK"){
        this._ignoreData = true;
        starttls(this.client, (function(socket){

            this.client = socket;
            this._ignoreData = false;
            this._secureMode = true;
            this.client.on("data", this._onData.bind(this));
            
            if("setKeepAlive" in this.client){
                this.client.setKeepAlive(true);
            }else if(this.client.socket && "setKeepAlive" in this.client.socket){
                this.client.socket.setKeepAlive(true); // secure connection
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
        this.fetchMailboxes(this._selectDefaultMailbox.bind(this));
    }else{
        throw new Error("Unhandled event namespace");
    }
};

IMAPClient.prototype._handlerTaggedSelect = function(status, params){
    if(status == "OK"){
        
        if(Array.isArray(params) && params[0] && params[0].params){
            if(params[0].params[0] == "READ-WRITE"){
                this._selectedMailbox.readOnly = false;
            }else if(params[0].params[0] == "READ-ONLY"){
                this._selectedMailbox.readOnly = true;
            }
        }

        this.emit("mailbox", this._selectedMailbox);
        
    }else{
        this.emit("error", new Error("Mailbox select failed"));
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
        this._postList(callback);
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
        this._postList(callback);
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
}

IMAPClient.prototype._postList = function(callback){
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

IMAPClient.prototype._handlerUntaggedSearch = function(list){
    
    //console.log(list);
}

IMAPClient.prototype._handlerUntaggedFetch = function(list){
    var nr = list[0] || 0,
        envelope = list[1] || [],
        nextUID = Number(this._selectedMailbox.UIDNext) || 0,
        currentUID = Number(envelope[1]) || 0;
        
    if(!nextUID || nextUID <= currentUID){
        this._selectedMailbox.UIDNext = currentUID+1;
    }
    
    if(this._collectMailList){
        this._mailList.push(this._formatEnvelope((list || [])[3]));
    }
    //console.log(require("util").inspect(list, false, 11));
}

IMAPClient.prototype._escapeString = function(str){
    return "\"" + str.replace(/(["\\])/g, "\\$1").replace(/[\r\n]/g, " ") + "\"";
};

IMAPClient.prototype._responseRouter = function(data){
    if(!data || !Array.isArray(data)){
        return;
    }
    
    if(this._currentTag && this._currentTag.tag == data[0]){
        this._currentTag.callback(data[1], data.slice(2));
        return;
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
            this._selectedMailbox.count = Number(data[1]) || this._selectedMailbox.count || 0;
            if(this._idleing){
                this._checkNewMail();
            }
            return;
        }
        
        
    }
};

IMAPClient.prototype.fetchMail = function(uid, callback){
    uid = Number(uid) || 0;
    
    if(!uid){
        if(typeof callback == "function"){
            callback(new Error("Invalid UID value"));
        }
        return;
    }
    
    this._collectMailList = true;
    this._mailList = [];
    this._streamLiteral = true;
    
    this._send("UID FETCH "+uid+":"+uid+" (UID FLAGS ENVELOPE BODY[])", (function(status){
        this._collectMailList = false;
        this._streamLiteral = false;
        
        if(typeof callback != "function"){
            return;
        }
        
        if(status == "OK"){
            callback(null, !!this._mailList.length);
        }else{
            callback(new Error("Error fetching list"));
        }
    }).bind(this));
}

IMAPClient.prototype.listMail = function(from, count, callback){
    from = Number(from) || 0;
    
    if(typeof count == "function" && !callback){
        callback = count; 
        count = undefined;
    }
    
    count = Number(count) || 0;
    
    var to;
    
    if(from < 0){
        from = this._selectedMailbox.count + from;
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
}

IMAPClient.prototype._checkNewMail = function(err, mailboxList){
    if(isNaN(this._selectedMailbox.UIDNext)){
        return;
    }
    
    
    this._send("UID FETCH "+this._selectedMailbox.UIDNext+":* (FLAGS ENVELOPE)");
}

IMAPClient.prototype._selectDefaultMailbox = function(err, mailboxList){
    if(err){
        this.emit("error", err);
        return;
    }
    this.selectMailbox();
}

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
    };    
    
    var message = {
        UIDValidity: this._selectedMailbox.UIDValidity
    }
    
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

}

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
    }
}

IMAPClient.prototype.selectMailbox = function(mailboxName){
    mailboxName = mailboxName || this._inboxName || "INBOX";
    
    this._selectedMailbox = {
        name: mailboxName
    };
    
    this._send("SELECT "+this._escapeString(mailboxName), this._handlerTaggedSelect.bind(this));
};

IMAPClient.prototype.fetchMailboxes = function(callback){
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
    this._send("IDLE");
    this._idleing = true;
    this._idleTimer = setTimeout(this._handlerIdleTimeout.bind(this), 60*1000);
}

