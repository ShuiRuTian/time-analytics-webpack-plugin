const path = require("path");
const webpack = require("webpack");
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const TerserPlugin = require("terser-webpack-plugin");

/**
 * @type {import("webpack").Configuration}
 */
const baseConfiguration = {
  mode: "production",
  context: __dirname,
  entry: {
    bundle: "./app.js",
  },
  output: {
    path: path.join(__dirname, "./dist")
  },
  plugins: [
    new MiniCssExtractPlugin(),
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
        use: [MiniCssExtractPlugin.loader, /* "style-loader", */ "css-loader"]
      }
    ]
  },
  optimization: {
    minimize: false,
    minimizer: [
      // TerserPlugin need some properties of compiler.webpack function
      new TerserPlugin({ parallel: true }),
    ],
  },
};

module.exports = [
  {
    ...baseConfiguration,
    output: {
      path: path.join(__dirname, "./dist1")
    },
  },
  {
    ...baseConfiguration,
    output: {
      path: path.join(__dirname, "./dist2")
    },
  }
]
