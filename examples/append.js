var inbox = require(".."),
    util = require("util");

var client = inbox.createConnection(false, "imap.gmail.com", {
    secureConnection: true,
    auth:{
        user: "test.nodemailer@gmail.com",
        pass: "Nodemailer123"
    },
    debug: false
});

client.connect();

client.on("connect", function(){

    client.openMailbox("[Gmail]/Sent Mail", function(error, mailbox){
        if(error) throw error;

        client.storeMessage("From: andris@node.ee\r\n"+
                            "To: andris@kreata.ee\r\n"+
                            "Message-Id: 1234\r\n"+
                            "Subject: test 2\r\n"+
                            "\r\n"+
                            "Tere tere 2!", ["\\Seen"], console.log);

    });

    // on new messages, print to console
    client.on("new", function(message){
        console.log("New message:");
        console.log(util.inspect(message, false, 7));

        client.createMessageStream(message.UID).pipe(process.stdout, {end: false});

    });
});
