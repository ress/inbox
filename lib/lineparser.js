var Stream = require("stream").Stream,
    utillib = require("util");
    
// expose to the world
module.exports = IMAPLineParser;

/**
 * Creates a reusable parser for parsing. It is a writable stream for piping
 * data directly in.
 * 
 * @constructor
 */
function IMAPLineParser(){
	Stream.call(this);
	this.writable = true;
	
    this._init();
}
utillib.inherits(IMAPLineParser, Stream);

/**
 * Possible states the parser can be in (Finite State Machine)
 */
IMAPLineParser.prototype.states = {
	DEFAULT: 0x1,
	ATOM: 0x2,
	QUOTED: 0x3
};


IMAPLineParser.prototype.types = {
	STRING: 0x1,
	GROUP: 0x2,
	PARAMS: 0x3
};

// PUBLIC METHODS

/**
 * Adds a chunk for parsing 
 */
IMAPLineParser.prototype.write = function(chunk){
    chunk = (chunk || "").toString("binary");
    this._parseLine(chunk);
    return true;
};

IMAPLineParser.prototype.writeLiteral = function(chunk){
    if(!this.currentNode.value){
        this.currentNode.value = "";
    }
    
    if(!this.currentNode._isLiteral){
        this.currentNode.value = "";
        this.currentNode._isLiteral = true;
    }
    
    this.currentNode.value += (chunk || "").toString("binary");
};


IMAPLineParser.prototype.end = function(chunk){
	if(chunk && chunk.length){
		this.write(chunk);
	}
	
    if(this.currentNode.value){
        if(this._state == this.states.ATOM || this._state==this.states.QUOTED){
            this._branch.childNodes.push(this.currentNode);
        }
    }
    
    var tree = this.finalize();
    
    this._init();
    
    process.nextTick(this.emit.bind(this, "line", tree));
};

IMAPLineParser.prototype.finalize = function(){
    var tree = [];
    this._nodeWalker(this._parseTree.childNodes, tree);
    return tree;
};

// PRIVATE METHODS

IMAPLineParser.prototype._init = function(){
    this._state = this.states.DEFAULT;    
    this._quoteMark = '';
    this._escapedChar = false;
    
    this._parseTree = {
        childNodes: []
    };
    
    this._branch = this._parseTree;
    
    this.currentNode = {
        parentNode: this._branch,
        value: "",
        childNodes: []
    };
};

IMAPLineParser.prototype._parseLine = function(line){

    var i=0, curchar;
    
    while(i < line.length){
        
        curchar = line[i].charAt(0);

        switch(curchar){
            case " ":
            case "\t":
                if(this._state == this.states.QUOTED){
                    this.currentNode.value += curchar;
                }else if(this._state == this.states.ATOM && this._escapedChar){
                    this.currentNode.value += curchar;
                }else if(this._state == this.states.ATOM){
                    this._addToBranch();
                    this._state = this.states.DEFAULT;
                    this._createNode();
                }
                break;
            case '\\':
                if(this._escapedChar || this._state == this.states.ATOM){
                    this.currentNode.value += curchar;
                }else if(this._state == this.states.QUOTED){
                    this._escapedChar = true;
                }else if(this._state == this.states.DEFAULT){
                    this._state = this.states.ATOM;
                    this._createNode(curchar);
                }
                break;
            case '"':
            case "'":
                if(this._escapedChar || (this._state == this.states.QUOTED && this._quoteMark != curchar)){
                    this.currentNode.value += curchar;
                }else if(this._state == this.states.DEFAULT){
                    this._quoteMark = curchar;
                    this._state = this.states.QUOTED;
                    this._createNode();
                }else if(this._state == this.states.QUOTED){
                    this._addToBranch();
                    this._state = this.states.DEFAULT;
                    this._createNode();
                }else if(this._state == this.states.ATOM){
                    this._addToBranch();
                    this._quoteMark = curchar;
                    this._state = this.states.QUOTED;
                    this._createNode();
                }
                break;
            case "[":
            case "(":
                if(this._escapedChar || this._state==this.states.QUOTED){
                    this.currentNode.value += curchar;
                    break;
                }

                if(this._state == this.states.ATOM){
                    this._addToBranch();
                }
                
                this._state = this.states.DEFAULT;
                
                // () gets a separate node, [] uses last node as parent
                if(curchar == "("){
                    // create new empty node
                    this._createNode(false);
                    this.currentNode.type = this.types.GROUP;
                    this._addToBranch();
                    
                    this._branch = this.currentNode || this._parseTree;
                    if(!this._branch.childNodes){
                        this._branch.childNodes = [];
                    }
                }else{
                    this._branch = this._branch.lastNode || this._parseTree;
                    this._branch.type = this.types.PARAMS;
                    if(!this._branch.childNodes){
                        this._branch.childNodes = [];
                    }
                }

                this._createNode();
                
                break;
            case "]":
            case ")":
                if(this._escapedChar || this._state==this.states.QUOTED){
                    this.currentNode.value += curchar;
                    break;
                }
                
                if(this._state == this.states.ATOM){
                    this._addToBranch();
                }
                
                this._state = this.states.DEFAULT;

                this._branch = this._branch.parentNode || this._branch;
                if(!this._branch.childNodes){
                    this._branch.childNodes = [];
                }
                
                this._createNode();
                break;
            default:
                if(this._state == this.states.ATOM || this._state == this.states.QUOTED){
                    this.currentNode.value += curchar;
                }else{
                    this._state = this.states.ATOM;
                    this._createNode(curchar);
                }
        }
        
        if(this._escapedChar && curchar != "\\"){
            this._escapedChar = false;
        }
        
        i++;
    }
    
};

IMAPLineParser.prototype._addToBranch = function(){
    this._branch.childNodes.push(this.currentNode);
    this._branch.lastNode = this.currentNode;
};

IMAPLineParser.prototype._createNode = function(defaultValue){
    this.lastNode = this.currentNode;
    
    this.currentNode = {};
    
    if(defaultValue !== false){
        this.currentNode.value = defaultValue || "";
    }
    
    this.currentNode.parentNode = this._branch;
};

IMAPLineParser.prototype._nodeWalker = function(branch, local){
    var node, i, len, curnode;

    for(i=0, len = branch.length; i<len; i++){
        node = branch[i];
        
        if(typeof node.value == "string" && !node.type){
            local.push(node.value);
        }else if(node.type == this.types.PARAMS){
            if(!node.childNodes.length){
                local.push(node.value);
            }else{
                curnode = {
                    value: node.value
                };
                local.push(curnode);
                curnode.params = [];
                this._nodeWalker(node.childNodes, curnode.params);
            }
            
        }else if(node.type == this.types.GROUP){
            curnode = [];
            local.push(curnode);
            this._nodeWalker(node.childNodes, curnode);
        }
    }
};

