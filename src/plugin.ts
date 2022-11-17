import type { Compiler, Configuration, ModuleOptions, RuleSetRule, WebpackPluginInstance } from 'webpack';
import { analyzer } from './analyzer';
import { ProxyPlugin } from './ProxyPlugin';
import { normalizeRules } from './ruleHelper';
import { assert, fail } from './utils';

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

    }
    
    public static wrap(webpackConfigOrFactory: Configuration, options?: TimeAnalyticsPluginOptions): Configuration;
    public static wrap(webpackConfigOrFactory: Configuration, options?: TimeAnalyticsPluginOptions): WebpackConfigFactory;
    public static wrap(webpackConfigOrFactory: Configuration | WebpackConfigFactory, options?: TimeAnalyticsPluginOptions) {
        analyzer.initilize();
        if (typeof webpackConfigOrFactory === 'function') {
            return (...args: any[]) => wrapConfigurationCore(webpackConfigOrFactory(...args));
        }
        return wrapConfigurationCore(webpackConfigOrFactory);
    }
}

function wrapConfigurationCore(config: Configuration): Configuration {
    if (config.plugins) {
        config.plugins = config.plugins.map(wrapPluginCore);
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