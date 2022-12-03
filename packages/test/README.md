
# Q&A
1. why `mocha` rather than `jest`?

jest mocks "require" and not use the default `require`(maybe it use cache).

However, we need to mock `require` to do some tricks to loaders.
