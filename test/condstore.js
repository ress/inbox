"use strict";

var inbox = require(".."),
    hoodiecrow = require("hoodiecrow");

var IMAP_PORT = 1143;

module.exports["Condstore"] = {
    setUp: function(next){
        this.server = hoodiecrow({
            plugins: ["ENABLE", "CONDSTORE"],
            storage: {
                "INBOX":{
                    messages: [
                        {raw: "Subject: hello 1\r\n\r\nWorld 1!"},
                        {raw: "Subject: hello 2\r\n\r\nWorld 2!", flags: ["\\Seen"]},
                        {raw: "Subject: hello 3\r\n\r\nWorld 3!"}
                    ]
                },
                "": {
                    "separator": "/",
                    "folders": {
                        "TRASH": {},
                        "SENT": {}
                    }
                }
            },
            debug: false
        });

        this.server.listen(IMAP_PORT, (function(){
            this.client = inbox.createConnection(IMAP_PORT, "localhost", {
                auth:{
                    user: "testuser",
                    pass: "testpass"
                },
                debug: false
            });
            this.client.connect();
            this.client.on("connect", next);
        }).bind(this));
    },

    tearDown: function(next){
        this.client.close();
        this.client.on("close", (function(){
            this.server.close(next);
        }).bind(this));
    },

    "Fetch messages since last modseq change": function(test){
        this.client.openMailbox("INBOX", (function(err, mailbox){
            var modseq = mailbox.highestModSeq;
            test.equal(modseq, 3);
            this.client.addFlags(2, ["Test"], (function(err, flags){
                test.ifError(err);
                this.client.listMessages(0, 0, "(CHANGEDSINCE " + modseq + ")", function(err, messages){
                    test.ifError(err);
                    test.equal(messages.length, 1);
                    test.equal(messages[0].UID, 2);
                    test.equal(messages[0].modSeq, 4);
                    test.done();
                });
            }).bind(this));
        }).bind(this));
    }
};

