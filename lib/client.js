
var Stream = require("stream").Stream,
    utillib = require("util"),
    net = require("net"),
    tls = require("tls"),
    starttls = require("./starttls").starttls,
    IMAPLineParser = require("./lineparser");

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
}

IMAPClient.prototype.modes = {
    COMMAND: 0x1,
    DATA: 0x2
}

IMAPClient.prototype._init = function(){
    
    this.options.secureConnection = !!this.options.secureConnection;
    this.options.auth = this.options.auth || false;
    
    this.client = false;
    
    this._secureMode = !!this.options.secureConnection;
    this._currentState = this.states.NONAUTH;
    this._currentMode = this.modes.COMMAND;
    
    this._expectedDataLength = 0;
    
    this._tagCounter = 0;
    this._tagQueue = {};
    this._remainder = "";
    
    this._capabilites = [];
    this._updatedCapabilities = false;
    
    this._selectedMailbox = {};
    
    this._mailboxRoot = "";
    this._mailboxDelimiter = "/";
    
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
}

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
                this._processData(data.substr(0, this._expectedDataLength));
                this._remainder = data.substr(this._expectedDataLength);
                this._expectedDataLength = 0;
            }else{
                this._remainder = data;
            }
            this._currentMode == this.modes.COMMAND;
            return this._onData.bind(); // rerun with the remainder
        }else{
            this.lineparser.writeLiteral(data);
            this._expectedDataLength -= data.length;
            return;
        }
    }
    
    if(this._currentMode == this.modes.COMMAND){
        if((match = data.match(/\r?\n/))){ // find the line ending
            line = data.substr(0, match.index);
            this._remainder = data.substr(match.index + match[0].length) || "";
 
            if((match = line.match(/\{(\d+)\}\s*$/))){
                this._expectedDataLength = Number(match[0]);
                this._currentMode = this.modes.DATA;
                this.lineparser.write(line);
            }else{
                if(this.debug){
                    console.log("SERVER: "+line);
                }
                this.lineparser.end(line);
            }
 
            if(this._remainder){
                return this._onData(); // rerun with the remainder
            }
        }else{
            this._remainder = data; // keep it for later
        }
    }
}

IMAPClient.prototype._onClose = function(){
    if(this.debug){
        console.log("EVENT: CLOSE");
    }
}

IMAPClient.prototype._onEnd = function(){
    if(this.debug){
        console.log("EVENT: END");
    }
}

IMAPClient.prototype._onError = function(error){
    throw error;
}

IMAPClient.prototype._onServerResponse = function(data){
    this._currentHandler(data);
};


IMAPClient.prototype._send = function(data, callback){
    data = (data || "").toString();
    var tag = "A" + (++this._tagCounter);
    this.client.write(tag + " " + data + "\r\n");
    
    if(this.debug){
        console.log("CLIENT: "+ tag + " " + data)
    }
    
    this._tagQueue[tag] = (function(status, params){
        delete this._tagQueue[tag];
        callback(status, params);
    }).bind(this);
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

}

IMAPClient.prototype._handlerTaggedCapability = function(status){
    if(status == "OK"){
        if(!this._secureMode && this._capabilites.indexOf("STARTTLS")>=0){
            this._send("STARTTLS", this._handlerTaggedStartTLS.bind(this));
            return;
        }
        
        this._postCapability();
    }
}

IMAPClient.prototype._postAuth = function(){
     if(this._capabilites.indexOf("NAMESPACE")>=0){
        this._send("NAMESPACE", this._handlerTaggedNamespace.bind(this));
    }else{
        this.selectMailbox();
    }
}

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
}

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
        throw new Error("Unhandled event starttls")
    }
}

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
}


IMAPClient.prototype._handlerTaggedNamespace = function(status){
    if(status == "OK"){
        this.selectMailbox();
    }else{
        throw new Error("Unhandled event namespace")
    }
}

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
}

IMAPClient.prototype._handlerUntaggedCapability = function(list){
    this._updatedCapabilities = true;
    this._capabilites = list;
}

IMAPClient.prototype._handlerUntaggedNamespace = function(list){
    // check only personal inbox, skip others
    if(Array.isArray(list[0] && list[0][0])){
        this._mailboxRoot = list[0][0][0];
        this._mailboxDelimiter = list[0][0][1];
    }
}

IMAPClient.prototype.selectMailbox = function(mailbox){
    mailbox = mailbox || "INBOX";
    this._selectedMailbox = {
        name: mailbox
    };
    this._send("SELECT "+this._escapeString(mailbox), this._handlerTaggedSelect.bind(this));
}

IMAPClient.prototype._escapeString = function(str){
    return "\"" + str.replace(/(["\\])/g, "\\$1").replace(/[\r\n]/g, " ") + "\"";
}

IMAPClient.prototype._responseRouter = function(data){
    if(!data || !Array.isArray(data)){
        return;
    }
    
    if(data[0] in this._tagQueue){
        this._tagQueue[data[0]](data[1], data.slice(2));
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
                this._selectedMailbox.flags = data[2] || [];
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
        
        if(data.length == 3 && data[2] == "EXISTS"){
            this._selectedMailbox.count = data[1];
        }
        
    }
}