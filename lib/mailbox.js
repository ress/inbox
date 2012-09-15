var mailboxNames = require("./names.json");

/**
 * Expose to the world
 * @namespace mailbox
 */
module.exports.Mailbox = Mailbox;
module.exports.detectMailboxType = detectMailboxType;

/**
 * Create a mailbox object
 * 
 * @memberOf mailbox
 * @constructor
 * @param {Object} options Options object
 */
function Mailbox(options){
    options = options || {};

    Object.defineProperty(this, "client", {
        value: options.client || {},
        enumerable: false
    });
    
    Object.defineProperty(this, "tags", {
        value: options.tags || [],
        enumerable: false
    });

    this.name = options.name || "";
    this.path = options.path || this.name;
    this.type = options.type || (this.client._capabilities.indexOf("XLIST")<0 && this.detectType() || "Normal");
    this.delimiter = options.delimiter || this.client._mailboxDelimiter || "";
}

/**
 * Open the mailbox
 * 
 * @param {Object} [options] Optional options object
 * @param {Boolean} [options.readOnly] If set to true, open the mailbox in read-only mode (seen/unseen flags won't be touched)
 * @param {Function} callback Callback function to run when the mailbox is opened
 */
Mailbox.prototype.open = function(options, callback){
    this.client.openMailbox(this.path, options, callback);
};

/**
 * Detects the type by the name of the mailbox
 */
Mailbox.prototype.detectType = function(){
    return detectMailboxType(this.name);
};

/**
 * Lists children for the mailbox
 * 
 * @param {String} [path] If set, list only selected path info but not the children
 * @param {Function} callback Callback function to run with the mailbox list
 */
Mailbox.prototype.listChildren = function(path, callback){
    if(!callback && typeof path == "function"){
        callback = path;
        path = undefined;
    }
    
    var command = "LIST", suffix = "";
    
    path = this.client._escapeString(path || (this.path ? this.path + this.delimiter + "%":"%"));
    
    if(this.client._capabilities.indexOf("SPECIAL-USE")>=0){
        command = "LIST";
        suffix = " RETURN (SPECIAL-USE)";
    }else if(this.client._capabilities.indexOf("XLIST")>=0){
        command = "XLIST";
    }
    
    this.client._send(command+" "+this.client._escapeString(this.client._rootPath) + " " + path + suffix,
        (function(status){
            this.listSubscribed(path, this.client._mailboxList, callback);
        }).bind(this),
        (function(){
            this.client._mailboxList = [];
        }).bind(this));
    
};

/**
 * Fetches subscribed mailboxes
 * 
 * @param {String} path Parent mailbox
 * @param {Array} xinfo Results from XLIST or LIST
 * @param {Function} callback Callback function to run with the mailbox list 
 */
Mailbox.prototype.listSubscribed = function(path, xinfo, callback){
    if(!callback && typeof xinfo == "function"){
        callback = xinfo;
        xinfo = undefined;
    }
    
    xinfo = xinfo || [];

    this.client._send("LSUB "+this.client._escapeString(this.client._rootPath)+" "+path, 
        this.client._handlerTaggedLsub.bind(this.client, xinfo, callback), 
        (function(){
            this.client._mailboxList = [];
        }).bind(this));
};

/**
 * Creates a new mailbox and subscribes to it
 * 
 * @param {String} name Name of the mailbox
 * @param {Function} callback Callback function to run with the created mailbox object
 */
Mailbox.prototype.createChild = function(name, callback){
    var path = (this.path ? this.path + this.delimiter + name:name);
    this.client._send("CREATE "+this.client._escapeString(path), (function(status){
        if(status == "OK"){
            this.client._send("SUBSCRIBE "+this.client._escapeString(path), (function(status){
                if(typeof callback == "function"){
                    callback(null, new this.client.Mailbox({
                        client: this.client,
                        path: path,
                        name: name,
                        delimiter: this.delimiter,
                        tags: []
                    }));
                }
            }).bind(this));
        }else{
            callback(new Error("Creating mailbox failed"));
        }
    }).bind(this));
};

/**
 * Returns mailbox type detected by the name of the mailbox
 *
 * @param {String} mailboxName Mailbox name
 * @return {String} Mailbox type
 */
function detectMailboxType(mailboxName){
    mailboxName = (mailboxName || "").toString().trim().toLowerCase();

    if(mailboxNames.sent.indexOf(mailboxName)>=0){
        return "Sent";
    }
    
    if(mailboxNames.trash.indexOf(mailboxName)>=0){
        return "Trash";
    }
    
    if(mailboxNames.junk.indexOf(mailboxName)>=0){
        return "Junk";
    }
    
    if(mailboxNames.drafts.indexOf(mailboxName)>=0){
        return "Drafts";
    }
    
    return "Normal";   
}