var IMAPClient = require("../lib/client");

var gmail = {
    secureConnection: true,
    auth: {
        user: "test.nodemailer@gmail.com",
        pass: "Nodemailer123"
    },
    debug: !true
};

var imap = new IMAPClient(false, "imap.gmail.com", gmail);

imap.on("error", console.log);

imap.on("mailbox", function(mailbox){
    imap.listMail(-2, console.log);
    
    imap.fetchMail(46, console.log);
    
    imap.idle();
});

imap.on("message", function(message){
    console.log(message)
})

imap.on("messageData", function(message, data){
    console.log(data.toString());
});

imap.connect();