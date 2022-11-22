/* eslint-disable prefer-rest-params */
/* eslint-disable @typescript-eslint/no-shadow */
import chalk from 'chalk';
import { randomUUID } from 'crypto';
import path from 'path';
import type { LoaderDefinition, LoaderDefinitionFunction, PitchLoaderDefinitionFunction } from 'webpack';
import { AnalyzeInfoKind, analyzer, LoaderEventType, LoaderType } from './analyzer';
import { PACKAGE_LOADER_PATH, PACKAGE_NAME } from './const';
import { assert, now } from './utils';

type WrapLoaderFunction = (origionLoader: LoaderDefinition, loaderAbsolutePath: string) => LoaderDefinition;

// This is not the same as `require` function, but we hack `require` through override it.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const originModuleRequire = require('module').prototype.require;

// TODO: hack for mjs module, this is how webpack import module
// if(url === undefined) url = require("url");
// var loaderUrl = url.pathToFileURL(loader.path);
// var modulePromise = eval("import(" + JSON.stringify(loaderUrl.toString()) + ")");

function hackWrapLoaderModule(loaderPaths: string[], wrapLoaderModuleCallback: WrapLoaderFunction) {
    const wrapRequire = (requireMethod: NodeRequire) => {
        const wrappedRequire: NodeRequire = function (this: any, ...args) {
            assert(originModuleRequire === requireMethod);
            // although `require` should only accept one parameter and `this` binding should be undefined, we do want to make less surprise.
            const originExport = requireMethod.apply(this, args);
            // `id` is the input of `require`, like `require(id)`
            const id = args[0];
            const isOriginExportAWebpackLoader = loaderPaths.includes(id);
            if (isOriginExportAWebpackLoader) {
                assert(path.isAbsolute(id), 'Webpack should convert the loader path to absolute path. Although we not use this info.');
                console.log(`Wrap Require: it should be webpack which requires loader, the loader is ${id}`);
                // eslint-disable-next-line @typescript-eslint/no-use-before-define
                const isHackLoader = originExport === loader;

                if (isHackLoader) {
                    console.log(`Wrap Require: Hack require should not work for ${PACKAGE_LOADER_PATH}`);
                    return originExport;
                }
                // if (originExport.__smpHacked) return originExport;
                // originExport.__smpHacked = true;
                return wrapLoaderModuleCallback(originExport, id);
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
        System.import = wrapReq(System.import);
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Module = require('module');
    // TODO: check whether thread-loader works for this case or not
    Module.prototype.require = wrapRequire(originModuleRequire);
}

function getLoaderName(path: string) {
    // get the folder name after the last "node_moduels"
    // otherwise, the whole path
    const canonicalPath = path.replace(/\\/g, '/');
    const targetString = '/node_modules/';
    const index = canonicalPath.lastIndexOf(targetString);
    if (index === -1) return canonicalPath;
    const sub = canonicalPath.substring(index + targetString.length);
    const loaderName = sub.substring(0, sub.indexOf('/'));
    return loaderName;
}

const normalLoaderID = '__sg_is_origin_Loader';

function isNormalLoaderFunc(loaderFunc: LoaderDefinitionFunction | PitchLoaderDefinitionFunction): loaderFunc is LoaderDefinitionFunction {
    return !!(loaderFunc as any)[normalLoaderID];
}

const loader: LoaderDefinition = function timeAnalyticHackLoader(source) {
    console.log('Time analytics plugin: normal loader is executed');
    const loader = this.loaders[this.loaderIndex];
    const loaderName = getLoaderName(loader.path);
    return source;
};

/**
 * Override `require` method, so that we could return a wrapped loader function.
 * 
 * Each time the wrapped function is called, we could do some extra work.
 */
loader.pitch = function (this, q, w, e) {
    console.log('Time analytics plugin: pitch loader is executed, take over the "require" function');
    const analyzerInstance = analyzer;
    const resourcePath = this.resourcePath;
    const loaderPaths = this.loaders
        .map((l) => l.path)
        .filter((l) => !l.includes(PACKAGE_NAME));

    // Hack ourselves to overwrite the `require` method so we can override the
    // loadLoaders
    // `loaderModule` means the cjs or mjs module
    hackWrapLoaderModule(loaderPaths, function wrapLoaderModuleCallback(loaderModule, path) {
        const loaderName = getLoaderName(path);
        const wrapLoaderFunc = (originLoader: LoaderDefinition | PitchLoaderDefinitionFunction) => {
            // return originLoader;
            const uuid = randomUUID();

            const loaderType = isNormalLoaderFunc(originLoader) ? LoaderType.normal : LoaderType.pitch;
            const loaderTypeText = loaderType === LoaderType.pitch ? 'pitch' : 'normal';
            const wrappedLoader = function wrappedLoaderFunc() {
                const tmp = loaderName;
                console.log(`Wrapped loader: ${tmp}'s ${loaderTypeText} function is executed.`);
                // console.log('origin loader is ', originLoader);
                let isSync = true;

                const almostThis: any = Object.assign({}, this, {
                    async: () => {
                        isSync = false;
                        const originCallback = this.async(arguments);

                        return function () {
                            analyzerInstance.collectLoaderInfo({
                                callId: uuid,
                                loaderName,
                                kind: AnalyzeInfoKind.loader,
                                eventType: LoaderEventType.end,
                                loaderType,
                                loaderPath: path,
                                resourcePath,
                                time: now(),
                            });
                            const asyncResult = arguments[1];
                            console.log(`Origin loader: ${tmp}'s ${loaderTypeText} loader, async result is \n ${chalk.red(asyncResult)} `);
                            originCallback.apply(this, arguments);
                        };
                    },
                });

                analyzerInstance.collectLoaderInfo({
                    callId: uuid,
                    loaderName,
                    kind: AnalyzeInfoKind.loader,
                    eventType: LoaderEventType.start,
                    loaderType,
                    loaderPath: path,
                    resourcePath,
                    time: now(),
                });

                const ret = originLoader.apply(almostThis, arguments);

                // if it's an async loader, we return `undefined`, as webpack request
                // however, it feels not really matters
                if (!isSync) {
                    console.log(`Origin loader: ${tmp}'s ${loaderTypeText} loader, an async loader, return undefined`);
                    return undefined;
                } else {
                    console.log(`Origin loader: ${tmp}'s ${loaderTypeText} loader, not an async loader, result is ${chalk.redBright(ret)}`);
                }

                analyzerInstance.collectLoaderInfo({
                    callId: uuid,
                    loaderName,
                    kind: AnalyzeInfoKind.loader,
                    eventType: LoaderEventType.end,
                    loaderType,
                    loaderPath: path,
                    resourcePath,
                    time: now(),
                });
                return ret;
            };
            wrappedLoader.__origional_loader = originLoader;
            wrappedLoader.__origional_loader_type = loaderTypeText;
            return wrappedLoader;
        };

        return wrapLoaderModule(loaderModule);

        function wrapLoaderModule(module: any) {
            // do the same check as webpack itself
            if (typeof module !== 'function' && typeof module !== 'object') {
                throw new Error('Bad loader, time analytics plugin is using the same checek as webpack. However, it does not provide more info, disable it to see error from webpack itself.');
            }
            // get normal loader function according to module is mjs or cjs
            const originNormalLoaderFunc = typeof module === 'function' ? module : module.default;
            const originPitchLoaderFunc = module.pitch;
            const wrappedNormalLoaderFunc = originNormalLoaderFunc ? wrapLoaderFunc(originNormalLoaderFunc) : undefined;
            if (wrappedNormalLoaderFunc) {
                (wrappedNormalLoaderFunc as any)[normalLoaderID] = true;
            }

            const wrappedPitchLoaderFunc = originPitchLoaderFunc ? wrapLoaderFunc(originPitchLoaderFunc) : undefined;

            // convert the module from either cjs or mjs to a mocked mjs module.
            const mockModule = {
                ...module,
                default: wrappedNormalLoaderFunc,
                pitch: wrappedPitchLoaderFunc,
            };
            return mockModule;
        }
    });
};

module.exports = loader;
