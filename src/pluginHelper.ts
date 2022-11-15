import { Compiler, WebpackPluginFunction, WebpackPluginInstance } from "webpack";
import { fail } from "./utils";

const injectedPlugins = new Set<WebpackPluginInstance>();
const injectedPluginNames = new Set<string>();

export function injectPlugin(plugin: WebpackPluginInstance) {
    const pluginName = plugin.constructor.name;
    injectedPlugins.add(plugin);
    injectedPluginNames.add(plugin.constructor.name);
    if (injectedPlugins.size !== injectedPluginNames.size) {
        fail(`${pluginName} is injected twice, why?`);
    }
    //noop
}

export function proxyForCompiler(compiler: Compiler) {
    const proxy = new Proxy(compiler, {
        get: (target, property) => {
            if (property === 'hooks') {

            }

        },
    });
}