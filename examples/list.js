var inbox = require("..");
    
var client = inbox.createConnection(false, "imap.gmail.com", {
    secureConnection: true,
    auth:{
        user: "test.nodemailer@gmail.com",
        pass: "Nodemailer123"
    }
});

client.connect();

client.on("connect", function(){
    client.openMailbox("INBOX", function(error, mailbox){
        if(error) throw error;
        
        client.listMessages(-10, function(err, messages){
            messages.forEach(function(message){
                console.log(message.UID + ": " + message.title);
            });
        });

    });
});