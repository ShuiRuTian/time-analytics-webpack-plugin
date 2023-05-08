# time-analytics-webpack-plugin
Profiling is the base of optimise.

This plugin will tell the time of loaders and plugins quickly.

## Install
Use your favorite package manager:

``` sh
npm install --save-dev time-analytics-webpack-plugin
```

or

``` sh
yarn add -D time-analytics-webpack-plugin
```

or

``` sh
pnpm i -D time-analytics-webpack-plugin
```

## Output
By default, the result will be logged into console, but it's able to set the options to make it write to some file.

```
┌── time-analytics-webpack-plugin
│ Webpack compile takes 212.00251600146294ms
├── Plugins
│ Plugin TerserPlugin takes 257.66442596912384ms
│ Plugin MiniCssExtractPlugin takes 1.021947979927063ms
│ Plugin DefinePlugin takes 0.03626999258995056ms
│ All plugins take 258.72264394164085ms
├── Loaders
│ Loader babel-loader takes 161.88674998283386ms
│ Loader mini-css-extract-plugin takes 190.57009398937225ms
│ Loader css-loader takes 12.007494986057281ms
│ All loaders take 364.4643389582634ms
```

Note that all loaders take even more time than the whole time! How could this be possible?

This is due to how to calcuate the time:

- For `webpack compilet time`, it means the time difference between hooks `Compiler.compile` and `Compiler.done`.

- For loaders, each time some resource is executed by some loader, we record the start time and the end time. However, 
    - loader might be async, we only record the time when the returned function of `this.async()` is called. -
      - If there is any OS call(like read/write file), we have to include that time.
      - Event loop might make it not accurate, because a callback will not be called immediately when it's ready(only if execution stack is empty and all ready tasks before this task in task queue is executed).
    - loader might be parallel.

## Usage
Wrap the webpack config and use the returned config:

``` ts
import { TimeAnalyticsPlugin } from 'time-analytics-webpack-plugin';

const webpackConfig = {...}; // This is a valid webpack config, which you used to export.

// Wrap it and use the new wrapped config
const wrappedWebpackConfig = TimeAnalyticsPlugin.wrap(webpackConfig); // <-- This is the new config, use it so that we 

// Or use options to control behaviors
const wrappedWebpackConfig = TimeAnalyticsPlugin.wrap(webpackConfig,{ /* options */});
```

Or wrap a function that will return a configuration
```ts
import { TimeAnalyticsPlugin } from 'time-analytics-webpack-plugin';

const webpackConfigFactory = (parameters) => {
    // ...
    return webpackconfig;
}

const wrappedWebpackConfigFactory = TimeAnalyticsPlugin.wrap(webpackConfigFactory); // <-- Wrap the factory

const wrappedWebpackConfig = wrappedWebpackConfigFactory(parameters); // <-- the config is already wrapped, you could use it directly.

```

## Options 

Type should be the document. Please provide any feedback if you think it's not enough.

``` ts

interface TimeAnalyticsPluginOptions {
    /**
     * If fase, do nothing
     * 
     * If true, output all loader and plugin infos.
     * 
     * If object, loader and plugin could be turn off.
     * 
     * Control loader and plugin with fine grained in `loader` and `plugin` options (not this option)
     * 
     * @default true
     */
    enable?: boolean | {
        /**
         * @default true
         */
        loader: boolean,
        /**
         * @default true
         */
        plugin: boolean,
    };

    /**
     * If provided, write the result to a file.
     * 
     * Otherwise the stdout stream.
     */
    outputFile?: string;
    /**
     * Display the time as warning color if time is more than this limit.
     * 
     * The unit is ms.
     * 
     * @default 3000
     */
    warnTimeLimit?: number;
    /**
     * Display the time as danger color if time is more than this limit.
     * 
     * The unit is ms.
     * 
     * @default 8000
     */
    dangerTimeLimit?: number;
    loader?: {
        /**
         * If true, output the absolute path of the loader.
         * 
         * By default, the plugin displays loader time by a assumed loader name
         * 
         * Like `babel-loader takes xxx ms.`
         * 
         * The assumption is the loader's name is the first name after the last `node_modules` in the path. 
         * 
         * However, sometimes, it's not correct, like the loader's package is `@foo/loader1` then the assumed name is "@foo", 
         * or some framework like `next` will move the loader to some strange place.
         * 
         * @default false
         */
        groupedByAbsolutePath?: boolean;
        /**
         * If true, display the most time consumed resource's info
         * 
         * @default 0
         * @NotImplementYet
         */
        topResources?: number;
        /**
         * The loaders that should not be analytized.
         * 
         * Use the node package's name.
         */
        exclude?: string[];
    };
    plugin?: {
        /**
         * The plugins that should not be analytized.
         * 
         * The name is the plugin class itself, not the package's name.
         */
        exclude?: string[];
    }
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

We hack the `WeakMap`, when the key is `Compiler` or `Compilation`, we  will add an obejct and use it as key instead.

## Thanks
`speed-measure-webpack-plugin`. An awesome plugin, which inspires this repo.

## Q&A
1. why publish ts source file?

So it would be easier to debug. It's not a big deal to download a bit more files if they will not appear in production code.

## Questions
1. In which condition, will `this.callback()` be called? The doc says for multiple results, but it's kind of confused.
