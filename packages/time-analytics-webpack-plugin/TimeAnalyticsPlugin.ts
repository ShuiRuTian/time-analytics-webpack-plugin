import type { Compiler, Configuration, ModuleOptions, RuleSetRule } from 'webpack';
import { AnalyzeInfoKind, analyzer, WebpackMetaEventType } from './analyzer';
import { ProxyPlugin } from './ProxyPlugin';
import { normalizeRules } from './loaderHelper';
import { ConsoleHelper, fail, now } from './utils';
import './sideEffects/hackWeakMap';
import { PACKAGE_NAME } from './const';

export declare class WebpackPlugin {
    /**
     * Apply the plugin
     */
    apply(compiler: Compiler): void;
}

export type WebpackPluginLikeFunction = (this: Compiler, compiler: Compiler) => void;

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
}

interface WebpackConfigFactory {
    (...args: any[]): Configuration;
}

export class TimeAnalyticsPlugin implements WebpackPlugin {
    public apply(compiler: Compiler) {

        // Here is already too late, webpack uses weakMap internally in the constructor of Compiler.
        // Do this hack in WeakMap hack now.
        // #region Custom_Hooks
        // Prepare for custom hooks, which use `compiler` as key
        // Maybe `environment` or `afterEnvironment` hook? Or wrap the parametere directly?
        // compiler.hooks.initialize.tap({
        //     name: TimeAnalyticsPlugin.name,
        //     // Make sure to be called fistly
        //     stage: -100,
        // }, () => {
        //     assert(!(compiler as any)[WEBPACK_WEAK_MAP_ID_KEY], 'add unique id to compilation only once!');
        //     (compiler as any)[WEBPACK_WEAK_MAP_ID_KEY] = new WebpackWeakMapId();
        // });

        // Prepare for custom hook, which use `compilation` as key
        // compiler.hooks.thisCompilation.tap({
        //     name: TimeAnalyticsPlugin.name,
        //     // Make sure to be called fistly
        //     stage: -100,
        // }, (compilation) => {
        //     assert(!(compilation as any)[WEBPACK_WEAK_MAP_ID_KEY], 'add unique id to compilation only once!');
        //     (compilation as any)[WEBPACK_WEAK_MAP_ID_KEY] = new WebpackWeakMapId();
        // });
        // #endregion Custom_Hooks

        compiler.hooks.compile.tap(TimeAnalyticsPlugin.name, () => {
            analyzer.initilize();

            analyzer.collectWebpackInfo({
                hookType: WebpackMetaEventType.Compiler_compile,
                kind: AnalyzeInfoKind.webpackMeta,
                time: now(),
            });
        });

        compiler.hooks.done.tap(TimeAnalyticsPlugin.name, () => {
            analyzer.collectWebpackInfo({
                hookType: WebpackMetaEventType.Compiler_done,
                kind: AnalyzeInfoKind.webpackMeta,
                time: now(),
            });

            analyzer.output({
                filePath: this.option?.outputFile,
                dangerTimeLimit: this.option?.dangerTimeLimit ?? 8000,
                warnTimeLimit: this.option?.warnTimeLimit ?? 3000,
                ignoredLoaders: this.option?.loader?.exclude ?? [],
                groupLoaderByPath: this.option?.loader?.groupedByAbsolutePath ?? false,
            });
        });
    }

    constructor(public option: TimeAnalyticsPluginOptions | undefined) {
        this.option = option;
    }

    public static wrap(webpackConfigOrFactory: Configuration, options?: TimeAnalyticsPluginOptions): Configuration;
    public static wrap(webpackConfigOrFactory: Configuration, options?: TimeAnalyticsPluginOptions): WebpackConfigFactory;
    public static wrap(webpackConfigOrFactory: Configuration | WebpackConfigFactory, options?: TimeAnalyticsPluginOptions) {
        if (options?.enable === false) {
            return webpackConfigOrFactory;
        }
        const timeAnalyticsPlugin = new TimeAnalyticsPlugin(options);
        if (typeof webpackConfigOrFactory === 'function') {
            return (...args: any[]) => wrapConfigurationCore.call(timeAnalyticsPlugin, webpackConfigOrFactory(...args));
        }
        return wrapConfigurationCore.call(timeAnalyticsPlugin, webpackConfigOrFactory);
    }

    get isLoaderEnabled(): boolean {
        switch (typeof this.option?.enable) {
            case 'boolean':
                return this.option.enable;
            case 'object':
                return this.option.enable.loader;
            case 'undefined':
                return true;
            default:
                fail('TS has a strange error here. We could not use assertNever, use fail instead.');
        }
    }

    get isPluginEnabled(): boolean {
        switch (typeof this.option?.enable) {
            case 'boolean':
                return this.option.enable;
            case 'object':
                return this.option.enable.plugin;
            case 'undefined':
                return true;
            default:
                fail('TS has a strange error here. We could not use assertNever, use fail instead.');
        }
    }
}

function wrapConfigurationCore(this: TimeAnalyticsPlugin, config: Configuration): Configuration {
    const newConfig = { ...config };
    if (this.isPluginEnabled && newConfig.plugins) {
        newConfig.plugins = newConfig.plugins.map((plugin) => {
            const pluginName = plugin.constructor.name;
            if (this.option?.plugin?.exclude?.includes(pluginName)) {
                return plugin;
            }
            return wrapPluginCore(plugin);
        });
        newConfig.plugins = [this, ...newConfig.plugins];
    }
    if (this.isPluginEnabled && newConfig.optimization?.minimizer) {
        newConfig.optimization.minimizer = newConfig.optimization.minimizer
            .map((minimizer) => {
                const pluginName = minimizer.constructor.name;
                if (this.option?.plugin?.exclude?.includes(pluginName)) {
                    return minimizer;
                }
                return wrapMinimizer(minimizer);
            });
    }
    if (this.isLoaderEnabled && newConfig.module) {
        newConfig.module = injectModule(newConfig.module);
    }
    return newConfig;
}

/**
 * Fancy hack to judge whether an object is a Webpack plugin.
 */
export function isWebpackPlugin(p: any): p is WebpackPlugin {
    return typeof p.apply === 'function' && p.apply !== Object.apply;
}

type ArrayElement<ArrayType extends readonly unknown[]> =
    ArrayType extends readonly (infer ElementType)[] ? ElementType : never;

function wrapMinimizer(minimizer: ArrayElement<NonNullable<NonNullable<Configuration['optimization']>['minimizer']>>) {
    if (isWebpackPlugin(minimizer)) {
        return wrapPluginCore(minimizer);
    }
    ConsoleHelper.warn(`meet one minimizer which is a function, ${PACKAGE_NAME} can not analyze it now.`);
    return minimizer;
}

function wrapPluginCore(plugin: WebpackPlugin): WebpackPlugin {
    return new ProxyPlugin(plugin);
}

function injectModule(moduleOptions: ModuleOptions) {
    const newModuleOptions = { ...moduleOptions };
    if (newModuleOptions.rules) {
        if (!isRuleObjectArray(newModuleOptions.rules)) {
            fail('There is plain string "..." in "module.rules", why do you need this? Please submit an issue.');
        }

        newModuleOptions.rules = normalizeRules(newModuleOptions.rules);
    }

    return newModuleOptions;

    function isRuleObjectArray(rules: NonNullable<ModuleOptions['rules']>): rules is RuleSetRule[] {
        return rules.every(rule => rule !== '...');
    }
}