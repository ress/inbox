"use strict";

var inbox = require(".."),
    hoodiecrow = require("hoodiecrow");

var IMAP_PORT = 1143;

module.exports["Inbox tests"] = {
    setUp: function(next){
        this.server = hoodiecrow({
            plugins: ["IDLE"],
            storage: {
                "INBOX":{
                    messages: [
                        {raw: "Subject: hello 1\r\n\r\nWorld 1!", internaldate: "14-Sep-2013 21:22:28 -0300"},
                        {raw: "Subject: hello 2\r\n\r\nWorld 2!", flags: ["\\Seen"]},
                        {raw: "Subject: hello 3\r\n\r\nWorld 3!"},
                        {raw: "From: sender name <sender@example.com>\r\n"+
                            "To: Receiver name <receiver@example.com>\r\n"+
                            "Subject: hello 4\r\n"+
                            "Message-Id: <abcde>\r\n"+
                            "Date: Fri, 13 Sep 2013 15:01:00 +0300\r\n"+
                            "\r\n"+
                            "World 4!"},
                        {raw: "Subject: hello 5\r\n\r\nWorld 5!"},
                        {raw: "Subject: hello 6\r\n\r\nWorld 6!"}
                    ]
                },
                "": {
                    "separator": "/",
                    "folders": {
                        "TRASH": {},
                        "SENT": {}
                    }
                }
            }
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

    "List mailboxes": function(test){
        this.client.listMailboxes(function(err, mailboxes){
            test.ifError(err);
            test.equal(mailboxes.length, 2);
            test.equal(mailboxes[0].path, "TRASH");
            test.equal(mailboxes[1].name, "SENT");
            test.done();
        });
    },

    "Fetch mailbox": function(test){
        this.client.getMailbox("SENT", function(err, mailbox){
            test.ifError(err);
            test.equal(Object.keys(mailbox).length, 4);
            test.equal(mailbox.type, "Sent");
            test.equal(mailbox.delimiter, "/");
            test.done();
        });
    },

    "Open mailbox": function(test){
        this.client.openMailbox("INBOX", function(err, mailbox){
            test.ifError(err);
            test.equal(mailbox.count, 6);
            test.equal(mailbox.UIDValidity, "1");
            test.equal(mailbox.UIDNext, "7");
            test.done();
        });
    },

    "List messages": function(test){
        this.client.openMailbox("INBOX", (function(err){
            test.ifError(err);
            this.client.listMessages(-100, function(err, messages){
                test.ifError(err);
                test.equal(messages.length, 6);
                for(var i = 0; i < messages.length; i++) {
                    test.equal(messages[i].UIDValidity, 1);
                    test.equal(messages[i].UID, i+1);
                }
                test.equal(messages[3].from.address, "sender@example.com");
                test.done();
            });
        }).bind(this));
    },

    "List flags": function(test){
        this.client.openMailbox("INBOX", (function(err){
            test.ifError(err);
            this.client.listFlags(-100, function(err, messages){
                test.ifError(err);
                test.equal(messages.length, 6);
                for(var i = 0; i < messages.length; i++) {
                    test.equal(messages[i].flags.length, i === 1 ? 1 : 0);
                }
                test.done();
            });

        }).bind(this));
    },

    "Fetch message details": function(test){
        this.client.openMailbox("INBOX", (function(err){
            test.ifError(err);
            this.client.fetchData(4, function(err, message){
                test.ifError(err);
                test.equal(Object.keys(message).length, 11);
                test.equal(message.title, "hello 4");
                test.equal(message.from.address, "sender@example.com");
                test.equal(message.to[0].name, "Receiver name");
                test.done();
             });
        }).bind(this));
    },

    "Fetch message contents": function(test){
        this.client.openMailbox("INBOX", (function(err){
            test.ifError(err);
            var chunks = [],
                chunklength = 0,
                messageStream = this.client.createMessageStream(1);
            messageStream.on("data", function(chunk){
                chunks.push(chunk);
                chunklength += chunk.length;
            });
            messageStream.on("end", function(){
                test.equal(Buffer.concat(chunks, chunklength).toString(), "Subject: hello 1\r\n\r\nWorld 1!");
                test.done();
            });

        }).bind(this));
    },

    "Fetch message flags": function(test){
         this.client.openMailbox("INBOX", (function(err){
            test.ifError(err);
            this.client.fetchFlags(2, function(err, flags) {
                test.ifError(err);
                test.equal(flags.length, 1);
                test.equal(flags[0], "\\Seen");
                test.done();
            });

        }).bind(this));
    },

    "Add message flag": function(test){
        this.client.openMailbox("INBOX", (function(err){
            test.ifError(err);
            this.client.addFlags(2, ["Test"], function(err, flags){
                test.ifError(err);
                test.equal(flags.length, 2);
                test.equal(flags[0], "\\Seen");
                test.equal(flags[1], "Test");
                test.done();
            });
        }).bind(this));
    },

    "Remove message flag": function(test){
        this.client.openMailbox("INBOX", (function(err){
            test.ifError(err);
            this.client.removeFlags(2, ["\\Seen"], function(err, flags) {
                test.ifError(err);
                test.equal(flags.length, 0);
                test.done();
            });
        }).bind(this));
    },


    "Store message": function(test){
        this.client.openMailbox("INBOX", (function(err, mailbox){
            test.ifError(err);
            test.equal(mailbox.count, 6);
            this.client.storeMessage("Subject: hello 7\r\n\r\nWorld 7!", ["\\Seen"], (function(err, params){
                test.ifError(err);
                test.equal(params.UID, mailbox.UIDNext);
                this.client.openMailbox("INBOX", function(err, mailbox){
                    test.equal(mailbox.count, 7);
                    test.done();
                });
            }).bind(this));
        }).bind(this));
    },

    "Copy message": function(test){
        this.client.openMailbox("INBOX", (function(err){
            test.ifError(err);
            this.client.copyMessage(3, "TRASH", (function(err){
                test.ifError(err);
                this.client.openMailbox("TRASH", function(err, mailbox){
                    test.ifError(err);
                    test.equal(mailbox.count, 1);
                    test.equal(mailbox.UIDNext, 2);
                    test.done();
                });
            }).bind(this));
        }).bind(this));
    },

    "Delete message": function(test){
        this.client.openMailbox("INBOX", (function(err, mailbox){
            test.ifError(err);
            test.equal(mailbox.count, 6);
            this.client.deleteMessage(6, (function(err){
                test.ifError(err);
                this.client.openMailbox("INBOX", function(err, mailbox){
                    test.ifError(err);
                    test.equal(mailbox.count, 5);
                    test.done();
                });
            }).bind(this));
        }).bind(this));
    },

    "New message": function(test){
        this.client.on("new", function(message){
            test.ok(message);
            test.done();
        });

        this.client.openMailbox("INBOX", (function(err){
            this.client.storeMessage("Subject: hello 8\r\n\r\nWorld 8!", function(){});
        }).bind(this));
    }
};
