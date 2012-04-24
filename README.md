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