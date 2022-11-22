# time-analytics-webpack-plugin
Profiling is the base of optimise.

## How to use it

## What is the difference with speed-measure-webpack-plugin?
speed-measure-webpack-plugin is dead, I think.

speed-measure-webpack-plugin is written in js, some surface is handled roughly.

speed-measure-webpack-plugin does not do many check, and this plugin is strict, we check many situations and if it's not handled, we just throw an error rather than behave as work successfully.

## How does it work?
To measure time, we must know when the loader starts and ends.

However, this is tricky, because when writing a loader, you do not want others influence your code. So how could we take over other's loader and plugin?

For loaders, the webpack will import the loader's module each time it's used. So we need to 
1. For cjs, take over `require` method. So that when webpack is requiring the loader module, we could do some extra work before and after the loader execute.
2. For mjs, the plugin does not work for now. But it is harder, because we are not able to take over `import` function, the only way I could come up with is create a temp file for the new wrap loader and change the target to it.

For plugins, we wrap the plugin with a custom plugin, which will create proxy for most of property of the compiler passed into.

## Thanks
`speed-measure-webpack-plugin`. An awesome plugin, which inspires this repo.

## Q&A
1. why `mocha` rather than `jest`?
jest mocks "require" and not use the default `require`(maybe it use cache).
However, we need to mock `require` to do some tricks to loaders.

1. why monorepo?
To test the source code just like the real case.

## Questions
1. In which condition, will `this.callback()` called? The doc says for multiple results, but it's kind of confused.

2. For js-debug
what is the difference
resolveSourceMapLocations
outFiles

3. For ts
class A{
    static foo(){
        hello.call(this); // no error, this is a bug?
    }
}
function hello(this:A){}