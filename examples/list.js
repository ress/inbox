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

    client.listMailboxes(console.log);

    client.openMailbox("INBOX", function(error, mailbox){
        if(error) throw error;

        // List newest 10 messages
        client.listMessages(-10, function(err, messages){
            messages.forEach(function(message){
                console.log(message.UID+": "+message.title);
            });

            client.listFlags(-10, function(err, messages){
                messages.forEach(function(message){
                    console.log(message);
                });
                //client.close();
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

client.on('error', function (err){
    console.log('Error');
    console.log(err)
});

client.on('close', function (){
    console.log('DISCONNECTED!');
});
