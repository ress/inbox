# inbox

This is a work in progress IMAP client for node.js. Currently it does barely nothing
so if you need something reliable, check out 
[/mscdex/node-imap](https://github.com/mscdex/node-imap).


The project consists of two major parts

  * IMAP command parser (token based, more or less complete)
  * IMAP control for accessing mailboxes (under construction)

## Installation

Install from npm and run the tests (currently there are tests only for the parser)

    npm install -dev inbox
    npm test inbox

## API

**NB!** This API is preliminary and subject to change.

Use **inbox** module

    var inbox = require("inbox");
    

### Create new IMAP connection

Create connection object with 

    inbox.createConnection(port, host, options)

where

  * **port** is the port to the server (defaults to 143 on non-secure and to 993 on secure connection)
  * **host** is the hostname of the server
  * **options** is an options object for auth etc.
  * **options.secureConnection** is a Boolean value to indicate if the connection is initially secure or not
  * **options.auth** is an authentication object
  * **options.auth.user** is the IMAP username
  * **options.auth.pass** is the IMAP password
  * **options.auth.XOAuthToken** (optional) is either a String or *inbox.createXOAuthGenerator* object

Example:

    var client = inbox.createConnection(false, "imap.gmail.com", {
        secureConnection: true,
        auth:{
            user: "test.nodemailer@gmail.com",
            pass: "Nodemailer123"
        }
    });

Or when login with XOAUTH (see examples/xoauth.js)
    
    var client = inbox.createConnection(false, "imap.gmail.com", {
        secureConnection: true,
        auth:{
            XOAuthToken: inbox.createXOAuthGenerator({
                user: "test.nodemailer@gmail.com",
                token: "1/Gr2OVA2Ol64fNyjZCns-bkRau5eLisbdlEa_HSuTaEk",
                tokenSecret: "ymFpseHtEnrIsuL8Ppbfnnk3"
            })
        }
    });
        
Once the connection object has been created, use connect() to create the actual connection.

    client.connect();
    
When the connection has been successfully established a 'connect' event is emitted.

    client.on("connect", function(){
        console.log("Successfully connected to server");
    });

### List available mailboxes

To get the list of available mailboxes, use

    client.getMailboxList()

which returns the mailbox list

Example

    console.log(client.getMailboxList());

### Select a mailbox

Before you can check mailbox contents, you need to select one with

    client.openMailbox(name[, options], callback)
    
Where

  * **name** is the name of the mailbox (ie. "INBOX")
  * **options** is an optional options object
  * **options.readOnly** - if set to true, open the mailbox in read-only mode (downloading messages does not update seen/unseen flag)
  * **callback** is a callback function to run after the mailbox has been opened. Has an error param in case the opening failed and a mailbox param with the properties of the opened mailbox.

Example

    client.on("connect", function(){
        client.openMailbox("INBOX", function(error, mailbox){
            if(error) throw error;
            console.log("Message count in INBOX: " + mailbox.count);
        });
    });

### Listing e-mails

Once a mailbox has been opened you can list contained e-mails with

    client.listMessages(from[, limit], callback)

Where

  * **from** is the index of the first message (0 based), you can use negative numbers to count from the end (-10 indicates the 10 last messages)
  * **limit** defines the maximum count of messages to fetch, if not set or 0 all messages from the starting position will be included
  * **callback** is the callback function to run with the message array
  
Example

    // list newest 10 messages
    client.listMessages(-10, function(err, messages){
        messages.forEach(function(message){
            console.log(message.UID + ": " + message.title);
        });
    });

### Fetch message contents

Message listing only retrieves the envelope part of the message. To get the full RFC822 message body
you need to fetch the message.

    client.fetchMessage(uid, callback)
    
Where

  * **uid** is the UID value for the mail
  * **callback** is the callback function to run **after** the streaming has been completed. Gets an error parameter if error occured and a message stream object or null if the message was not found

Example

    client.fetchMessage(123, function(stream){
        stream.pipe(process.stdout, {end: false}); // output to console
    });

### Wait for new messages

You can listen for new incoming e-mails with event "new"

    client.on("new", function(message){
        console.log("New incoming message " + message.title);
    });
    
## Complete example

Listing newest 10 messages:

    var inbox = require("inbox");
    
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