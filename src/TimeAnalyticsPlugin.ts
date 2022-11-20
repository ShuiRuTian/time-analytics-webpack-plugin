import type { Compiler, Configuration, ModuleOptions, RuleSetRule } from 'webpack';
import { NormalModule } from 'webpack';
import { AnalyzeInfoKind, analyzer, WebpackMetaEventType } from './analyzer';
import { ProxyPlugin } from './ProxyPlugin';
import { normalizeRules } from './ruleHelper';
import { assert, fail, now } from './utils';

export declare class WebpackPlugin {
    /**
     * Apply the plugin
     */
    apply(compiler: Compiler): void;
}

interface TimeAnalyticsPluginOptions {
    _noop: never;
}

interface WebpackConfigFactory {
    (...args: any[]): Configuration;
}

export class TimeAnalyticsPlugin implements WebpackPlugin {
    public apply(compiler: Compiler) {
        compiler.hooks.compilation.tap(TimeAnalyticsPlugin.name, (compilation) => {
            NormalModule.getCompilationHooks(compilation).loader.tap(TimeAnalyticsPlugin.name, (loader, module) => {
                // debugger;
            });
            NormalModule.getCompilationHooks(compilation).beforeLoaders.tap(TimeAnalyticsPlugin.name, (loaders, module, obj) => {
                // debugger;
            });
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

            debugger;
        });
    }

    public static wrap(webpackConfigOrFactory: Configuration, options?: TimeAnalyticsPluginOptions): Configuration;
    public static wrap(webpackConfigOrFactory: Configuration, options?: TimeAnalyticsPluginOptions): WebpackConfigFactory;
    public static wrap(webpackConfigOrFactory: Configuration | WebpackConfigFactory, options?: TimeAnalyticsPluginOptions) {
        analyzer.initilize();
        const timeAnalyticsPlugin = new TimeAnalyticsPlugin();
        if (typeof webpackConfigOrFactory === 'function') {
            return (...args: any[]) => wrapConfigurationCore.call(timeAnalyticsPlugin, webpackConfigOrFactory(...args));
        }
        return wrapConfigurationCore.call(timeAnalyticsPlugin, webpackConfigOrFactory);
    }
}

function wrapConfigurationCore(this: TimeAnalyticsPlugin, config: Configuration): Configuration {
    if (config.plugins) {
        config.plugins = config.plugins.map(wrapPluginCore);
        config.plugins = [this, ...config.plugins];
    }
    if (config.optimization && config.optimization.minimizer) {
        config.optimization.minimizer = config.optimization.minimizer
            .map(wrapMinimizer);
    }
    if (config.module) {
        config.module = injectModule(config.module);
    }
    return config;
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
    const pluginName = plugin.constructor.name;
    return new ProxyPlugin(plugin);
}

function injectModule(module: ModuleOptions) {
    if (module.rules) {
        if (!isRuleObjectArray(module.rules)) {
            fail('There are plain string "..." in "module.rules", why do you need this? Please submit an issue.');
        }

        module.rules = normalizeRules(module.rules);
    }

    return module;

    function isRuleObjectArray(rules: NonNullable<ModuleOptions['rules']>): rules is RuleSetRule[] {
        return rules.every(rule => rule !== '...');
    }
}