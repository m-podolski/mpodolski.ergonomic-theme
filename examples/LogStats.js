import React from "react";
import LogStatsTotals from "./LogStatsTotals";
import LogStatsProportions from "./LogStatsProportions";
import LogStatsTimeline from "./LogStatsTimeline";
import LogStatsGraph from "./LogStatsGraph";
import { findTrainingField } from "../models";
import {
  months,
  dateTime,
  timeToFloatHours,
  parseFloatNaNSafe,
  floatHoursToTime,
  onlyFloatToDecPlaces2,
} from "../library";
import "../sass/components/_LogStats.scss";

function LogStats({ fields, logs, settings }) {
  function makeTrainingTotals(fieldsConfig) {
    const trainingResults = Object.keys(fieldsConfig.options).reduce(
      (trainingResults, option) => {
        const trainingOptionKeys = Object.keys(
          fieldsConfig.options[option].fields,
        );
        let resultFields;
        // Leave out training types which have no results
        if (trainingOptionKeys.length > 0) {
          resultFields = trainingOptionKeys.reduce((resultFields, field) => {
            resultFields[field] = {
              label: fieldsConfig.options[option].fields[field].label,
              unit: fieldsConfig.options[option].fields[field].unit,
              result: 0,
            };
            return resultFields;
          }, {});
          trainingResults[option] = {
            label: fieldsConfig.options[option].label,
            fields: { ...resultFields },
          };
        }
        return trainingResults;
      },
      {},
    );

    const crossTotalFields = [
      ...new Set(
        Object.keys(trainingResults)
          .reduce((resultFields, option) => {
            Object.keys(trainingResults[option].fields).forEach((field) => {
              resultFields.push(field);
            });
            return resultFields;
          }, [])
          .filter((field, i, array) => {
            return array.indexOf(field) !== array.lastIndexOf(field);
          }),
      ),
    ];

    const crossTotals = crossTotalFields.reduce(
      (crossTotals, crossTotalField) => {
        crossTotals[crossTotalField] = { label: "", unit: "", result: 0 };
        // ADD COMMENT FOR fieldInitialized
        let fieldInitialized = false;

        Object.keys(trainingResults).every((trainingResultsField) => {
          Object.keys(trainingResults[trainingResultsField].fields).every(
            (key) => {
              if (key === crossTotalField) {
                crossTotals[crossTotalField].label =
                  trainingResults[trainingResultsField].fields[key].label;
                crossTotals[crossTotalField].unit =
                  trainingResults[trainingResultsField].fields[key].unit;
                fieldInitialized = true;
                return false;
              } else {
                return true;
              }
            },
          );
          return fieldInitialized === false;
        });
        return crossTotals;
      },
      {},
    );
    return {
      logs: { label: "Logs", unit: false, result: 0 },
      duration: { label: "Duration", unit: false, result: 0 },
      ...trainingResults,
      ...crossTotals,
      calcTotals(
        fieldsConfig,
        option,
        InputModel,
        convertTime,
        convertNumberString,
      ) {
        this.logs.result += 1;
        this.duration.result += convertTime(InputModel.duration.value);

        const optionFields = Object.keys(fieldsConfig.options[option].fields);
        if (optionFields.length > 0) {
          optionFields.forEach((field) => {
            this[option].fields[field].result += convertNumberString(
              InputModel[field].value,
            );
            if (this[field]) {
              this[field].result += convertNumberString(
                InputModel[field].value,
              );
            }
          });
        }
      },
      formatTotals(formatResultFields, formatDuration) {
        Object.keys(this).forEach((field) => {
          if (this[field].fields) {
            Object.keys(this[field].fields).forEach((resultField) => {
              this[field].fields[resultField].result = formatResultFields(
                this[field].fields[resultField].result,
              );
            });
          } else {
            switch (field) {
              case "logs":
                break;
              case "duration":
                this.duration.result = formatDuration(this.duration.result);
                break;
              default:
                this[field].result = formatResultFields(this[field].result);
            }
          }
        });
      },
    };
  }

  function makeProportions(fieldsConfig, totalCount) {
    return {
      ...Object.keys(fieldsConfig).reduce((proportions, field) => {
        proportions[field] = {
          label: fieldsConfig[field].label,
          count: 0,
          percent: 0,
        };
        return proportions;
      }, {}),
      calcProportions(field) {
        this[field].count += 1;
        this[field].percent = Math.round(
          (this[field].count / totalCount) * 100,
        );
      },
      outputData() {
        let cumulated = 0;
        return Object.keys(this).reduce((dataset, key) => {
          if (typeof this[key] !== "function") {
            dataset.push({
              name: key,
              label: this[key].label,
              count: this[key].count,
              percent: this[key].percent,
              cumulated,
            });
          }
          cumulated += this[key].percent;
          return dataset;
        }, []);
      },
    };
  }

  function makeTimeline(scale, endDate = new Date()) {
    let dataset = [];
    for (let i = 0; i < scale; i++) {
      dataset[i] = { name: null, label: null, date: null };
    }
    return {
      dataset,
      endDate,
      calcTimeline(fieldsConfig, option, date) {
        const logDate = new Date(date);
        const diff = this.endDate.getTime() - logDate.getTime();
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));

        if (days < scale) {
          this.dataset[this.dataset.length - 1 - days] = {
            name: option,
            label: fieldsConfig[option].label,
            date: dateTime("date", false, logDate),
          };
        }
      },
    };
  }

  function makeGraph(fieldsConfig, endDate = new Date()) {
    const datasetKeys = Object.keys(fieldsConfig).reduce(
      (datasetKeys, option) => {
        Object.keys(fieldsConfig[option].fields).forEach((field) => {
          if (fieldsConfig[option].fields[field].plotGraph) {
            datasetKeys.unit = fieldsConfig[option].fields[field].unit;
            datasetKeys.push({
              key: `${option}-${field}`,
              option: fieldsConfig[option].label,
              field: fieldsConfig[option].fields[field].label,
            });
          }
        });
        return datasetKeys;
      },
      [],
    );

    let monthsScale = months
      .slice(endDate.getMonth() + 1)
      .concat(months.slice(0, endDate.getMonth() + 1));

    let dataset = [];
    for (let i = 0; i < 12; i++) {
      dataset[i] = {
        name: monthsScale[i][1],
        total: null,
      };
      for (const datasetKey of datasetKeys) {
        dataset[i][datasetKey.key] = null;
      }
    }

    const firstOfCurrentMonth = new Date(
      endDate.getFullYear(),
      endDate.getMonth(),
      1,
    );

    return {
      dataset,
      datasetKeys,
      firstOfCurrentMonth,
      calcGraph(fieldsConfig, option, log, convertNumberString) {
        const optionFields = Object.keys(fieldsConfig[option].fields);
        const logDate = new Date(log.date.value);

        if (optionFields.length > 0) {
          optionFields.forEach((field) => {
            if (fieldsConfig[option].fields[field].plotGraph) {
              const valueKey = `${option}-${field}`;
              const monthsAgo =
                Math.floor(
                  (this.firstOfCurrentMonth.getTime() - logDate.getTime()) /
                    (1000 * 60 * 60 * 24 * 30),
                ) + 1;
              const monthIndex = 12 - 1 - monthsAgo;

              this.dataset[monthIndex][valueKey] =
                this.dataset[monthIndex][valueKey] === null
                  ? convertNumberString(log[field].value)
                  : this.dataset[monthIndex][valueKey] +
                    convertNumberString(log[field].value);

              this.dataset[monthIndex].total =
                this.dataset[monthIndex].total === null
                  ? convertNumberString(log[field].value)
                  : this.dataset[monthIndex].total +
                    convertNumberString(log[field].value);
            }
          });
        }
      },
    };
  }

  const trainingTotals = makeTrainingTotals(fields.training);
  const trainingTypeProportions = makeProportions(
    fields.training.options,
    logs.length,
  );
  const trainingTimelineScale = 60;
  const trainingTimeline = makeTimeline(trainingTimelineScale);
  const trainingGraph = makeGraph(fields.training.options);

  for (const log of logs) {
    const option = findTrainingField(fields, log.training.value);
    trainingTotals.calcTotals(
      fields.training,
      option,
      log,
      timeToFloatHours,
      parseFloatNaNSafe,
    );
    trainingTypeProportions.calcProportions(option);
    trainingTimeline.calcTimeline(
      fields.training.options,
      option,
      log.date.value,
    );
    trainingGraph.calcGraph(
      fields.training.options,
      option,
      log,
      parseFloatNaNSafe,
    );
  }

  // Formatting
  trainingTotals.formatTotals(onlyFloatToDecPlaces2, floatHoursToTime);
  trainingTypeProportions.dataset = trainingTypeProportions.outputData();

  return (
    <section className="LogStats">
      <h2 className="sr-only">Log Statistics</h2>
      {settings.stats.diagrams.show ? (
        <div className="diagram-grid">
          <LogStatsGraph
            graph={trainingGraph.dataset}
            datasetKeys={trainingGraph.datasetKeys}
            heading={`Results Graph (12 Months)`}
          />
          <LogStatsTimeline
            fields={fields}
            timeline={trainingTimeline.dataset}
            heading={`Log Timeline (${trainingTimelineScale} Days)`}
          />
          <LogStatsProportions
            proportions={trainingTypeProportions.dataset}
            heading="Training Proportions (%)"
          />
        </div>
      ) : null}
      {settings.stats.totals.show ? (
        <LogStatsTotals totals={trainingTotals} heading="Log Totals" />
      ) : null}
    </section>
  );
}

export default LogStats;
