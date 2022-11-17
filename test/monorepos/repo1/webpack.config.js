const path = require("path");
const webpack = require("webpack");

module.exports = {
  mode: "development",
  context: __dirname,
  entry: {
    bundle: "./app.js",
  },
  output: {
    path: path.join(__dirname, "./dist")
  },
  plugins: [
    new webpack.DefinePlugin({ FOO: "'BAR'" })
  ],
  module: {
    rules: [
      {
        test: /\.js?$/,
        use: "babel-loader"
      },
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader"]
      }
    ]
  }
};
