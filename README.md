# Root
This is a monorepo

## File structure
"./packages/time-analytics-webpack-plugin": The real plugin package.
"./packages/test": The test repos.

## Q&A

1. why monorepo? Why test is in a packge?

This repo is pretty easy, then why it is a monorepo?

The main purpose is to test the source code just like the real environment.

The plugin is kind of special, because it hacks many things. So it is subtle to only test logic, and it would be more confident to use it if it's tested in a real environment.

And put test in another package has some other benefits, like the type will not pollute other packages.
