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
    console.log(util.inspect(client.getMailboxList(), false, 7));
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
        
        client.fetchMessage(message.UID, function(err, stream){
            stream.pipe(process.stdout, {end: false}); 
        });
        
    });
});
