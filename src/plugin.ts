import type { Compiler, Configuration, ModuleOptions, RuleSetRule, WebpackPluginInstance } from 'webpack';
import { analyzer } from './analyzer';
import { normalizeRules } from './ruleHelper';
import { fail } from './utils';

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

class TimeAnalyticsPlugin implements WebpackPlugin {
    public apply(compiler: Compiler) {

    }

    public static wrap(
        webpackConfigOrFactory: Configuration | WebpackConfigFactory,
        options: TimeAnalyticsPluginOptions,
    ) {
        analyzer.initilize();
        if (typeof webpackConfigOrFactory === 'function') {
            return (...args) => wrapConfigurationCore(webpackConfigOrFactory(...args));
        }
        return wrapConfigurationCore(webpackConfigOrFactory);
    }
}

function wrapPluginCore(plugin: WebpackPlugin): WebpackPlugin {
    const pluginName = plugin.constructor.name;
    return new WrappedPlugin(plugin, pluginName, analyzer);
}

function wrapConfigurationCore(config: Configuration): Configuration {
    if (config.plugins) {
        config.plugins = config.plugins.map(wrapPluginCore);
    }
    if (config.optimization && config.optimization.minimizer) {
        config.optimization.minimizer = config.optimization.minimizer
            .map(wrapPluginCore);
    }
    if (config.module) {
        config.module = injectModule(config.module);
    }
    return config;
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