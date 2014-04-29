# inbox

This is a work in progress IMAP client for node.js.

The project consists of two major parts

  * IMAP command parser (token based, more or less complete)
  * IMAP control for accessing mailboxes (under construction)

[![Build Status](https://secure.travis-ci.org/andris9/inbox.png)](http://travis-ci.org/andris9/inbox)
[![NPM version](https://badge.fury.io/js/inbox.png)](http://badge.fury.io/js/inbox)


## Installation

Install from npm

    npm install inbox

## API

**NB!** This API is preliminary and may change.

Use **inbox** module
```javascript
var inbox = require("inbox");
```
### Create new IMAP connection

Create connection object with
```javascript
inbox.createConnection(port, host, options)
```

where

  * **port** is the port to the server (defaults to 143 on non-secure and to 993 on secure connection)
  * **host** is the hostname of the server
  * **options** is an options object for auth etc.
  * **options.secureConnection** is a Boolean value to indicate if the connection is initially secure or not
  * **options.auth** is an authentication object
  * **options.auth.user** is the IMAP username
  * **options.auth.pass** is the IMAP password
  * **options.auth.XOAuth2** (optional) is either an object with {user, clientId, clientSecret, refreshToken} or *xoauth2.createXOAuth2Generator* object, see [xoauth2](https://github.com/andris9/xoauth2) for details
  * **options.auth.XOAuthToken** (optional) is either a String or *inbox.createXOAuthGenerator* object
  * **options.clientId** is optional client ID params object
  * **options.clientId.name** is is the name param etc. see [rfc 2971](http://tools.ietf.org/html/rfc2971#section-3.3) for possible field names

Example:
```javascript
var client = inbox.createConnection(false, "imap.gmail.com", {
    secureConnection: true,
    auth:{
        user: "test.nodemailer@gmail.com",
        pass: "Nodemailer123"
    }
});
```

Or for login with XOAUTH2 (see examples/xoauth2)
```javascript
// XOAUTH2
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
    }
});
```


Or for login with XOAUTH (see examples/xoauth-3lo.js and examples/xoauth-2lo.js)

```javascript
// 3-legged- oauth
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
```

With 2-legged OAuth, consumerKey and consumerSecret need to have proper values, vs 3-legged OAuth where both default to "anonymous".
```javascript
// 2-legged- oauth
var client = inbox.createConnection(false, "imap.gmail.com", {
    secureConnection: true,
    auth:{
        XOAuthToken: inbox.createXOAuthGenerator({
            user: "test.nodemailer@gmail.com",
            requestorId: "test.nodemailer@gmail.com",
            consumerKey: "1/Gr2OVA2Ol64fNyjZCns-bkRau5eLisbdlEa_HSuTaEk",
            consumerSecret: "ymFpseHtEnrIsuL8Ppbfnnk3"
        })
    }
});
```

Once the connection object has been created, use connect() to create the actual connection.
```javascript
client.connect();
```

When the connection has been successfully established a 'connect' event is emitted.
```javascript
client.on("connect", function(){
    console.log("Successfully connected to server");
});
```

### Logout and disconnect

Logout from IMAP and close NET connection.

```javascript
client.close();
client.on('close', function (){
    console.log('DISCONNECTED!');
});
```

### List available mailboxes

To list the available mailboxes use
```javascript
client.listMailboxes(callback)
```

Where

  * **callback** *(error, mailboxes)* returns a list of root mailbox object

Mailbox objects have the following properties

  * **name** - the display name of the mailbox
  * **path** - the actual name of the mailbox, use it for opening the mailbox
  * **type** - the type of the mailbox (if server hints about it)
  * **hasChildren** - boolean indicator, if true, has child mailboxes
  * **disabled** - boolean indicator, if true, can not be selected

Additionally mailboxes have the following methods

  * **open** *([options, ]callback)* - open the mailbox (shorthand for *client.openMailbox*)
  * **listChildren** *(callback)* - if the mailbox has children (*hasChildren* is true), lists the child mailboxes

Example:
```javascript
client.listMailboxes(function(error, mailboxes){
    for(var i=0, len = mailboxes.length; i<len; i++){
        if(mailboxes[i].hasChildren){
            mailboxes[i].listChildren(function(error, children){
                console.log(children);
            });
        }
    }
});
```

### Fetch a specified mailbox object

If you need to access a specific mailbox object (for creating or listing child
mailboxes etc.), you can do it with
```javascript
client.getMailbox(path, callback)
```

Where

  * **path** is the mailbox directory path
  * **callback** *(error, mailbox)* is the callback function

Example:
```javascript
client.getMailbox("INBOX.Arhiiv", function(error, mailbox){
    if(mailbox && mailbox.hasChildren){
        mailbox.listChildren(console.log);
    }
});
```

### Select a mailbox

Before you can check mailbox contents, you need to select one with
```javascript
client.openMailbox(path[, options], callback)
```

Where

  * **path** is the path to the mailbox (ie. "INBOX" or "INBOX/Arhiiv") or a mailbox object
  * **options** is an optional options object
  * **options.readOnly** - if set to true, open the mailbox in read-only mode (downloading messages does not update seen/unseen flag)
  * **callback** *(error, info)* is a callback function to run after the mailbox has been opened. Has an error param in case the opening failed and a info param with the properties of the opened mailbox.

Example
```javascript
client.on("connect", function(){
    client.openMailbox("INBOX", function(error, info){
        if(error) throw error;
        console.log("Message count in INBOX: " + info.count);
    });
});
```

### Listing e-mails

Once a mailbox has been opened you can list contained e-mails with
```javascript
client.listMessages(from[, limit], callback)
```

Where

  * **from** is the index of the first message (0 based), you can use negative numbers to count from the end (-10 indicates the 10 last messages)
  * **limit** defines the maximum count of messages to fetch, if not set or 0 all messages from the starting position will be included
  * **callback** *(error, messages)* is the callback function to run with the message array

Example
```javascript
// list newest 10 messages
client.listMessages(-10, function(err, messages){
    messages.forEach(function(message){
        console.log(message.UID + ": " + message.title);
    });
});
```

Example output for a message listing
```javascript
[
    {
        // if uidvalidity changes, all uid values are void!
        UIDValidity: '664399135',

        // uid value of the message
        UID: 52,

        // message flags (Array)
        flags: [ '\\Flagged', '\\Seen' ],

        // date of the message (Date object)
        date: Wed, 25 Apr 2012 12:23:05 GMT,

        title: 'This is a message, may contain unicode symbols',

        // single "from:" address
        from: {
            name: 'Andris Reinman',
            address: 'andris.reinman@gmail.com'
        },

        // an array of "to:" addresses
        to: [
            {
                name: 'test nodemailer',
                address: 'test.nodemailer@gmail.com'
            }
        ],

        // an array of "cc:" addresses
        cc: [
            {
                name: 'test nodemailer',
                address: 'test.nodemailer@gmail.com'
            }
        ],

        messageId: '<04541AB5-9FBD-4255-81AA-18FE67CB97E5@gmail.com>',
        inReplyTo: '<4FB16D5A.30808@gmail.com>',
        references: ['<4FB16D5A.30808@gmail.com>','<1299323903.19454@foo.bar>'],

        // bodystructure of the message
        bodystructure: {
            '1': {
                part: '1',
                type: 'text/plain',
                parameters: {},
                encoding: 'quoted-printable',
                size: 16
            },
            '2': {
                part: '2',
                type: 'text/html',
                parameters: {},
                encoding: 'quoted-printable',
                size: 248
            },
            type: 'multipart/alternative'
        }
    },
    ...
]
```

**NB!** If some properties are not present in a message, it may be not included
in the message object - for example, if there are no "cc:" addresses listed,
there is no "cc" field in the message object.

### Listing messages by UID

You can list messages by UID with

```javascript
client.listMessagesByUID(firstUID, lastUID, callback)
```

Where

  * **firstUI** is the UID value to start listing from
  * **lastUID** is the UID value to end listing with, can be a number or "*"
  * **callback** is the same as with `listMessage`

### Listing flags

As a shorthand listing, you can also list only UID and Flags pairs
```javascript
client.listFlags(from[, limit], callback)
```

Where

  * **from** is the index of the first message (0 based), you can use negative numbers to count from the end (-10 indicates the 10 last messages)
  * **limit** defines the maximum count of messages to fetch, if not set or 0 all messages from the starting position will be included
  * **callback** *(error, messages)* is the callback function to run with the message array

Example
```javascript
// list flags for newest 10 messages
client.listFlags(-10, function(err, messages){
    messages.forEach(function(message){
        console.log(message.UID, message.flags);
    });
});
```

Example output for a message listing
```javascript
[
    {
        // if uidvalidity changes, all uid values are void!
        UIDValidity: '664399135',

        // uid value of the message
        UID: 52,

        // message flags (Array)
        flags: [ '\\Flagged', '\\Seen' ]
    },
    ...
]
```

### Fetch message details

To fetch message data (flags, title, etc) for a specific message, use
```javascript
client.fetchData(uid, callback)
```

Where

  * **uid** is the UID value for the mail
  * **callback** *(error, message)* is the callback function to with the message data object (or null if the message was not found). Gets an error parameter if error occured

Example
```javascript
client.fetchData(123, function(error, message){
    console.log(message.flags);
});
```

### Fetch message contents

Message listing only retrieves the envelope part of the message. To get the full RFC822 message body
you need to fetch the message.
```javascript
var messageStream = client.createMessageStream(uid)
```

Where

  * **uid** is the UID value for the mail

Example (output message contents to console)
```javascript
client.createMessageStream(123).pipe(process.stdout, {end: false});
```

**NB!** If the opened mailbox is not in read-only mode, the message will be
automatically marked as read (\Seen flag is set) when the message is fetched.

### Searching for messages

You can search for messages with

```javascript
client.search(query[, isUID], callback)
```

Where

  * **query** is the search term as an object
  * **isUID** is an optional boolean value - if set to true perform `UID SEARCH` instead of `SEARCH`
  * **callback** is the callback function with error object and an array of matching seq or UID numbers

**Queries**

Queries are composed as objects where keys are search terms and values are term arguments. 
Only strings, numbers and Dates are used. If the value is an array, the members of it are processed separately
(use this for terms that require multiple params). If the value is a Date, it is converted to the form of "01-Jan-1970".
Subqueries (OR, NOT) are made up of objects

Examples:

```javascript
// SEARCH UNSEEN
query = {unseen: true}
// SEARCH KEYWORD "flagname"
query = {keyword: "flagname"}
// SEARCH HEADER "subject" "hello world"
query = {header: ["subject", "hello world"]};
// SEARCH UNSEEN HEADER "subject" "hello world"
query = {unseen: true, header: ["subject", "hello world"]};
// SEARCH OR UNSEEN SEEN
query = {or: {unseen: true, seen: true}};
// SEARCH UNSEEN NOT SEEN
query = {unseen: true, not: {seen: true}}
```

Returned list is already sorted and all values are numbers.

### Message flags

You can add and remove message flags like `\Seen` or `\Answered` with `client.addFlags()` and `client.removeFlags()`

**List flags**
```javascript
client.fetchFlags(uid, callback)
```

Where

  * **uid** is the message identifier
  * **callback** *(error, flags)* is the callback to run, gets message flags array as a parameter

**Add flags**
```javascript
client.addFlags(uid, flags, callback)
```

Where

  * **uid** is the message identifier
  * **flags** is the array of flags to be added
  * **callback** *(error, flags)* is the callback to run, gets message flags array as a parameter

**Remove flags**
```javascript
client.removeFlags(uid, flags, callback)
```

Where

  * **uid** is the message identifier
  * **flags** is the array of flags to be removed
  * **callback** *(error, flags)* is the callback to run, gets message flags array as a parameter

Example
```javascript
// add \Seen and \Flagged flag to a message
client.addFlags(123, ["\\Seen", "\\Flagged"], function(err, flags){
    console.log("Current flags for a message: ", flags);
});

// remove \Flagged flag from a message
client.removeFlags(123, ["\\Flagged"], function(err, flags){
    console.log("Current flags for a message: ", flags);
});
```

### Upload a message

You can upload a message to current mailbox with `client.storeMessage()`
```javascript
client.storeMessage(message[, flags], callback)
```

Where

  * **message** is the message to be uploaded either as a string or a Buffer.
  * **flags** is an array of flags to set to the message (ie. `["\\Seen"]`)
  * **callback** is the callback function, gets message UID and UID and UIDValitity as a param

Example
```javascript
client.storeMessage("From: ....", ["\\Seen"], function(err, params){
    console.log(err || params.UIDValidity +", "+ params.UID);
});
```

When adding a message to the mailbox, the new message event is also raised after
the mail has been stored.

### Copy a message

You can copy a message from the current mailbox to a selected one with `client.copyMessage()`
```javascript
client.copyMessage(uid, destination, callback)
```

Where

  * **uid** is the message identifier.
  * **destination** is the path to the destination mailbox
  * **callback** is the callback function

Example
```javascript
client.copyMessage(123, "[GMail]/Junk", function(err){
    console.log(err || "success, copied to junk");
});
```

### Move a message

You can move a message from current mailbox to a selected one with `client.moveMessage()`
```javascript
client.moveMessage(uid, destination, callback)
```

Where

  * **uid** is the message identifier.
  * **destination** is the path to the destination mailbox
  * **callback** is the callback function

Example
```javascript
client.moveMessage(123, "[GMail]/Junk", function(err){
    console.log(err || "success, moved to junk");
});
```

### Delete a message

You can delete a message from current mailbox with `client.deleteMessage()`
```javascript
client.deleteMessage(uid, callback)
```

Where

  * **uid** is the message identifier.
  * **callback** is the callback function

Example
```javascript
client.deleteMessage(123, function(err){
    console.log(err || "success, message deleted");
});
```

### Wait for new messages

You can listen for new incoming e-mails with event "new"
```javascript
client.on("new", function(message){
    console.log("New incoming message " + message.title);
});
```

## Complete example

Listing newest 10 messages:
```javascript
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
    client.openMailbox("INBOX", function(error, info){
        if(error) throw error;

        client.listMessages(-10, function(err, messages){
            messages.forEach(function(message){
                console.log(message.UID + ": " + message.title);
            });
        });

    });
});
```

## License

**MIT**
