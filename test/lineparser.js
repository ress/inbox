var testCase = require('nodeunit').testCase,
    IMAPLineParser = require("../lib/lineparser");
    

exports["Type tests"] = {
		
    "Single atom": function(test){
    	var lp = new IMAPLineParser();
    	
    	test.expect(1);
    	
    	lp.on("line", function(data){
    		test.deepEqual(data, ["TAG1"]);
    		test.done();
    	});
    	
    	lp.end("TAG1");
    },
    
    "Multiple atoms": function(test){
    	var lp = new IMAPLineParser();
    	
    	test.expect(1);
    	
    	lp.on("line", function(data){
    		test.deepEqual(data, ["TAG1", "UID", "FETCH"]);
    		test.done();
    	});
    	
    	lp.end("TAG1 UID FETCH");
    },
    
    "Single quoted": function(test){
    	var lp = new IMAPLineParser();
    	
    	test.expect(1);
    	
    	lp.on("line", function(data){
    		test.deepEqual(data, ["TAG1"]);
    		test.done();
    	});
    	
    	lp.end("\"TAG1\"");
    },
    
    "Multiword quoted": function(test){
    	var lp = new IMAPLineParser();
    	
    	test.expect(1);
    	
    	lp.on("line", function(data){
    		test.deepEqual(data, ["TAG1 UID FETCH"]);
    		test.done();
    	});
    	
    	lp.end("\"TAG1 UID FETCH\"");
    },
    
    "Atom + quoted": function(test){
    	var lp = new IMAPLineParser();
    	
    	test.expect(1);
    	
    	lp.on("line", function(data){
    		test.deepEqual(data, ["TAG1", "UID FETCH"]);
    		test.done();
    	});
    	
    	lp.end("TAG1 \"UID FETCH\"");
    },
    
    "Single literal": function(test){
    	var lp = new IMAPLineParser();
    	
    	test.expect(1);
    	
    	lp.on("line", function(data){
    		test.deepEqual(data, ["TAG1", "ABC DEF\r\nGHI JKL", "TAG2"]);
    		test.done();
    	});
    	
    	lp.write("TAG1 {123}");
    	lp.writeLiteral("ABC DEF\r\nGHI JKL");
    	lp.end("\"TAG2\"");
    }
}

exports["Structure tests"] = {
	"Single group": function(test){
    	var lp = new IMAPLineParser();
    	
    	test.expect(1);
    	
    	lp.on("line", function(data){
    		test.deepEqual(data, ["TAG1", "FETCH", ["NAME", "HEADER", "BODY"]]);
    		test.done();
    	});
    	
    	lp.end("TAG1 FETCH (NAME HEADER BODY)");
    },
    
    "Nested group": function(test){
    	var lp = new IMAPLineParser();
    	
    	test.expect(1);
    	
    	lp.on("line", function(data){
    		test.deepEqual(data, ["TAG1", "FETCH", ["NAME", "HEADER", "BODY", ["CHARSET", "UTF-8"]]]);
    		test.done();
    	});
    	
    	lp.end("TAG1 FETCH (NAME HEADER BODY (CHARSET \"UTF-8\"))");
    },
    
    "Single params": function(test){
    	var lp = new IMAPLineParser();
    	
    	test.expect(1);
    	
    	lp.on("line", function(data){
    		test.deepEqual(data, ["TAG1", {value:"BODY", params: ["DATE", "TEXT"]}]);
    		test.done();
    	});
    	
    	lp.end("TAG1 BODY[DATE TEXT]");
    },
    
    "Partial data": function(test){
    	var lp = new IMAPLineParser();
    	
    	test.expect(1);
    	
    	lp.on("line", function(data){
    		test.deepEqual(data, ["TAG1", {value:"BODY", partial: [122, 456]}]);
    		test.done();
    	});
    	
    	lp.end("TAG1 BODY[]<122.456>");
    },
    
    "Mixed params and partial": function(test){
    	var lp = new IMAPLineParser();
    	
    	test.expect(1);
    	
    	lp.on("line", function(data){
    		test.deepEqual(data, ["TAG1", {value:"BODY", params: ["HEADER", "FOOTER"], partial: [122, 456]}]);
    		test.done();
    	});
    	
    	lp.end("TAG1 BODY[HEADER FOOTER]<122.456>");
    },
    
    "Nested params and groups": function(test){
    	var lp = new IMAPLineParser();
    	
    	test.expect(1);
    	
    	lp.on("line", function(data){
    		test.deepEqual(data, ["TAG1", {value:"BODY", params: ["DATE", "FLAGS", ["\\Seen", "\\Deleted"]]}]);
    		test.done();
    	});
    	
    	lp.end("TAG1 BODY[DATE FLAGS (\\Seen \\Deleted)]");
    }
}