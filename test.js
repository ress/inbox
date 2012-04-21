
function CommandParser(){
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

CommandParser.prototype.states = ["DEFAULT", "LITERAL", "QUOTED"];

CommandParser.prototype.write = function(chunk){
	chunk = (chunk || "").toString("binary");
	this.parseLine(chunk);
	return true;
}


CommandParser.prototype.parseLine = function(line){

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
                	this.branch.nodes.push(this.node);
                	this.state = "DEFAULT";
                	this.node = {
                        parentNode: this.branch,
                        value: "",
                        nodes: []
                    }
                }
                break;
            case '\\':
                if(this.escaped || this.state == "LITERAL"){
                	this.node.value += curchar;
                }else if(this.state == "QUOTED"){
                	this.escaped = true;
                }else if(this.state == "DEFAULT"){
                	this.state = "LITERAL";
                	this.node = {
                        parentNode: this.branch,
                        value: curchar,
                        nodes: []
                    }
                }
                break;
            case '"':
            case "'":
                if(this.escaped || (this.state == "QUOTED" && this.quoteMark != curchar)){
                	this.node.value += curchar;
                }else if(this.state == "DEFAULT"){
                	this.quoteMark = curchar;
                	this.state = "QUOTED";
                    node = {
                        parentNode: this.branch,
                        value: "",
                        nodes: []
                    }
                }else if(this.state == "QUOTED"){
                	this.branch.nodes.push(this.node);
                	this.state = "DEFAULT";
                	this.node = {
                        parentNode: this.branch,
                        value: "",
                        nodes: []
                    }
                }else if(this.state == "LITERAL"){
                	this.branch.nodes.push(this.node);
                	this.quoteMark = curchar;
                	this.state = "QUOTED";
                    node = {
                        parentNode: this.branch,
                        value: "",
                        nodes: []
                    }
                }
                break;
            case "[":
            case "(":
                if(this.escaped || this.state=="QUOTED"){
                	this.node.value += curchar;
                    break;
                }

                if(this.state == "LITERAL"){
                	this.branch.nodes.push(this.node);
                }
                
                this.state = "DEFAULT";
                this.branch = this.branch.nodes[this.branch.nodes.length-1] || this.tree;

                this.node = {
                    parentNode: this.branch,
                    value: "",
                    nodes: []
                }
                break;
            case "]":
            case ")":
                if(this.escaped || this.state=="QUOTED"){
                	this.node.value += curchar;
                    break;
                }
                
                if(this.state == "LITERAL"){
                	this.branch.nodes.push(this.node);
                }
                
                this.state = "DEFAULT";
                this.branch = this.branch.parentNode || this.branch;
                
                this.node = {
                    parentNode: this.branch,
                    value: "",
                    nodes: []
                }
                break;
            default:
                if(this.state == "LITERAL" || this.state == "QUOTED"){
                	this.node.value += curchar;
                }else{
                	this.state = "LITERAL";
                	this.node = {
                        parentNode: this.branch,
                        value: curchar,
                        nodes: []
                    }
                }
        }
        
        if(this.escaped && curchar != "\\"){
        	this.escaped = false;
        }
        
        i++;
    }
    
}

CommandParser.prototype.end = function(){
	if(this.node.value){
	    if(this.state == "LITERAL" || this.state=="QUOTED"){
	    	this.branch.nodes.push(this.node);
	    }
	}
	console.log(require("util").inspect(this.tree, false, 7));
}


var cp = new CommandParser();

cp.write("14 FETCH (FL\\AGS (\\Seen \\Dele");
cp.write("ted)) * 12 FETCH (RFC822 {342}");
cp.end();

//console.log(require("util").inspect(parseLine("14 FETCH (FL\\AGS (\\Seen \\Dele"), false, 7));

