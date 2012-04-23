var IMAPLineParser = require("../lib/lineparser");

var cp = new IMAPLineParser();

//cp.write("A654 FETCH 2:4 (FLAGS BODY[HEADER.FIELDS (DATE FROM)])");
//cp.write("* 23 FETCH (FLAGS (\\Seen) UID 4827313)");
/*
cp.write("* 12 FETCH (BODY[HEADER] {342}");
cp.writeLiteral("TERE TERE");
cp.write(" BODY[RFC] {123}");
cp.writeLiteral("VANA KERE");
cp.write(")");

cp.end();
*/

cp.on("line", function(line){console.log(require("util").inspect(line, false, 11));});

cp.write("* 12 FETCH (FLAGS (\\Seen) INTERNALDATE \"17-Jul-1996 02:44:25 -0700\" RFC822.SIZE 4286 ENVELOPE (\"Wed, 17 Jul 1996 02:23:25 -0700 (PDT)\" \"IMAP4rev1 WG mtg summary and minutes\" ((\"Terry Gray\" NIL \"gray\" \"cac.washington.edu\")) ((\"Terry Gray\" NIL \"gray\" \"cac.washington.edu\")) ((\"Terry Gray\" NIL \"gray\" \"cac.washington.edu\")) ((NIL NIL \"imap\" \"cac.washington.edu\")) ((NIL NIL \"minutes\" \"CNRI.Reston.VA.US\") (\"John Klensin\" NIL \"KLENSIN\" \"MIT.EDU\")) NIL NIL \"<B27397-0100000@cac.washington.edu>\") BODY (\"TEXT\" \"PLAIN\" (\"CHARSET\" \"US-ASCII\") NIL NIL \"7BIT\" 3028 92)) () B[]");

cp.end();

cp.end("* OK [ALERT] System shutdown in 10 minutes");

cp.end("BODY[]<0.2048>");




//console.log(require("util").inspect(cp.end(), false, 11));

//console.log(require("util").inspect(parseLine("14 FETCH (FL\\AGS (\\Seen \\Dele"), false, 7));

