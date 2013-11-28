
var inbox = require(".."),
    util = require("util");

var client = inbox.createConnection(false, "imap.gmail.com", {
    secureConnection: true,
    auth:{
        XOAuth2:{
            user: "example.user@gmail.com",
            clientId: "8819981768.apps.googleusercontent.com",
            clientSecret: "{client_secret}",
            refreshToken: "1/xEoDL4iW3cxlI7yDbSRFYNG01kVKM2C-259HOF2aQbI",
            accessToken: "vF9dft4qmTc2Nvb3RlckBhdHRhdmlzdGEuY29tCg==",
            timeout: 3600
        }
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
