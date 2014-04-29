# Contributing

New features are accepted to the master branch if

  * The feature is complete. It does what is expected by the description, eg. in case of *SEARCH* the method should implement all (or a reasonable amount of) search conditions and it would accept several untagged *SEARCH* responses not just the first one - even though servers tend to respond with only one untagged response, the spec allows several
  * The new feature follows the style of existing features
  * The feature is properly tested. For tests you can use Nodeunit and Hoodiecrow, see [test/inbox.js](test/inbox.js) for an example. Tests for a complete feature should have its own test file in the [test](test/) folder.

## Formatting

Use 4 spaces instead of tabs. Commas last. Use double quotes instead of single quotes where possible.