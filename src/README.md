# time-analytics-webpack-plugin
Profiling is the base of optimise.

This plugin is still in an early eage, the API is not forzen and might be changed.

Consider about this, maybe you want to enable type-check so that you could know the option is changed.
## How to use it
Wrap the config, and use the wrapped config.

``` ts
const wrappedWebpackConfig = TimeAnalyticsPlugin.wrap(webpackConfig);

// Or use options to control behaviors
const wrappedWebpackConfig = TimeAnalyticsPlugin.wrap(webpackConfig,{ /* options */});
```

Or wrap a function that will return a configuration
```ts
const wrappedWebpackConfigFactory = TimeAnalyticsPlugin.wrap(webpackConfigFactory);
```

## What is the difference with speed-measure-webpack-plugin?
Highlight:
1. This plugin handles some more situations, like custom hooks, so it could measure "mini-css-extract-plugin" correctly.

2. This plugin is strict, we assert many situations even in the production code. We prefer to throw an error when meeting undefined behavior.

Lowlight:
1. I have no idea about some code in speed-measure-webpack-plugin. Is it legacy code or really useful for some situation?

## Why not fork speed-measure-webpack-plugin?
1. speed-measure-webpack-plugin is written in js, it's usually not a big deal to convert to ts, but this situation is kind of differnt, which uses many hack ways. It's more easier to rewrite the whole plugin in ts, this would also make it easier to maintain.
2. Not want to use the same API. For example, the wrap function should better to be static.

## Behavior
1. only the plugin wrapped in the origin webpack config could be analytized
    - the webpack internal plugin is not measured. But this might not be a limitation, if you want to measure internal plugin, you could submit an issue.
        - Maybe check normailzed configutation, does webpcak add all plugins at this time?
    - If one plugin adds more plugins internally, the added plugin will be ignored.

2. thread-loader is confused, I do see internal babel-loader rarely, but usually it's not in the output. However, if we not hack Compiler for custom hooks, it seems we could measure the internal loaders. Pretty interesting, but need time to investigate.

## How does it work?
To measure time, we must know when the loader/plugins starts and ends.

However, this is tricky, because when writing a loader, you do not want others influence your code. So how could we take over other's loader and plugin?

For loaders, the webpack will import the loader's module each time it's used. So we need to 
1. For cjs, take over `require` method. So that when webpack is requiring the loader module, we could do some extra work before and after the loader execute.
2. For mjs, the plugin does not work for now. But it is harder, because we are not able to take over `import` function, the only way I could come up with is create a temp file for the new wrap loader and change the target to it.

For plugins, we wrap the plugin with a custom plugin, which will create proxy for most of property of the compiler passed into.

For custom hooks in plugins:

In `speed-measure-webpack-plugin`, when using `mini-css-extract-plugin`, there is a strange error which is like "the plugin is not called".

The reason is the mini-css-extract-plugin's plugin will add a unique symbol to compilation object, and in the pitch loader of mini-css-extract-plugin, it will check the symbol.

Seems pretty reasonable! However, webpack is using a reference equal map in `getCompilationHooks`. But we are using Proxy to take over everything, the reference of a proxy is not the same as the origin target.

So how to resolve it?

We hack the `WeakMap`, when the key is `Compiler` or `Compilation`, we  will add a obejct and use that key object instead.

## Thanks
`speed-measure-webpack-plugin`. An awesome plugin, which inspires this repo.

## Q&A
1. why `mocha` rather than `jest`?

jest mocks "require" and not use the default `require`(maybe it use cache).

However, we need to mock `require` to do some tricks to loaders.

1. why monorepo?

To test the source code just like the real case.

1. why publish ts source file?

So it would be easier to debug. It's not a big deal to download a bit more files when they will not appear in production code.

## Questions
1. In which condition, will `this.callback()` called? The doc says for multiple results, but it's kind of confused.

3. For ts
```ts
class A{
    static foo(){
        hello.call(this); // no error, this is a bug? Because in static method, `this` should be the class itself("typeof A") rather than the class instance.
    }
}
function hello(this:A){}
```