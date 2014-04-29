var inbox = require(".."),
    util = require("util");

var client = inbox.createConnection(false, "imap.gmail.com", {
    secureConnection: true,
    auth:{
        user: "test.nodemailer@gmail.com",
        pass: "Nodemailer123"
    },
    debug: true
});

client.connect();

client.on("connect", function(){

    client.openMailbox("INBOX", function(error, mailbox){
        if(error) throw error;

        client.listMessages(-1, function(error, messages){
            messages.forEach(function(message){
                console.log("Message")
                console.log(message);

                client.copyMessage(message.UID, "[Gmail]/Saadetud kirjad", function(error){
                    console.log(arguments);
                })
            })
        })

    });

});
