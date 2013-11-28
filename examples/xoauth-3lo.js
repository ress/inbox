var inbox = require(".."),
    util = require("util");

var client = inbox.createConnection(false, "imap.gmail.com", {
    secureConnection: true,
    auth:{
        XOAuthToken: inbox.createXOAuthGenerator({
            user: "test.nodemailer@gmail.com",
            token: "1/Gr2OVA2Ol64fNyjZCns-bkRau5eLisbdlEa_HSuTaEk",
            tokenSecret: "ymFpseHtEnrIsuL8Ppbfnnk3"
        })
    },
    debug: true
});

client.connect();

client.on("error", function(err){
    console.log(err)
});

client.on("connect", function(){

    client.listMailboxes(console.log);

    client.openMailbox("INBOX", function(error, mailbox){
        if(error) throw error;

        // List newest 10 messages
        client.listMessages(-10, function(err, messages){
            messages.forEach(function(message){
                console.log(message.UID+": "+message.title);
            });
        });

    });

    // on new messages, print to console
    client.on("new", function(message){
        console.log("New message:");
        console.log(util.inspect(message, false, 7));

        client.createMessageStream(message.UID).pipe(process.stdout, {end: false});

    });
});