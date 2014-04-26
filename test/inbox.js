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
                        {raw: "Subject: hello 6\r\n\r\nWorld 6!"},
                        {raw: "Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\nMIME-Version: 1.0\r\n\r\nwow. very mail. such bodystructure."},
                        {raw: "Content-Type: multipart/alternative;\r\n boundary=\"=_BOUNDARY_BOUNDARY_BOUNDARY_\";\r\n    charset=\"UTF-8\"\r\nMIME-Version: 1.0\r\nSender: \"FOOBAR\" <foo@bar.io>\r\n\r\nThis is a multi-part message in MIME format\r\n\r\n--=_BOUNDARY_BOUNDARY_BOUNDARY_\r\nContent-Type: text/plain\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nFOOFOOFOOFOO\r\n\r\n\r\n--=_BOUNDARY_BOUNDARY_BOUNDARY_\r\nContent-Type: text/html\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n<!DOCTYPE HTML PUBLIC \"-//W3C//DTD HTML 4.01 Transitional//EN\">\r\n<html>\r\n  <head>\r\n  <meta http-equiv=3D\"content-type\" content=3D\"text/html; charset=3Diso-=\r\n8859-1\">\r\n  <title>STUFF</title>\r\n  </head>\r\n  <body>\r\n  <p>stuff<p>\r\n  </body>\r\n</html>\r\n\r\n--=_BOUNDARY_BOUNDARY_BOUNDARY_--"}
                    ]
                },
                "": {
                    "separator": "/",
                    "folders": {
                        "TRASH": {},
                        "SENT": {},
                        "Unsubscribed": {
                            subscribed: false
                        }
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
            test.equal(mailboxes.length, 3);
            test.equal(mailboxes[0].path, "INBOX");
            test.equal(mailboxes[1].path, "TRASH");
            test.equal(mailboxes[2].name, "SENT");
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
            test.equal(mailbox.count, 8);
            test.equal(mailbox.UIDValidity, "1");
            test.equal(mailbox.UIDNext, "9");
            test.done();
        });
    },

    "Try to open invalid mailbox": function(test){
        this.client.openMailbox(undefined, function(err, mailbox){
            test.ok(err);
            test.ok(!mailbox);
            test.done();
        });
    },

    "Try to open missing mailbox": function(test){
        this.client.openMailbox("NON-EXISTENT", function(err, mailbox){
            test.ok(err);
            test.ok(!mailbox);
            test.done();
        });
    },

    "List messages": function(test){
        this.client.openMailbox("INBOX", (function(err){
            test.ifError(err);
            this.client.listMessages(-100, function(err, messages){
                test.ifError(err);
                test.equal(messages.length, 8);
                for(var i = 0; i < messages.length; i++) {
                    test.equal(messages[i].UIDValidity, 1);
                    test.equal(messages[i].UID, i+1);
                }
                test.equal(messages[3].from.address, "sender@example.com");
                test.deepEqual(messages[6].bodystructure, { part: '1',
                    type: 'text/plain',
                    parameters: { charset: 'utf-8' },
                    encoding: 'quoted-printable',
                    size: 35,
                    lines: 1
                });
                test.deepEqual(messages[7].bodystructure, {
                    '1': {
                        part: '1',
                        type: 'text/plain',
                        parameters: {},
                        encoding: 'quoted-printable',
                        size: 16,
                        lines: 3
                    },
                    '2': {
                        part: '2',
                        type: 'text/html',
                        parameters: {},
                        encoding: 'quoted-printable',
                        size: 248,
                        lines: 12
                    },
                    type: 'multipart/alternative'
                });
                test.done();
            });
        }).bind(this));
    },

    "List messages by UID": function(test){
        this.client.openMailbox("INBOX", (function(err){
            test.ifError(err);
            this.client.listMessagesByUID(2, 4, function(err, messages){
                test.ifError(err);
                test.equal(messages.length, 3);
                for(var i = 0; i < messages.length; i++) {
                    test.equal(messages[i].UIDValidity, 1);
                    test.equal(messages[i].UID, i + 2);
                }
                test.equal(messages[2].from.address, "sender@example.com");
                test.done();
            });
        }).bind(this));
    },

    "List flags": function(test){
        this.client.openMailbox("INBOX", (function(err){
            test.ifError(err);
            this.client.listFlags(-100, function(err, messages){
                test.ifError(err);
                test.equal(messages.length, 8);
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

    "Stream should not be ended prematurely": function(test){
        this.client.openMailbox("INBOX", (function(err){
            test.ifError(err);

            var messageStream = this.client.createMessageStream(1);
            messageStream.on("data", function(){});
            messageStream.on("end", (function(){
                this.client.listMessagesByUID(2, 2, function(err, messages){
                    test.ifError(err);

                    test.equal(messages[0].UID, 2);
                    test.done();
                });
            }).bind(this));
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
            test.equal(mailbox.count, 8);
            this.client.storeMessage("Subject: hello 7\r\n\r\nWorld 7!", ["\\Seen"], (function(err, params){
                test.ifError(err);
                test.equal(params.UID, mailbox.UIDNext);
                this.client.openMailbox("INBOX", function(err, mailbox){
                    test.equal(mailbox.count, 9);
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
            test.equal(mailbox.count, 8);
            this.client.deleteMessage(6, (function(err){
                test.ifError(err);
                this.client.openMailbox("INBOX", function(err, mailbox){
                    test.ifError(err);
                    test.equal(mailbox.count, 7);
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
    },

    "Create mailbox": function(test){
        var self = this;
        this.client.createMailbox("NEW-MAILBOX", function(err, mailbox){
            test.ifError(err);
            test.equal(mailbox.path, "NEW-MAILBOX");
            test.equal(mailbox.type, "Normal");
            test.equal(mailbox.delimiter, "/");
            self.client.openMailbox("NEW-MAILBOX", function(err, mailbox){
                test.ifError(err);
                test.equal(mailbox.count, 0);
                test.equal(mailbox.UIDValidity, "1");
                test.equal(mailbox.UIDNext, "1");
                test.done();
            });
        });
    },

    "Delete mailbox": function(test){
        var self = this;
        this.client.createMailbox("NEW-MAILBOX", function(err, mailbox){
            self.client.deleteMailbox("NEW-MAILBOX", function(err, status){
                test.ifError(err);
                test.equal(status, "OK");
                self.client.openMailbox("NEW-MAILBOX", function(err, mailbox){
                    test.ok(err);
                    test.ok(!mailbox);
                    test.done();
                });
            });
        });
    }
};

module.exports["Empty LSUB"] = {
    setUp: function(next){
        this.server = hoodiecrow({
            storage: {
                "INBOX":{
                    subscribed: false
                },
                "": {
                    "separator": "/",
                    "folders": {
                        "TRASH": {
                            subscribed: false
                        },
                        "SENT": {
                            subscribed: false
                        }
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

    "List mailboxes with empty LSUB": function(test){
        this.client.listMailboxes(function(err, mailboxes){
            test.ifError(err);
            test.equal(mailboxes.length, 3);
            test.equal(mailboxes[0].path, "INBOX");
            test.equal(mailboxes[1].path, "TRASH");
            test.equal(mailboxes[2].name, "SENT");
            test.done();
        });
    }
};
