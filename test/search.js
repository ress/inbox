"use strict";

var inbox = require(".."),
    hoodiecrow = require("hoodiecrow");

var IMAP_PORT = 1143;

module.exports = {
    setUp: function(next){
        this.server = hoodiecrow({
            storage: {
                "INBOX":{
                    messages: [
                        {raw: "Subject: hello 1\r\n\r\nWorld 1!", uid: 45, internaldate: new Date("2009-1-1")},
                        {raw: "Subject: hello 2\r\n\r\nWorld 2!", flags: ["test", "\\Seen"], uid: 48},
                        {raw: "Subject: hello 3\r\n\r\nWorld 3!", flags: ["test"], uid: 49},
                        {raw: "Subject: test\r\n\r\nWorld 1!", flags: ["\\Seen"], uid: 50, internaldate: new Date("2009-1-1")},
                    ]
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

    "Boolean search": function(test){
        this.client.openMailbox("INBOX", (function(err, mailbox){
            this.client.search({
                unseen: true
            }, function(err, messages){
                test.ifError(err);
                test.deepEqual(messages, [1, 3]);
                test.done();
            });
        }).bind(this));
    },

    "String search": function(test){
        this.client.openMailbox("INBOX", (function(err, mailbox){
            this.client.search({
                keyword: "test"
            }, function(err, messages){
                test.ifError(err);
                test.deepEqual(messages, [2, 3]);
                test.done();
            });
        }).bind(this));
    },

    "String UID search": function(test){
        this.client.openMailbox("INBOX", (function(err, mailbox){
            this.client.search({
                keyword: "test"
            }, true, function(err, messages){
                test.ifError(err);
                test.deepEqual(messages, [48, 49]);
                test.done();
            });
        }).bind(this));
    },

    "Array search": function(test){
        this.client.openMailbox("INBOX", (function(err, mailbox){
            this.client.search({
                header: ["subject", "hello"]
            }, function(err, messages){
                test.ifError(err);
                test.deepEqual(messages, [1, 2, 3]);
                test.done();
            });
        }).bind(this));
    },

    "Date search": function(test){
        this.client.openMailbox("INBOX", (function(err, mailbox){
            this.client.search({
                sentsince: new Date("2010-01-01")
            }, function(err, messages){
                test.ifError(err);
                test.deepEqual(messages, [2, 3]);
                test.done();
            });
        }).bind(this));
    },

    "AND search": function(test){
        this.client.openMailbox("INBOX", (function(err, mailbox){
            this.client.search({
                senton: new Date("2009-01-01"),
                unseen: true
            }, function(err, messages){
                test.ifError(err);
                test.deepEqual(messages, [1]);
                test.done();
            });
        }).bind(this));
    },

    "OR search": function(test){
        this.client.openMailbox("INBOX", (function(err, mailbox){
            this.client.search({
                or: {
                    senton: new Date("2009-01-01"),
                    unseen: true
                }
            }, function(err, messages){
                test.ifError(err);
                test.deepEqual(messages.sort(function(a,b){return a - b}), [1, 3, 4]);
                test.done();
            });
        }).bind(this));
    },

    "NOT search": function(test){
        this.client.openMailbox("INBOX", (function(err, mailbox){
            this.client.search({
                unseen: true,
                not: {
                    senton: new Date("2009-01-01")
                }
            }, function(err, messages){
                test.ifError(err);
                test.deepEqual(messages, [3]);
                test.done();
            });
        }).bind(this));
    }
};

