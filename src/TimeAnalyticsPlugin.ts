import type { Compiler, Configuration, ModuleOptions, RuleSetRule } from 'webpack';
import { AnalyzeInfoKind, analyzer, WebpackMetaEventType } from './analyzer';
import { ProxyPlugin } from './ProxyPlugin';
import { normalizeRules } from './loaderHelper';
import { assert, fail, now } from './utils';
import './sideEffects/hackWeakMap';
import { COMPILATION_WEAK_MAP_ID_KEY } from './const';
import { WebpackCompilationWeakMapId } from './sideEffects/WeakMapIdObject';

export declare class WebpackPlugin {
    /**
     * Apply the plugin
     */
    apply(compiler: Compiler): void;
}

interface TimeAnalyticsPluginOptions {
    /**
     * If fase, do nothing
     * 
     * @default true
     */
    enable?: boolean;
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
         * If true, output the absolute path of the loader
         * 
         * @default false
         * @NotImplementYet
         */
        displayAbsolutePath?: boolean;
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
        compiler.hooks.thisCompilation.tap({
            name: TimeAnalyticsPlugin.name,
            // Make sure to be called fistly
            stage: -100,
        }, (compilation) => {
            assert(!(compilation as any)[COMPILATION_WEAK_MAP_ID_KEY], 'add unique id to compilation only once!');
            (compilation as any)[COMPILATION_WEAK_MAP_ID_KEY] = new WebpackCompilationWeakMapId();
        });

        compiler.hooks.compile.tap(TimeAnalyticsPlugin.name, () => {
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
        analyzer.initilize();
        const timeAnalyticsPlugin = new TimeAnalyticsPlugin(options);
        if (typeof webpackConfigOrFactory === 'function') {
            return (...args: any[]) => wrapConfigurationCore.call(timeAnalyticsPlugin, webpackConfigOrFactory(...args));
        }
        return wrapConfigurationCore.call(timeAnalyticsPlugin, webpackConfigOrFactory);
    }
}

function wrapConfigurationCore(this: TimeAnalyticsPlugin, config: Configuration): Configuration {
    const newConfig = { ...config };
    if (newConfig.plugins) {
        newConfig.plugins = newConfig.plugins.map((plugin) => {
            const pluginName = plugin.constructor.name;
            if (this.option?.plugin?.exclude?.includes(pluginName)) {
                return plugin;
            }
            return wrapPluginCore(plugin);
        });
        newConfig.plugins = [this, ...newConfig.plugins];
    }
    if (newConfig.optimization?.minimizer) {
        newConfig.optimization.minimizer = newConfig.optimization.minimizer
            .map((minimizer) => {
                const pluginName = minimizer.constructor.name;
                if (this.option?.plugin?.exclude?.includes(pluginName)) {
                    return minimizer;
                }
                return wrapMinimizer(minimizer);
            });
    }
    if (newConfig.module) {
        newConfig.module = injectModule(newConfig.module);
    }
    return newConfig;
}

function isWebpackPlugin(a: any): a is WebpackPlugin {
    return typeof a.apply === 'function';
}

type ArrayElement<ArrayType extends readonly unknown[]> =
    ArrayType extends readonly (infer ElementType)[] ? ElementType : never;

function wrapMinimizer(minimizer: ArrayElement<NonNullable<NonNullable<Configuration['optimization']>['minimizer']>>): WebpackPlugin {
    assert(isWebpackPlugin(minimizer), 'Could not handle if minimizer is not a plugin now.');
    return wrapPluginCore(minimizer);
}

function wrapPluginCore(plugin: WebpackPlugin): WebpackPlugin {
    return new ProxyPlugin(plugin);
}

function injectModule(moduleOptions: ModuleOptions) {
    const newModuleOptions = { ...moduleOptions };
    if (newModuleOptions.rules) {
        if (!isRuleObjectArray(newModuleOptions.rules)) {
            fail('There are plain string "..." in "module.rules", why do you need this? Please submit an issue.');
        }

        newModuleOptions.rules = normalizeRules(newModuleOptions.rules);
    }

    return newModuleOptions;

    function isRuleObjectArray(rules: NonNullable<ModuleOptions['rules']>): rules is RuleSetRule[] {
        return rules.every(rule => rule !== '...');
    }
}