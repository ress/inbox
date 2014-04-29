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

        // List newest 10 messages
        client.listMessages(-10, function(err, messages){
            messages.forEach(function(message){
                console.log(message.UID+": "+message.title);
            });
        });

        /*
        client.fetchData(52, function(err, message){
            console.log(message);
        });

        //var stream = client.createMessageStream(52);
        //client.createMessageStream(52).pipe(process.stdout, {end: false});

        client.updateFlags(52, ["\\Answered", "\\Flagged"], "+", console.log)
        client.removeFlags(52, ["\\Answered", "\\Flagged"], console.log)
        client.addFlags(52, ["\\Flagged"], console.log)
        */

        function walkMailboxes(name, level, node){
            level = level || 0;
            (node.listChildren || node.listMailboxes).call(node, function(err, list){
                if(err){return;}
                console.log("> "+name);
                for(var i=0; i<list.length; i++){
                   console.log(list[i]);
                   if(list[i].hasChildren){
                        walkMailboxes(list[i].name, level+1, list[i]);
                   }
                }
            });
        }

        console.log(12)
        client.getMailbox("[Gmail]/Saadetud kirjad", console.log);

        //walkMailboxes("ROOT", 0, client);
        /*
        client.listMailboxes(function(error, mailboxes){
            console.log(mailboxes)
            mailboxes.forEach(function(mailbox){
                if(mailbox.hasChildren){
                    mailbox.createChild("andristest", console.log);
                }
            })
        });
        */

        //client.listChildren(console.log)

        client.createMailbox('test/foobar', function (err, mailbox) {
            console.log(err, mailbox);
            client.deleteMailbox('test/foobar', console.log);
        });

    });

    // on new messages, print to console
    client.on("new", function(message){
        console.log("New message:");
        console.log(util.inspect(message, false, 7));

        client.createMessageStream(message.UID).pipe(process.stdout, {end: false});

    });
});
