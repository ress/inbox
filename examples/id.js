var inbox = require(".."),
    util = require("util");

var client = inbox.createConnection(false, "imap.gmail.com", {
    secureConnection: true,
    auth:{
        user: "test.nodemailer@gmail.com",
        pass: "Nodemailer123"
    },
    clientId: {
        name: "test",
        "support-url": "test2"
    },
    debug: false
});

client.connect();

client.on("connect", function(){

    client.openMailbox("INBOX", function(error, mailbox){
        if(error) throw error;


    });

});
