var inbox = require(".."),
    hoodiecrow = require("hoodiecrow");

var IMAP_PORT = 1143;

var server, client;

module.exports["Inbox tests"] = {
    setUp: function(next){
        server = null;
        client = null;

        server = hoodiecrow({
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
        server.listen(IMAP_PORT, function(){
            client = inbox.createConnection(IMAP_PORT, "localhost", {
                auth:{
                    user: "testuser",
                    pass: "testpass"
                },
                debug: false
            });
            client.connect();
            client.on("connect", next);
        });
    },

    tearDown: function(next){
        client.close();
        client.on("close", function(){
            server.close(next);
        });
    },
    "List mailboxes": function(test){
        client.listMailboxes(function(err, mailboxes){
            test.ifError(err);
            test.equal(mailboxes.length, 2);
            test.equal(mailboxes[0].path, "TRASH");
            test.equal(mailboxes[1].name, "SENT");
            test.done();
        });
    },
    "Fetch mailbox": function(test){
        client.getMailbox("SENT", function(err, mailbox){
            test.ifError(err);
            test.equal(Object.keys(mailbox).length, 4);
            test.equal(mailbox.type, "Sent");
            test.equal(mailbox.delimiter, "/");
            test.done();
        });
    },
    "Open mailbox": function(test){
        client.openMailbox("INBOX", function(err, mailbox){
            test.ifError(err);
            test.equal(mailbox.count, 6);
            test.equal(mailbox.UIDValidity, "1");
            test.equal(mailbox.UIDNext, "7");
            test.done();
        });
    },
    "List messages": function(test){
        client.openMailbox("INBOX", function(err, mailbox){
            test.ifError(err);
            client.listMessages(-100, function(err, messages){
                test.ifError(err);
                test.equal(messages.length, 6);
                for(var i = 0; i < messages.length; i++) {
                    test.equal(messages[i].UIDValidity, 1);
                    test.equal(messages[i].UID, i+1);
                }
                test.equal(messages[3].from.address, "sender@example.com");
                test.done();
            });
        });
    },
    "List flags": function(test){
        client.openMailbox("INBOX", function(err, mailbox){
            test.ifError(err);
            client.listFlags(-100, function(err, messages){
                test.ifError(err);
                test.equal(messages.length, 6);
                for(var i = 0; i < messages.length; i++) {
                    test.equal(messages[i].flags.length, i === 1 ? 1 : 0);
                }
                test.done();
            });

        });
    },
    "Fetch message details": function(test){
        client.openMailbox("INBOX", function(err, mailbox){
            test.ifError(err);
            client.fetchData(4, function(err, message){
                test.ifError(err);
                test.equal(Object.keys(message).length, 10);
                test.equal(message.title, "hello 4")
                test.equal(message.from.address, "sender@example.com");
                test.equal(message.to[0].name, "Receiver name");
                test.done();
             });
        });
    },
    "Fetch message contents": function(test){
        client.openMailbox("INBOX", function(err, mailbox){
            test.ifError(err);
            var chunks = [],
                chunklength = 0,
                messageStream = client.createMessageStream(1);
            messageStream.on("data", function(chunk){
                chunks.push(chunk);
                chunklength += chunk.length;
            });
            messageStream.on("end", function(){
                test.equal(Buffer.concat(chunks, chunklength).toString(), "Subject: hello 1\r\n\r\nWorld 1!");
                test.done();
            });

        });
    },
    "Fetch message flags": function(test){
         client.openMailbox("INBOX", function(err, mailbox){
            test.ifError(err);
            client.fetchFlags(2, function(err, flags) {
                test.ifError(err);
                test.equal(flags.length, 1);
                test.equal(flags[0], "\\Seen");
                test.done();
            });

        });
    },
    "Add message flag": function(test){
        client.openMailbox("INBOX", function(err, mailbox){
            test.ifError(err);
            client.addFlags(2, ["Test"], function(err, flags){
                test.ifError(err);
                test.equal(flags.length, 2);
                test.equal(flags[0], "\\Seen");
                test.equal(flags[1], "Test");
                test.done();
            });
        });
    },
    "Remove message flag": function(test){
        client.openMailbox("INBOX", function(err, mailbox){
            test.ifError(err);
            client.removeFlags(2, ["\\Seen"], function(err, flags) {
                test.ifError(err);
                test.equal(flags.length, 0);
                test.done();
            });
        });
    },
    "Store message": function(test){
        client.openMailbox("INBOX", function(err, mailbox){
            test.ifError(err);
            test.equal(mailbox.count, 6);
            client.storeMessage("Subject: hello 7\r\n\r\nWorld 7!", ["\\Seen"], function(err, params){
                test.ifError(err);
                test.equal(params.UID, mailbox.UIDNext);
                client.openMailbox("INBOX", function(err, mailbox){
                    test.equal(mailbox.count, 7);
                    test.done();
                });
            });
        });
    },
    "Copy message": function(test){
        client.openMailbox("INBOX", function(err, mailbox){
            test.ifError(err);
            client.copyMessage(3, "TRASH", function(err){
                test.ifError(err);
                client.openMailbox("TRASH", function(err, mailbox){
                    test.ifError(err);
                    test.equal(mailbox.count, 1);
                    test.equal(mailbox.UIDNext, 2);
                    test.done();
                });
            })
        });
    },
    "Delete message": function(test){
        client.openMailbox("INBOX", function(err, mailbox){
            test.ifError(err);
            test.equal(mailbox.count, 6);
            client.deleteMessage(6, function(err){
                test.ifError(err);
                client.openMailbox("INBOX", function(err, mailbox){
                    test.ifError(err);
                    test.equal(mailbox.count, 5);
                    test.done();
                });
            });
        });
    }
}
