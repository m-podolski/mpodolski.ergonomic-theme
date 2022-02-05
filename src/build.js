import fs from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import stripJsonComments from "strip-json-comments";

const buildMode = process.argv[2];
if (buildMode !== ("map" || "scheme")) {
  console.log(`${buildMode} must be 'map' or 'scheme'`);
  process.exit();
}

const sourceFileName = process.argv[3];

const config = {
  input: `templates/${sourceFileName}.json`,
  output: `colourMaps/${sourceFileName}.json`,
  schema: "colourMapSchema.json",
};

if (buildMode === "map") {
  let buffer = fs.readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), config.input),
  );
  let { colors, tokenColors } = JSON.parse(
    stripJsonComments(buffer.toString(), { whitespace: false }),
  );

  let colorsMap = Object.keys(colors).reduce((acc, color) => {
    let existingEntry = acc.findIndex(
      (entry) => entry.orgValue === colors[color],
    );

    if (existingEntry !== -1) {
      acc[existingEntry].scopes.push(color);
    } else {
      acc.push({
        name: "",
        orgValue: colors[color],
        newValue: colors[color],
        scopes: [color],
      });
    }

    return acc;
  }, []);

  let tokenColorsMap = tokenColors.reduce((acc, color) => {
    let existingEntry = acc.findIndex(
      (entry) => entry.orgValue === color.settings.foreground,
    );

    if (existingEntry !== -1) {
      acc[existingEntry].scopes.push(color.scope);
    } else {
      acc.push({
        name: "",
        orgValue: color.settings.foreground,
        newValue: color.settings.foreground,
        scopes: [color.scope],
      });
    }

    return acc;
  }, []);

  let colorMap = { $schema: config.schema, colorsMap, tokenColorsMap };

  fs.writeFileSync(
    join(dirname(fileURLToPath(import.meta.url)), config.output),
    JSON.stringify(colorMap, null, 2),
  );
}

if (buildMode === "scheme") {
}
