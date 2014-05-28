var IMAPLineParser = require("../lib/lineparser");

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
    },

    "NIL value": function(test){
        var lp = new IMAPLineParser();

        test.expect(1);

        lp.on("line", function(data){
            test.deepEqual(data, ["TAG1", null]);
            test.done();
        });

        lp.end("TAG1 NIL");
    },

    "NIL string": function(test){
        var lp = new IMAPLineParser();

        test.expect(1);

        lp.on("line", function(data){
            test.deepEqual(data, ["TAG1", "NIL"]);
            test.done();
        });

        lp.end("TAG1 \"NIL\"");
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
    },

    "Bound and unbound params": function(test){
        var lp = new IMAPLineParser();

        test.expect(1);

        lp.on("line", function(data){
            test.deepEqual(data, ["TAG1", {params: ["ALERT"]}, {value: "BODY", params:["TEXT", "HEADER"]}]);
            test.done();
        });

        lp.end("TAG1 [ALERT] BODY[TEXT HEADER]");
    },

    "Escaped list": function(test){
        var lp = new IMAPLineParser();

        test.expect(1);

        lp.on("line", function(data){
            test.deepEqual(data, ["TAG1", 'abc"', [ 'def' ]]);
            test.done();
        });

        lp.end("TAG1 \"abc\\\"\" (\"def\")");
    },

    "Escaped label": function(test){
        var input = 'X-GM-LABELS ("\\\\Draft")';
        var lp = new IMAPLineParser();
        lp.on("line", function(data){
            test.deepEqual(data, [ 'X-GM-LABELS', [ '\\Draft' ] ]);
            test.done();
        });

        lp.end(input);
    }
}

exports["Logging tests"] = {
    "Simple log": function(test){
        var lp = new IMAPLineParser();

        test.expect(1);

        lp.on("log", function(data){
            test.equal(data, "TAG1 FETCH (NAME HEADER BODY)");
            test.done();
        });

        lp.write("TAG1 ")
        lp.end("FETCH (NAME HEADER BODY)");
    }
};
