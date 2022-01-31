const { merge } = require("webpack-merge");
const path = require("path");
const base = require("./webpack.config.js");

module.exports = merge(base, {
  mode: "production",
  output: {
    filename: "app.js",
    path: path.resolve(__dirname, "releases/stable"),
  },
});
