import chalk, { Chalk } from 'chalk';
import { curry, groupBy, path, prop } from 'ramda';
import { PACKAGE_NAME } from './const';
import { assert, fail } from './utils';

export enum AnalyzeInfoKind {
    loader,
    plugin,
    webpackMeta,
}

export enum LoaderType {
    pitch,
    normal,
}

export enum LoaderEventType {
    start,
    end,
}

export interface LoaderEventInfo {
    /**
     * Id for each pitch/normal loader function call .
     * 
     * pitch and normal loader function for the same resource also have different call Id.
     */
    callId: string;
    kind: AnalyzeInfoKind.loader;
    loaderType: LoaderType;
    /**
     * the absolute path to the loader
     */
    loaderPath: string;
    loaderName: string;
    time: number;
    /**
     * source file that the loader is handling
     */
    resourcePath: string;
    /**
     * what does this event stands for, start or end.
     */
    eventType: LoaderEventType;
}

export enum TapType {
    normal,
    async,
    promise,
}

export enum PluginEventType {
    start,
    end,
}

export interface PluginEventInfo {
    kind: AnalyzeInfoKind.plugin;
    /**
     * The name of the plugin
     */
    pluginName: string;
    /**
     * The first parameter of tap function, is this useful?
     * 
     * For now, we are accessing the name through `pluginInstance.constructor.name`
     */
    tapId?: never;
    time: number;
    tapType: TapType;
    /**
     * ID for each tap call.
     */
    tapCallId: string;
    /**
     * what does this event stands for, start or end.
     */
    eventType: PluginEventType;
}

/**
 * The exact one hook of webpack
 * 
 * Name format is `${hooks container name}_${hook name}`
 */
export enum WebpackMetaEventType {
    Compiler_compile,
    Compiler_done,
}

/**
 * The aim is to record timestap of some event which only runs for once
 */
export interface WebpackMetaEventInfo {
    kind: AnalyzeInfoKind.webpackMeta;
    time: number;
    hookType: WebpackMetaEventType,
}

export type AnalyzeEventInfo = LoaderEventInfo | PluginEventInfo;

class WebpackTimeAnalyzer {
    private _isInitilized = false;

    initilize() {
        if (this._isInitilized) {
            fail(`${PACKAGE_NAME} is initialized twice, why do you do this? Please submit an issue.`);
        }
        this._isInitilized = true;
    }

    loaderData: LoaderEventInfo[] = [];

    collectLoaderInfo(loaderInfo: LoaderEventInfo) {
        this.loaderData.push(loaderInfo);
    }

    pluginData: PluginEventInfo[] = [];

    collectPluginInfo(pluginInfo: PluginEventInfo) {
        this.pluginData.push(pluginInfo);
    }

    metaData: WebpackMetaEventInfo[] = [];

    collectWebpackInfo(metaInfo: WebpackMetaEventInfo) {
        this.metaData.push(metaInfo);
    }

    output(): void {
        outputMetaInfo(this.metaData);
        outputPluginInfos(this.pluginData);
        outputLoaderInfos(this.loaderData);
    }
}

const fooTime = curry((limit: number, color: Chalk, time: number) => {
    if (time >= limit) {
        const formatedTime = color(time.toString() + 'ms');
        return color(formatedTime);
    }
    return undefined;
});

const dangerTime = fooTime(6000, chalk.red);
const warnTime = fooTime(3000, chalk.yellow);
const safeTime = fooTime(0, chalk.green);

function prettyTime(ms: number) {
    for (const func of [dangerTime, warnTime, safeTime]) {
        const res = func(ms);
        if (res)
            return res;
    }

    fail('We did not give a pretty message about time, why?');
}

function isSortBy<T>(paths: string[], arr: T[]) {
    let prevValue = 0;

    for (const item of arr) {
        const curValue: any = path(paths, item);
        assert(typeof curValue === 'number');
        if (curValue < prevValue) {
            return false;
        }
        prevValue = curValue;
    }
    return true;
}

function outputMetaInfo(data: WebpackMetaEventInfo[]) {
    // validate
    assert(isSortBy(['time'], data), 'webpack meta event info should be sorted by time.');
    const compilerCompileEvents = data.filter(info => info.hookType === WebpackMetaEventType.Compiler_compile);
    assert(compilerCompileEvents.length === 1, 'webpack must start once');
    const compilerCompileEvent = compilerCompileEvents[0];
    const compilerDonwEvents = data.filter(info => info.hookType === WebpackMetaEventType.Compiler_done);
    assert(compilerDonwEvents.length === 1, 'webpack must done once');
    const compilerDonwEvent = compilerDonwEvents[0];

    const compileTotalTime = compilerDonwEvent.time - compilerCompileEvent.time;
    console.log(`Webpack compile takes ${prettyTime(compileTotalTime)}`);
}

function outputPluginInfos(data: PluginEventInfo[]) {
    assert(isSortBy(['time'], data), 'plugin event info should be sorted by time.');
    let allPluginTime = 0;
    const nameGrouppedPlugin = groupBy(prop('pluginName'), data);
    Object.entries(nameGrouppedPlugin).forEach(([pluginName, dataA]) => {
        let currentPluginTotalTime = 0;
        const idGroupedPlugin = groupBy(prop('tapCallId'), dataA);
        Object.entries(idGroupedPlugin).forEach(([tapCallId, dataB]) => {
            assert(dataB.length === 2
                && dataB[0].eventType === PluginEventType.start
                && dataB[1].eventType === PluginEventType.end
                , 'each tap should start once and end once');
            const tapTime = dataB[1].time - dataB[0].time;
            currentPluginTotalTime += tapTime;
        });
        allPluginTime += currentPluginTotalTime;
        console.log(`Plugin ${pluginName} takes ${prettyTime(currentPluginTotalTime)}`);
    });
    console.log(`All plugins take ${prettyTime(allPluginTime)}`);
}

function outputLoaderInfos(data: LoaderEventInfo[]) {
    assert(isSortBy(['time'], data), 'loader event info should be sorted by time.');
    let allLoaderTime = 0;
    const nameGrouppedLoader = groupBy(prop('loaderName'), data);
    Object.entries(nameGrouppedLoader).forEach(([loaderName, dataA]) => {
        let currentLoaderTotalTime = 0;
        const idGroupedPlugin = groupBy(prop('callId'), dataA);
        Object.entries(idGroupedPlugin).forEach(([callId, dataB]) => {
            assert(dataB.length === 2
                && dataB[0].eventType === LoaderEventType.start
                && dataB[1].eventType === LoaderEventType.end
                , 'each tap should start once and end once');
            const tapTime = dataB[1].time - dataB[0].time;
            currentLoaderTotalTime += tapTime;
        });
        allLoaderTime += currentLoaderTotalTime;
        console.log(`Loader ${loaderName} takes ${prettyTime(currentLoaderTotalTime)}`);
    });
    console.log(`All loaders take ${prettyTime(allLoaderTime)}`);
}

export const analyzer = new WebpackTimeAnalyzer();
