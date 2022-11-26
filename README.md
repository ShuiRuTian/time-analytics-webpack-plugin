# time-analytics-webpack-plugin
Profiling is the base of optimise.

## How to use it

## What is the difference with speed-measure-webpack-plugin?
speed-measure-webpack-plugin is dead, I think.

speed-measure-webpack-plugin is written in js, some surface is handled roughly.

speed-measure-webpack-plugin does not do many check, and this plugin is strict, we check many situations and if it's not handled, we just throw an error rather than behave as work successfully.

## Behavior
1. only the plugin wrapped in the origin webpack config could be analytized
    - the webpack internal plugin is not measured. But this might not be a limitation, if you want to measure internal plugin, you could submit an issue.
    - If one plugin adds more plugins internally, the added plugin will be ignored.

2. For custom hooks, 
    - feels like there is no way to hack.
    - even worse, there might be strange error, becasuse the reference of Proxy and target is different.
        - This plugin hacks WeakMap to avoid error, but polyfill could add a custom WeakMap, so it's kind of hard to give a promise.
        - Try to add a unique ID during hook `Compilation`(maybe `thisCompilation` is a better choice?)

## How does it work?
To measure time, we must know when the loader/plugins starts and ends.

However, this is tricky, because when writing a loader, you do not want others influence your code. So how could we take over other's loader and plugin?

For loaders, the webpack will import the loader's module each time it's used. So we need to 
1. For cjs, take over `require` method. So that when webpack is requiring the loader module, we could do some extra work before and after the loader execute.
2. For mjs, the plugin does not work for now. But it is harder, because we are not able to take over `import` function, the only way I could come up with is create a temp file for the new wrap loader and change the target to it.

For plugins, we wrap the plugin with a custom plugin, which will create proxy for most of property of the compiler passed into.

### Some details
In `speed-measure-webpack-plugin`, when using `mini-css-extract-plugin`, there is a strange error which is like "the plugin is not called".
The reason is the mini-css-extract-plugin's plugin will add a unique symbol to compilation object, and in the pitch loader of mini-css-extract-plugin, it will check the symbol.
Seems pretty reasonable! However, webpack is using a reference equal map in `getCompilationHooks`. But we are using Proxy to take over everything, the reference of a proxy is not the same as the origin target.

So how to resolve it?
1. Webpack could give each compilation a unique ID, then use the id as key.
2. Use defineProperty rather than proxy

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

3. For ts
class A{
    static foo(){
        hello.call(this); // no error, this is a bug?
    }
}
function hello(this:A){}