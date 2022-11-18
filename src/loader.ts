/* eslint-disable prefer-rest-params */
/* eslint-disable @typescript-eslint/no-shadow */
import type { LoaderDefinition, PitchLoaderDefinitionFunction } from 'webpack';
import { AnalyzeInfoKind, analyzer, LoaderEventType, LoaderType } from './analyzer';
import { NS, PACKAGE_NAME } from './const';
import { now } from './utils';

type HackLoaderFunction = (loader: LoaderDefinition, loaderPath: string) => LoaderDefinition;

function hackWrapLoaders(loaderPaths: string[], callback: HackLoaderFunction) {
    const wrapRequire = (requireMethod: NodeRequire) => {
        const wrappedRequire: NodeRequire = function (this: any, ...args) {
            // although `require` should only accept one parameter and `this` binding should be undefined, we do want to make less surprise.
            const originExport = requireMethod.apply(this, args);
            // `id` is the input of `require`, like `require(id)`
            const id = args[0];
            const isOriginExportAWebpackLoader = loaderPaths.includes(id);
            if (isOriginExportAWebpackLoader) {
                if (originExport.__smpHacked) return originExport;
                originExport.__smpHacked = true;
                return callback(originExport, id);
            }
            return originExport;
        };
        wrappedRequire.resolve = requireMethod.resolve;
        wrappedRequire.extensions = requireMethod.extensions;
        wrappedRequire.cache = requireMethod.cache;
        wrappedRequire.main = requireMethod.main;
        return wrappedRequire;
    };

    // @ts-ignore
    if (typeof System === 'object' && typeof System.import === 'function') {
        // @ts-ignore
        debugger;
        // @ts-ignore
        System.import = wrapReq(System.import);
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Module = require('module');
    Module.prototype.require = wrapRequire(Module.prototype.require);
}

function getLoaderName(path: string) {
    // get the folder name after the last "node_moduels"
    const standardPath = path.replace(/\\/g, '/');
    const targetString = '/node_modules/';
    const index = standardPath.lastIndexOf(targetString);
    const sub = standardPath.substring(index + targetString.length);
    const loaderName = sub.substring(0, sub.indexOf('/'));
    return loaderName || '';
}

function isNormalLoaderFunc(loaderFunc: LoaderDefinition | PitchLoaderDefinitionFunction): loaderFunc is LoaderDefinition {
    return !!(loaderFunc as LoaderDefinition).pitch;
}

const loader: LoaderDefinition = function (source) {
    return source;
};

/**
 * Override `require` method, so that we could return a wrapped loader function.
 * 
 * Each time the wrapped function is called, we could do some extra work.
 */
loader.pitch = function (this, q, w, e) {
    const analyzerInstance = analyzer;
    const resourcePath = this.resourcePath;
    const loaderPaths = this.loaders
        .map((l) => l.path)
        .filter((l) => !l.includes(PACKAGE_NAME));

    // Hack ourselves to overwrite the `require` method so we can override the
    // loadLoaders
    hackWrapLoaders(loaderPaths, (loader, path) => {
        const loaderName = getLoaderName(path);
        const wrapLoader = (originLoader: LoaderDefinition | PitchLoaderDefinitionFunction) =>
            function wrappedLoader() {

                const loaderType = isNormalLoaderFunc(originLoader) ? LoaderType.pitch : LoaderType.normal;

                // const almostThis: any = Object.assign({}, this, {
                //     async: () => {
                //         const originCallback = this.async(arguments);

                //         return function () {
                //             analyzerInstance.collectLoaderInfo({
                //                 kind: AnalyzeInfoKind.loader,
                //                 eventType: LoaderEventType.end,
                //                 loaderType,
                //                 path,
                //                 resourcePath,
                //                 time: now(),
                //             });
                //             return originCallback.apply(this, arguments);
                //         };
                //     },
                // });

                analyzerInstance.collectLoaderInfo({
                    kind: AnalyzeInfoKind.loader,
                    eventType: LoaderEventType.start,
                    loaderType,
                    path,
                    resourcePath,
                    time: now(),
                });

                const ret = originLoader.apply(this, arguments);

                analyzerInstance.collectLoaderInfo({
                    kind: AnalyzeInfoKind.loader,
                    eventType: LoaderEventType.end,
                    loaderType,
                    path,
                    resourcePath,
                    time: now(),
                });
                return ret;
            };

        // @ts-ignore
        if (loader.normal) {
            console.log('In which condition will loader have a "normal" property?');
            // @ts-ignore
            loader.normal = wrapLoader(loader.normal);
        }
        // @ts-ignore
        if (loader.default) {
            console.log('In which condition will loader have a "default" property?');
            // @ts-ignore
            loader.default = wrapLoader(loader.default);
        }
        if (loader.pitch) loader.pitch = wrapLoader(loader.pitch);
        if (typeof loader === 'function') return wrapLoader(loader);
        return loader;
    });
};

module.exports = loader;
