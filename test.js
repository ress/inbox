

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



console.log(require("util").inspect(parseLine('14 FETCH (FL\\ AGS (\Seen \Deleted)) * 12 FETCH (RFC822 {342}'), false, 7));