function processLine1(line){
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
            
            if(quotedStr.length <= 1 || quotedStr.match(new RegExp("(\\\\.|[^"+quoteType+"])$"))){
                for(i++; i<len; i++){
                    token = tokens[i];
                    quotedStr += " "+token;
                    if(quotedStr.length>1 && quotedStr.match(new RegExp("[^\\\\]"+quoteType+"$"))){
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
            
            curToken.value = token;
            curToken.parentNode = tokenBranch;
            tokenBranch.nodes.push(curToken);
            
            tokenBranch = tokenBranch.parentNode || tokenBranch;
        }else{
            curToken.value = token;
            curToken.parentNode = tokenBranch;
            tokenBranch.nodes.push(curToken);
        }
        
        lastToken = curToken;
    }
    
    
    console.log(require("util").inspect(tokenTree, false, 7));
}


function parseLine(line){
    var i=0, curchar;
    
    var states = ["DEFAULT", "LITERAL", "QUOTED"],
        state = "DEFAULT",    
        quoteMark,
        escaped = false,
        
        tree = {
            nodes: []
        },
        branch = tree,
        node = {
            parentNode: branch,
            value: "",
            nodes: []
        };
    
    while(i < line.length){
        
        curchar = line[i].charAt(0);
        
        switch(curchar){
            case " ":
            case "\t":
                if(state == "QUOTED"){
                    node.value += curchar;
                }else if(state == "LITERAL" && escaped){
                    node.value += curchar;
                }else if(state == "LITERAL"){
                    branch.nodes.push(node);
                    state = "DEFAULT";
                    node = {
                        parentNode: branch,
                        value: "",
                        nodes: []
                    }
                }
                break;
            case '\\':
                if(escaped){
                    node.value += curchar;
                }else if(state == "LITERAL" || state == "QUOTED"){
                    escaped = true;
                }else if(state == "DEFAULT"){
                    escaped = true;
                    state = "LITERAL";
                }
                break;
            case '"':
            case "'":
                if(escaped || (state == "QUOTED" && quoteMark != curchar)){
                    node.value += curchar;
                }else if(state == "DEFAULT"){
                    quoteMark = curchar;
                    state = "QUOTED";
                    node = {
                        parentNode: branch,
                        value: "",
                        nodes: []
                    }
                }else if(state == "QUOTED"){
                    branch.nodes.push(node);
                    state = "DEFAULT";
                    node = {
                        parentNode: branch,
                        value: "",
                        nodes: []
                    }
                }else if(state == "LITERAL"){
                    branch.nodes.push(node);
                    quoteMark = curchar;
                    state = "QUOTED";
                    node = {
                        parentNode: branch,
                        value: "",
                        nodes: []
                    }
                }
                break;
            case "[":
            case "(":
                if(escaped || state=="QUOTED"){
                    node.value += curchar;
                    break;
                }

                if(state == "LITERAL"){
                    branch.nodes.push(node);
                }
                
                state = "DEFAULT";
                branch = branch.nodes[branch.nodes.length-1] || tree;


                node = {
                    parentNode: branch,
                    value: "",
                    nodes: []
                }
                break;
            case "]":
            case ")":
                if(escaped || state=="QUOTED"){
                    node.value += curchar;
                    break;
                }
                
                if(state == "LITERAL"){
                    branch.nodes.push(node);
                }
                
                state = "DEFAULT";
                branch = branch.parentNode || branch;
                
                node = {
                    parentNode: branch,
                    value: "",
                    nodes: []
                }
                break;
            default:
                if(state == "LITERAL" || state == "QUOTED"){
                    node.value += curchar;
                }else{
                    state = "LITERAL";
                    node = {
                        parentNode: branch,
                        value: curchar,
                        nodes: []
                    }
                }
        }
        
        if(escaped && curchar != "\\"){
            escaped = false;
        }
        
        i++;
    }
    
    if(node.value){
        if(state == "LITERAL" || state=="QUOTED"){
            branch.nodes.push(node);
        }
    }
    
    return tree;
}



processLine2('14 FETCH (FLAGS (\Seen \Deleted)) * 12 FETCH (RFC822 {342}');