import { groupBy, path, prop } from 'ramda';
import { assert } from './utils';
import { Writer } from './writer';

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
    time: number;
    /**
     * source file that the loader is handling
     */
    resourcePath: string;
    /**
     * what does this event stands for, start or end.
     */
    eventType: LoaderEventType;
    /**
     * Whether this loader is async loader or sync loader.
     * 
     * async loader means this loader calls `this.async()`
     */
    isAsync: boolean;
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

export interface OutputOption {
    /**
     * If there is a path, will output the content to the file.
     * 
     * If file is not exist, will create it, but the folder must be existed.
     * 
     * If file is exist, overwrite the content.
     */
    filePath?: string;
    warnTimeLimit: number;
    dangerTimeLimit: number;
    groupLoaderByPath: boolean;
    /**
     * TODO: should we remove this option? Feels like we should not collect the info at all. Do this by give loader options.
     */
    ignoredLoaders: string[];
}

class WebpackTimeAnalyzer {
    private _isInitilized = false;

    initilize() {
        assert(this._isInitilized === false, '${PACKAGE_NAME} is initialized twice, why do you do this? Please submit an issue.');
        this._isInitilized = true;
    }

    clear() {
        assert(this._isInitilized === true, 'Time Analyzer must be initialized when clearing.');
        this._isInitilized = false;
        this.loaderData = [];
        this.pluginData = [];
        this.metaData = [];
    }

    private loaderData: LoaderEventInfo[] = [];

    collectLoaderInfo(loaderInfo: LoaderEventInfo) {
        this.loaderData.push(loaderInfo);
    }

    private pluginData: PluginEventInfo[] = [];

    collectPluginInfo(pluginInfo: PluginEventInfo) {
        this.pluginData.push(pluginInfo);
    }

    private metaData: WebpackMetaEventInfo[] = [];

    collectWebpackInfo(metaInfo: WebpackMetaEventInfo) {
        this.metaData.push(metaInfo);
    }

    output(option: OutputOption): void {
        assert(this._isInitilized === true, 'Time Analyzer must be initialized when outputing.');
        const tmp1 = analyticsOutputMetaInfo(this.metaData);
        const tmp2 = analyticsPluginInfos(this.pluginData);
        const tmp3 = analyticsOutputLoaderInfos(this.loaderData);

        Writer.foo(tmp1, tmp2, tmp3, option);

        this.clear();
    }
}

function isArraySortBy<T>(paths: string[], arr: T[]) {
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

export interface MetaAnalyticsResult {
    totalTime: number;
}

function analyticsOutputMetaInfo(data: WebpackMetaEventInfo[]): MetaAnalyticsResult {
    // validate
    assert(isArraySortBy(['time'], data), 'webpack meta event info should be sorted by time.');
    const compilerCompileEvents = data.filter(info => info.hookType === WebpackMetaEventType.Compiler_compile);
    assert(compilerCompileEvents.length === 1, 'webpack must start only once');
    const compilerDoneEvents = data.filter(info => info.hookType === WebpackMetaEventType.Compiler_done);
    assert(compilerDoneEvents.length === 1, 'webpack must done only once');

    const compileTotalTime = compilerDoneEvents[0].time - compilerCompileEvents[0].time;

    return {
        totalTime: compileTotalTime,
    };
}

export interface PluginAnalyticsResult {
    pluginsInfo: {
        name: string;
        time: number;
    }[];
}

function analyticsPluginInfos(data: PluginEventInfo[]): PluginAnalyticsResult {
    assert(isArraySortBy(['time'], data), 'plugin event info should be sorted by time.');

    const res: PluginAnalyticsResult = { pluginsInfo: [] };

    const nameGrouppedPlugin = groupBy(prop('pluginName'), data);
    Object.entries(nameGrouppedPlugin).forEach(([pluginName, dataA]) => {
        let currentPluginTotalTime = 0;
        const idGroupedPlugin = groupBy(prop('tapCallId'), dataA);
        Object.entries(idGroupedPlugin).forEach(([tapCallId, dataB]) => {
            assert(dataB.length === 2
                && dataB[0].eventType === PluginEventType.start
                && dataB[1].eventType === PluginEventType.end
                , 'each tap execution should be collected info for start and end, once and only once.');
            const tapTime = dataB[1].time - dataB[0].time;
            currentPluginTotalTime += tapTime;
        });
        res.pluginsInfo.push({ name: pluginName, time: currentPluginTotalTime });
    });
    return res;
}

export interface LoaderAnalyticsResult {
    loadersInfo: {
        path: string;
        time: number;
    }[];
}

function analyticsOutputLoaderInfos(data: LoaderEventInfo[]): LoaderAnalyticsResult {
    assert(isArraySortBy(['time'], data), 'loader event info should be sorted by time.');

    const res: LoaderAnalyticsResult = { loadersInfo: [] };

    const nameGrouppedLoader = groupBy(prop('loaderPath'), data);
    Object.entries(nameGrouppedLoader).forEach(([loaderPath, dataA]) => {
        let currentLoaderTotalTime = 0;
        const idGroupedPlugin = groupBy(prop('callId'), dataA);
        Object.entries(idGroupedPlugin).forEach(([callId, dataB]) => {
            assert(dataB.length === 2
                && dataB[0].eventType === LoaderEventType.start
                && dataB[1].eventType === LoaderEventType.end
                , `each laoder execution should be collected info for start and end, once and only once. But for ${loaderPath}, there is an error, why?`);
            const tapTime = dataB[1].time - dataB[0].time;
            currentLoaderTotalTime += tapTime;
        });

        res.loadersInfo.push({ path: loaderPath, time: currentLoaderTotalTime });
    });
    return res;
}

export const analyzer = new WebpackTimeAnalyzer();
