
var Stream = require("stream").Stream,
    utillib = require("util"),
    net = require("net"),
    tls = require("tls"),
    starttls = require("./starttls").starttls;

var STATES = ["NONAUTH", "AUTH", "SELECTED", "LOGOUT"],
    MODES = ["COMMAND", "DATA"];

function IMAPClient(port, host, options){
    Stream.call(this);
    
    this.writable = true;
    this.readable = true;
    
    this.options = options || {};
    
    this.port = port || (this.options.secureConnection ? 993 : 143);
    this.host = host || "localhost";
    
    this.options.secureConnection = !!this.options.secureConnection;
    this.options.auth = this.options.auth || false;
    
    this.client = false;
    
    this._secureMode = !!this.options.secureConnection;
    this._currentState = "NONAUTH";
    this._currentMode = "COMMAND";
    
    this._expectedDataLength = 0;
    
    this._tagCounter = 0;
    this._tagQueue = [];
    this._remainder = "";
    
    this._init();
}
utillib.inherits(IMAPClient, Stream);

IMAPClient.prototype._init = function(){};

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

IMAPClient.prototype._onData = function(chunk){
    var data = chunk && chunk.toString("binary") || "",
        line, match;
        
    if(this._remainder){
        data = this._remainder + chunk;
        this._remainder = "";
    }
    
    if(this._currentMode == "DATA"){
        if(this._expectedDataLength <= data.length){
            if(this._expectedDataLength){
                this._processData(data.substr(0, this._expectedDataLength));
                this._remainder = data.substr(this._expectedDataLength);
                this._expectedDataLength = 0;
            }else{
                this._remainder = data;
            }
            this._currentMode == "COMMAND";
            return this._onData.bind(); // rerun with the remainder
        }else{
            this._processData(data);
            this._expectedDataLength -= data.length;
            return;
        }
    }
    
    if(this._currentMode == "COMMAND"){
        if((match = data.match(/\r?\n/))){ // find the line ending
            line = data.substr(0, match.index);
            this._remainder = data.substr(match.index + match[0].length);
             
            this._processCommand(line);
 
            if(this._remainder){
                return this._onData.bind(); // rerun with the remainder
            }
        }else{
            this._remainder = data; // keep it for later
        }
    }
}

IMAPClient.prototype._processData = function(data){};

IMAPClient.prototype._processCommand = function(line){
    var match,
        tokens,
        token,
        quoteType, quotedStr, tokenArr = [];
    
    var tokenTree = {nodes: []}, tokenBranch = tokenTree, curToken, lastToken;
    
    tokens = (line || "").trim().split(/\s+/);
    
    for(var i=0, len = tokens.length; i<len; i++){
        token = quotedStr = tokens[i];
        
        curToken = {
            nodes:[]
        };
        
        if(token.charAt(0).match(/[\(]/)){
            // one step down
            token = token.substr(1);
            tokenBranch = lastToken;
        }
        
        if(token.charAt(0).match(/["]/)){
            quoteType = token.charAt(0);
            
            if(quotedStr.length <= 1 || quotedStr.substr(-1) != quoteType){
                for(i++; i<len; i++){
                    token = tokens[i];
                    quotedStr += " "+token;
                    if(quotedStr.length>1 && quotedStr.substr(-1) == quoteType){
                        break;
                    }
                }
            }
            
            if(quotedStr.charAt(0) == quoteType){
                quotedStr = quotedStr.substr(1);
            }
            if(quotedStr.charAt(quotedStr.length-1) == quoteType){
                quotedStr = quotedStr.substr(0, quotedStr.length-1);
            }
            
            quotedStr = quotedStr.replace(/\\(.)/g, "$1");
            token = quotedStr;
        }
        
        if(token.charAt(token.length-1).match(/[\)]/)){
            // one step up
            token = token.substr(0, token.length-1);
            tokenBranch = tokenBranch.parentNode || tokenBranch;
        }
        
        curToken.value = token;
        curToken.parentNode = tokenBranch;
        tokenBranch.nodes.push(curToken);
        
        lastToken = curToken;
    }
    
   
    if((match = line.match(/\{(\d+)\}\s*$/))){
        this._expectedDataLength = Number(match[0]);
        this._currentMode = "DATA";
        // START DATA PROCESSING
    }
    
    if(command.trim() == ")"){
        // END DATA PROCESSING
    }
    
};

IMAPClient.prototype._onClose = function(){
    console.log("close");
}

IMAPClient.prototype._onEnd = function(){
    console.log("end");
}

IMAPClient.prototype._onError = function(error){
    throw error;
}

var imap = new IMAPClient(false, "imap.gmail.com", {secureConnection: true});
imap.connect();