import type { RuleSetRule } from 'webpack';
import { PACKAGE_NAME } from './const';
import { fail } from './utils';
/**
 * get the folder name after the last "node_moduels"
 * otherwise, the whole path
 */
export function getLoaderName(path: string) {
    const canonicalPath = path.replace(/\\/g, '/');
    const targetString = '/node_modules/';
    const index = canonicalPath.lastIndexOf(targetString);
    if (index === -1) return canonicalPath;
    const sub = canonicalPath.substring(index + targetString.length);
    const loaderName = sub.substring(0, sub.indexOf('/'));
    return loaderName;
}

function normalizeRuleCore(rule: RuleSetRule) {
    if (rule.loader) {
        rule.use = [rule.loader];
        if (rule.options) {
            rule.use[0] = { loader: rule.loader, options: rule.options };
            delete rule.options;
        }
        delete rule.loader;
    }

    if (rule.use) {
        if (typeof rule.use === 'function') {
            fail(`${PACKAGE_NAME} does not support "Rule.use" option as a function now.`);
        }
        if (!Array.isArray(rule.use)) rule.use = [rule.use];
        // Inject into the first one, so that our loader's pitch function is always called at first.
        const loaderPath = require.resolve('./loader', { paths: [__dirname] });
        rule.use.unshift(loaderPath);
    }

    if (rule.oneOf) {
        rule.oneOf = normalizeRules(rule.oneOf);
    }

    if (rule.rules) {
        rule.rules = normalizeRules(rule.rules);
    }

    return rule;
}

function normalizeRule(rule: RuleSetRule | undefined) {
    if (!rule) {
        return rule;
    }
    return normalizeRuleCore(rule);
}

export function normalizeRules(rules: RuleSetRule[] | undefined): RuleSetRule[] | undefined {
    if (!rules) {
        return rules;
    }

    if (Array.isArray(rules)) return rules.map(normalizeRuleCore);

    return rules;
}