import { isSymbolObject } from "util/types";
import { Compiler, WebpackPluginFunction, WebpackPluginInstance } from "webpack";
import { WebpackPlugin } from "./plugin";
import { assert, fail } from "./utils";

const injectedPlugins = new Set<WebpackPluginInstance>();
const injectedPluginNames = new Set<string>();

function validatePluginIsUsedOnce(plugin: WebpackPluginInstance) {
    const pluginName = plugin.constructor.name;
    injectedPlugins.add(plugin);
    injectedPluginNames.add(plugin.constructor.name);
    if (injectedPlugins.size !== injectedPluginNames.size) {
        fail(`${pluginName} is used twice, why?`);
    }
}

export class ProxyPlugin implements WebpackPlugin {
    constructor() { }

    apply(compiler: Compiler): void {
        throw new Error("Method not implemented.");
    }

    private _proxyForCompiler(compiler: Compiler) {
        return new Proxy(compiler, {
            get: (target, property) => {
                if (property === 'hooks') {
                    const hooks = target[property];
                    return this._proxyForHooks(hooks);
                }
            },
        });

    }

    cachedProxyForHooks = new Map();

    private _proxyForHooks(hooks: any) {
        return getFromCacheOrCreate(this.cachedProxyForHooks, hooks, this._proxyForHooksWorker);
    }

    private _proxyForHooksWorker(hooks: any) {
        return new Proxy(hooks, {
            get: (target, property) => {
                // TODO: check inheritage from `Tapable`
                const hook = target[property];
                return this._proxyForHook(hook);
            },
        });
    }

    cachedProxyForHook = new Map();

    private _proxyForHook(hook: any) {
        return getFromCacheOrCreate(this.cachedProxyForHook, hook, this._proxyForHookWorker);
    }

    knownTapMethodNames = ['tap', 'tapAsync', 'tapPromise'];

    private _proxyForHookWorker(hook: any) {
        return new Proxy(hook, {
            get: (target, property) => {
                assert(!isSymbolObject(property), 'Getting Symbol property from hook, it should never happen, right?');
                assert(this.knownTapMethodNames.includes(property));
                const tapMethod = target[property];
                // Do the really work!
            },
        });
    }
}

function getFromCacheOrCreate<K, V>(cache: Map<K, V>, key: K, factory: (k: K) => V) {
    if (!cache.has(key)) {
        const proxyForHooks = factory(key);
        return cache.set(key, proxyForHooks);
    }
    return cache.get(key);
}

// create one proxy for each plugin
export function proxyForPlugin(plugin: WebpackPluginInstance) {
    validatePluginIsUsedOnce(plugin);
    return new ProxyPlugin();
}

