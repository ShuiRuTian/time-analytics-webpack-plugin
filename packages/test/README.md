## How to debug test?
The test cases are written in mocha, so you could know how to debug it with reading the official web of mocha.

Here is how I run the tests:
1. Open the project with VSCode in the root folder.
1. Make sure extension `Mocha Test Explorer` is installed.
1. Use `Mocha Test Explorer` to debug the case!

## Q&A
1. why `mocha` rather than `jest`?

`jest` mocks "require" itself and not use the default `require`(not sure, maybe it uses cache, anyway its behavior is not usual).

But we need to mock `require` to do some tricks to loaders.
