
function RawResponseParser(){
	this.init();
}

RawResponseParser.prototype.states = ["DEFAULT", "LITERAL", "QUOTED"];

RawResponseParser.prototype.init = function(){
	this.state = "DEFAULT",    
	this.quoteMark = '';
	this.escaped = false;
    
	this.tree = {
        nodes: []
    };
	
	this.branch = this.tree;
	
	this.node = {
        parentNode: this.branch,
        value: "",
        nodes: []
    };
}

RawResponseParser.prototype.write = function(chunk){
	chunk = (chunk || "").toString("binary");
	this.parseLine(chunk);
	return true;
}

RawResponseParser.prototype.writeBlock = function(chunk){
	if(!this.node.value){
		this.node.value = "";
	}
	
	if(!this.node.block){
		this.node.value = "";
		this.node.block = true;
	}
	
	this.node.value += (chunk || "").toString("binary");
}

RawResponseParser.prototype.parseLine = function(line){

	var i=0, curchar;
	
    while(i < line.length){
        
        curchar = line[i].charAt(0);

        switch(curchar){
            case " ":
            case "\t":
                if(this.state == "QUOTED"){
                	this.node.value += curchar;
                }else if(this.state == "LITERAL" && this.escaped){
                	this.node.value += curchar;
                }else if(this.state == "LITERAL"){
                	this.addToBranch();
                	this.state = "DEFAULT";
                	this.createNode();
                }
                break;
            case '\\':
                if(this.escaped || this.state == "LITERAL"){
                	this.node.value += curchar;
                }else if(this.state == "QUOTED"){
                	this.escaped = true;
                }else if(this.state == "DEFAULT"){
                	this.state = "LITERAL";
                	this.createNode(curchar);
                }
                break;
            case '"':
            case "'":
                if(this.escaped || (this.state == "QUOTED" && this.quoteMark != curchar)){
                	this.node.value += curchar;
                }else if(this.state == "DEFAULT"){
                	this.quoteMark = curchar;
                	this.state = "QUOTED";
                	this.createNode();
                }else if(this.state == "QUOTED"){
                	this.addToBranch();
                	this.state = "DEFAULT";
                	this.createNode();
                }else if(this.state == "LITERAL"){
                	this.addToBranch();
                	this.quoteMark = curchar;
                	this.state = "QUOTED";
                	this.createNode();
                }
                break;
            case "[":
            case "(":
                if(this.escaped || this.state=="QUOTED"){
                	this.node.value += curchar;
                    break;
                }

                if(this.state == "LITERAL"){
                	this.addToBranch();
                }
                
                this.state = "DEFAULT";
                
                // () gets a separate node, [] uses last node as parent
                if(curchar == "("){
                	// create new empty node
                	this.createNode(false);
                	this.node.type = "GROUP";
                	this.addToBranch();
                    
                    this.branch = this.node || this.tree;
                    if(!this.branch.nodes){
                    	this.branch.nodes = [];
                    }
                }else{
                	this.branch = this.branch.lastNode || this.tree;
                	this.branch.type = "PARAMS";
                	if(!this.branch.nodes){
                    	this.branch.nodes = [];
                    }
                }

                this.createNode();
                
                break;
            case "]":
            case ")":
                if(this.escaped || this.state=="QUOTED"){
                	this.node.value += curchar;
                    break;
                }
                
                if(this.state == "LITERAL"){
                	this.addToBranch();
                }
                
                this.state = "DEFAULT";

                this.branch = this.branch.parentNode || this.branch;
                if(!this.branch.nodes){
                	this.branch.nodes = [];
                }
                
                this.createNode();
                break;
            default:
                if(this.state == "LITERAL" || this.state == "QUOTED"){
                	this.node.value += curchar;
                }else{
                	this.state = "LITERAL";
                	this.createNode(curchar);
                }
        }
        
        if(this.escaped && curchar != "\\"){
        	this.escaped = false;
        }
        
        i++;
    }
    
}

RawResponseParser.prototype.addToBranch = function(){
	this.branch.nodes.push(this.node);
	this.branch.lastNode = this.node;
}

RawResponseParser.prototype.createNode = function(value){
	this.lastNode = this.node;
	
	this.node = {};
	
	if(value !== false){
		this.node.value = value || "";
	}
	
	this.node.parentNode = this.branch;
}

RawResponseParser.prototype.end = function(){
	if(this.node.value){
	    if(this.state == "LITERAL" || this.state=="QUOTED"){
	    	this.branch.nodes.push(this.node);
	    }
	}
	
	var tree = this.finalize();
	
	this.init();
	
	return tree;
}

RawResponseParser.prototype.finalize = function(){
	var tree = [];
	walker(this.tree.nodes, tree);
	return tree;
	
	function walker(branch, local){
		var node, i, len, curnode;
		
		for(i=0, len = branch.length; i<len; i++){
			node = branch[i];
			
			if(typeof node.value == "string" && !node.type){
				local.push(node.value);
			}else if(node.type == "PARAMS"){
				if(!node.nodes.length){
					local.push(node.value);
				}else{
					curnode = {
						value: node.value
					};
					local.push(curnode);
					curnode.params = [];
					walker(node.nodes, curnode.params);
				}
				
			}else if(node.type == "GROUP" && node.nodes.length){
				curnode = [];
				local.push(curnode);
				walker(node.nodes, curnode);
			}
		}
	}
}

var cp = new RawResponseParser();

//cp.write("A654 FETCH 2:4 (FLAGS BODY[HEADER.FIELDS (DATE FROM)])");
//cp.write("* 23 FETCH (FLAGS (\\Seen) UID 4827313)");
/*
cp.write("* 12 FETCH (BODY[HEADER] {342}");
cp.writeBlock("TERE TERE");
cp.write(" BODY[RFC] {123}");
cp.writeBlock("VANA KERE");
cp.write(")");

cp.end();
*/
cp.write("* 12 FETCH (FLAGS (\\Seen) INTERNALDATE \"17-Jul-1996 02:44:25 -0700\" RFC822.SIZE 4286 ENVELOPE (\"Wed, 17 Jul 1996 02:23:25 -0700 (PDT)\" \"IMAP4rev1 WG mtg summary and minutes\" ((\"Terry Gray\" NIL \"gray\" \"cac.washington.edu\")) ((\"Terry Gray\" NIL \"gray\" \"cac.washington.edu\")) ((\"Terry Gray\" NIL \"gray\" \"cac.washington.edu\")) ((NIL NIL \"imap\" \"cac.washington.edu\")) ((NIL NIL \"minutes\" \"CNRI.Reston.VA.US\") (\"John Klensin\" NIL \"KLENSIN\" \"MIT.EDU\")) NIL NIL \"<B27397-0100000@cac.washington.edu>\") BODY (\"TEXT\" \"PLAIN\" (\"CHARSET\" \"US-ASCII\") NIL NIL \"7BIT\" 3028 92))");

//cp.write("* OK [ALERT] System shutdown in 10 minutes");

console.log(JSON.stringify(cp.end()))

//console.log(require("util").inspect(cp.end(), false, 11));

//console.log(require("util").inspect(parseLine("14 FETCH (FL\\AGS (\\Seen \\Dele"), false, 7));

