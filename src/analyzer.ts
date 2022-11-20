import { PACKAGE_NAME } from './const';
import { fail } from './utils';



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


    loaderInfos: LoaderEventInfo[] = [];

    collectLoaderInfo(loaderInfo: LoaderEventInfo) {
        this.loaderInfos.push(loaderInfo);
    }

    pluginInfos: PluginEventInfo[] = [];

    collectPluginInfo(pluginInfo: PluginEventInfo) {
        this.pluginInfos.push(pluginInfo);
    }

    metaInfo: WebpackMetaEventInfo[] = [];

    collectWebpackInfo(metaInfo: WebpackMetaEventInfo) {
        this.metaInfo.push(metaInfo);
    }
}

export const analyzer = new WebpackTimeAnalyzer();
