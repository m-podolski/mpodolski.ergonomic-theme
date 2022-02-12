import fs from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import stripJsonComments from "strip-json-comments";

let buildMode;
let sourceFileName;

if (process.argv[2] === "--inspect") {
  buildMode = process.argv[3];
  sourceFileName = process.argv[4];
} else {
  buildMode = process.argv[2];
  sourceFileName = process.argv[3];
}
if (["map", "scheme"].includes(buildMode) === false) {
  console.log(`${buildMode} must be 'map' or 'scheme'`);
  process.exit();
}

const config = {
  fullFileName: `${sourceFileName}.json`,
  template: `templates/${sourceFileName}.json`,
  map: `colourMaps/${sourceFileName}.json`,
  mapSchema: "colourMapSchema.json",
  theme: `[ET] ${sourceFileName}.json`,
};

// Make an existing theme into a representation that gathers all scopes which belong to a certain colour

if (buildMode === "map") {
  let buffer = fs.readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), config.template),
  );
  let { type, colors, tokenColors } = JSON.parse(
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

  let colorMap = { $schema: config.mapSchema, type, colorsMap, tokenColorsMap };

  // protect against overwriting WIP-map-files

  let existingFiles = fs
    .readdirSync(join(dirname(fileURLToPath(import.meta.url)), "colourMaps"))
    .map((file) => file.slice(0, file.length - ".json".length));

  let regex = RegExp(`^${sourceFileName}-?(\\d{0,3})$`, "g");
  let matchingFiles = existingFiles.filter((val) => {
    return val.match(regex);
  });

  let fileNameIndex = matchingFiles.reduce((acc, val) => {
    let curIndex = Number(val.split("-")[1]);
    if (curIndex) {
      if (curIndex > acc) return curIndex;
    } else {
      return acc;
    }
  }, 0);

  let finalFileName;
  if (matchingFiles.length === 0) {
    finalFileName = `${sourceFileName}.json`;
  } else {
    finalFileName = `${sourceFileName}-${fileNameIndex + 1}.json`;
  }

  fs.writeFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "colourMaps", finalFileName),
    JSON.stringify(colorMap, null, 2),
  );
}

// Transform the hand-adjusted colour map back into a regular theme

if (buildMode === "scheme") {
  let buffer = fs.readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), config.map),
  );
  let { type, colorsMap, tokenColorsMap } = JSON.parse(
    stripJsonComments(buffer.toString(), { whitespace: false }),
  );

  let colors = colorsMap.reduce((acc, entry, i, array) => {
    entry.scopes.forEach((scope) => (acc[scope] = entry.newValue));
    if (i === array.length - 1) {
      let sorted = {};
      let sortedKeys = Object.keys(acc).sort();
      sortedKeys.forEach((entry) => (sorted[entry] = acc[entry]));
      return sorted;
    }
    return acc;
  }, {});

  let tokenColors = tokenColorsMap.reduce((acc, entry) => {
    entry.scopes.forEach((scope) => {
      return acc.push({
        scope,
        settings: {
          foreground: entry.newValue,
        },
      });
    });
    return acc;
  }, []);

  let theme = {
    $schema: "vscode://schemas/color-theme",
    type,
    colors,
    tokenColors,
  };

  let dir = dirname(fileURLToPath(import.meta.url));
  let root = dir.slice(0, dir.length - 4);

  fs.writeFileSync(
    join(root, "themes", config.theme),
    JSON.stringify(theme, null, 2),
  );

  // Update package.json with the new theme

  let packageJSON = JSON.parse(
    fs.readFileSync(join(root, "package.json")).toString(),
    { whitespace: false },
  );

  let newThemeEntry = {
    label: config.theme.slice(0, config.theme.length - 5),
    uiTheme: "vs",
    path: `./themes/${config.theme}`,
  };

  packageJSON.contributes.themes = packageJSON.contributes.themes.reduce(
    (acc, entry) => {
      let existingEntry = acc.findIndex(
        (accEntry) => accEntry.label === entry.label,
      );
      if (existingEntry === -1) {
        acc.push(newThemeEntry);
        return acc;
      }
      return acc;
    },
    [],
  );
  console.log(packageJSON.contributes.themes);

  fs.writeFileSync(
    join(root, "package.json"),
    JSON.stringify(packageJSON, null, 2),
  );
}
