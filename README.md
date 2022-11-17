# webpack-analyze-plugin

## Questions
1. In which condition, will `this.callback()` called, the doc says for multiple results, but it's kind of confused.

2. For js-debug
what is the difference
resolveSourceMapLocations
outFiles

3. For ts
class A{
    static foo(){
        hello.call(this); // no error, this is a bug?
    }
}
function hello(this:A){}