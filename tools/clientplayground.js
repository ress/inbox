var inbox = require("../lib/client");

var gmail = {
    secureConnection: true,
    auth: {
        user: "test.nodemailer@gmail.com",
        pass: "Nodemailer123"
    },
    debug: true
};

var client = inbox.createConnection(false, "imap.gmail.com", gmail);
client.connect();

client.on("error", console.log);

client.on("connect", function(){
    client.openMailbox("INBOX", function(err, mailbox){
        console.log(mailbox)
        client.listMessages(-100, 20, console.log);
        
        client.fetchMessage(16);
        
    });
});

client.on("new", function(envelope){
    console.log("NEW MAIL:");
    console.log(envelope);
    client.fetchMessage(envelope.UID);
});

client.on("message", function(envelope, message){
    console.log(envelope);
    
    message.on("data", function(data){
        console.log("MESSAGE: "+data.toString());
    });
    
    message.on("end", function(){
        console.log("MESSAGE COMPLETED");
    });
});
