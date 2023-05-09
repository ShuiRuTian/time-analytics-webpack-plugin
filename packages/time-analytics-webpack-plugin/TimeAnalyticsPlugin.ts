import type { Compiler, Configuration as WebpackConfiguration, ModuleOptions, RuleSetRule, webpack } from 'webpack';
import { AnalyzeInfoKind, analyzer, WebpackMetaEventType } from './analyzer';
import { ProxyPlugin } from './ProxyPlugin';
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

// Tricky, seems typescript does not infer overload function parameters well.
export type MultiWebpackConfiguration = Parameters<typeof webpack>[0];

export function isMultiWebpackConfiguration(config: WebpackConfiguration | MultiWebpackConfiguration | WebpackConfigFactory): config is MultiWebpackConfiguration {
    return Array.isArray(config);
}

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

interface InternalContext { 
    /**
     * When webpack uses multiple configurations, we only want to apply TimeAnalyticsPlugin once,
     * to output only once and works correctly.
     * 
     * This works, because the webpack will reuse the `Compiler` for all of the configurations.
     * 
     * https://webpack.js.org/configuration/configuration-types/#exporting-multiple-configurations
     */
    isTimeAnalyticsPluginAdded :boolean;
}

interface WebpackConfigFactory {
    (...args: any[]): WebpackConfiguration | MultiWebpackConfiguration;
}

export class TimeAnalyticsPlugin implements WebpackPlugin {
    public apply(compiler: Compiler) {
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

    public static wrap(webpackConfigOrFactory: WebpackConfiguration, options?: TimeAnalyticsPluginOptions): WebpackConfiguration;
    public static wrap(webpackConfigOrFactory: MultiWebpackConfiguration, options?: TimeAnalyticsPluginOptions): MultiWebpackConfiguration;
    public static wrap(webpackConfigOrFactory: WebpackConfigFactory, options?: TimeAnalyticsPluginOptions): WebpackConfigFactory;
    public static wrap(webpackConfigOrFactory: WebpackConfiguration | MultiWebpackConfiguration | WebpackConfigFactory, options?: TimeAnalyticsPluginOptions) {
        if (options?.enable === false) {
            return webpackConfigOrFactory;
        }

        const internalOptions: TimeAnalyticsPluginOptions = {
            ...options,
        };

        const internalContext: InternalContext = {
            isTimeAnalyticsPluginAdded: false,
        };

        return TimeAnalyticsPlugin.wrapCore(webpackConfigOrFactory, internalOptions, internalContext);
    }

    private static wrapCore(webpackConfigOrFactory: WebpackConfiguration, options: TimeAnalyticsPluginOptions, context:InternalContext): WebpackConfiguration;
    private static wrapCore(webpackConfigOrFactory: MultiWebpackConfiguration, options: TimeAnalyticsPluginOptions, context:InternalContext): MultiWebpackConfiguration;
    private static wrapCore(webpackConfigOrFactory: WebpackConfigFactory, options: TimeAnalyticsPluginOptions, context:InternalContext): WebpackConfigFactory;
    private static wrapCore(webpackConfigOrFactory: WebpackConfiguration | MultiWebpackConfiguration | WebpackConfigFactory, options: TimeAnalyticsPluginOptions, context:InternalContext): WebpackConfiguration | MultiWebpackConfiguration | WebpackConfigFactory;
    private static wrapCore(webpackConfigOrFactory: WebpackConfiguration | MultiWebpackConfiguration | WebpackConfigFactory, options: TimeAnalyticsPluginOptions, context:InternalContext) {
        if (isMultiWebpackConfiguration(webpackConfigOrFactory)) {
            const res: MultiWebpackConfiguration = webpackConfigOrFactory.map(config => TimeAnalyticsPlugin.wrapCore(config, options, context));
            res.parallelism = webpackConfigOrFactory.parallelism;
            return res;
        }

        const timeAnalyticsPlugin = new TimeAnalyticsPlugin(options);

        if (typeof webpackConfigOrFactory === 'function') {
            return (...args: any[]) => wrapConfigurationCore.call(timeAnalyticsPlugin, webpackConfigOrFactory(...args), context);
        }

        return wrapConfigurationCore.call(timeAnalyticsPlugin, webpackConfigOrFactory, context);
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

function wrapConfigurationCore(this: TimeAnalyticsPlugin, config: WebpackConfiguration, context: InternalContext): WebpackConfiguration {
    const newConfig = { ...config };

    // ensure there is an array, so that `TimeAnalyticsPlugin` could be inserted anyway.
    newConfig.plugins = newConfig.plugins ?? [];

    if (this.isPluginEnabled) {
        newConfig.plugins = newConfig.plugins.map((plugin) => {
            const pluginName = plugin.constructor.name;
            if (this.option?.plugin?.exclude?.includes(pluginName)) {
                return plugin;
            }
            return wrapPluginCore(plugin);
        });
        if (!context.isTimeAnalyticsPluginAdded) {
            newConfig.plugins.push(this);
            context.isTimeAnalyticsPluginAdded = true;
        }
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
 * Fancy hack to judge whether an object is a Webpack plugin or function.
 */
export function isWebpackPlugin(p: any): p is WebpackPlugin {
    return typeof p.apply === 'function' && p.apply !== Object.apply;
}

type ArrayElement<ArrayType extends readonly unknown[]> =
    ArrayType extends readonly (infer ElementType)[] ? ElementType : never;

function wrapMinimizer(minimizer: ArrayElement<NonNullable<NonNullable<WebpackConfiguration['optimization']>['minimizer']>>) {
    if (isWebpackPlugin(minimizer)) {
        return wrapPluginCore(minimizer);
    }
    ConsoleHelper.warn('could not handle function-like minimizer, please convert it to the plugin-like form.');
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


function normalizeRule(rule: RuleSetRule) {
    if (rule.loader) {
        rule.use = [rule.loader];
        if (rule.options) {
            rule.use[0] = { loader: rule.loader, options: rule.options };
            delete rule.options;
        }
        delete rule.loader;
    }

    if (rule.use) {
        if (typeof rule.use === 'function') {
            fail(`${PACKAGE_NAME} does not support "Rule.use" option as a function now.`);
        }
        if (!Array.isArray(rule.use)) rule.use = [rule.use];
        // Inject into the first one, so that our loader's pitch function is always called at first.
        const loaderPath = require.resolve('./loader', { paths: [__dirname] });
        rule.use.unshift(loaderPath);
    }

    if (rule.oneOf) {
        rule.oneOf = normalizeRules(rule.oneOf);
    }

    if (rule.rules) {
        rule.rules = normalizeRules(rule.rules);
    }

    return rule;
}

function normalizeRules(rules: RuleSetRule[] | undefined): RuleSetRule[] | undefined {
    if (!rules) {
        return rules;
    }

    if (Array.isArray(rules)) return rules.map(normalizeRule);

    return rules;
}