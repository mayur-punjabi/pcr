const fs = require("fs");
const path = require("path");

const axios = require("axios");
const cron = require("node-cron");
const { time } = require("console");

let oldPCR = 0;
let pcrs = [];
let pcrDiff = 0;

const getTime = () => {
  let date_ob = new Date();

  // current date
  // adjust 0 before single digit date
  let date = ("0" + date_ob.getDate()).slice(-2);

  // current month
  let month = ("0" + (date_ob.getMonth() + 1)).slice(-2);

  // current year
  let year = date_ob.getFullYear().toString();

  // current hours
  let hours = date_ob.getHours();

  // current minutes
  let minutes = date_ob.getMinutes();

  // current seconds
  let seconds = date_ob.getSeconds();

  // prints time in HH:MM format
  return { year, month, date, hours, minutes };
};

const { year, month, date } = getTime();

// create today's folder
const todaysFolder = path.resolve(year, month, date);
if (!fs.existsSync(todaysFolder)) {
  fs.mkdirSync(todaysFolder, { recursive: true });
}

// create today's error file
const errorFile = path.resolve(todaysFolder, "error.json");
if (!fs.existsSync(errorFile)) {
  fs.writeFileSync(errorFile, "{}");
}

// create today's pcr file
const pcrFile = path.resolve(todaysFolder, "pcr.json");
if (!fs.existsSync(pcrFile)) {
  fs.writeFileSync(pcrFile, "{}");
}

// axios.defaults.headers.common["User-Agent"] =
//   "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:80.0) Gecko/20100101 Firefox/80.0";

const logError = (message, error) => {
  const { hours, minutes } = getTime();
  const time = `${hours} ${minutes}`;
  try {
    const fileData = JSON.parse(fs.readFileSync(errorFile));

    const dataToAdd = {
      message,
      error,
    };
    if (time in fileData) {
      fileData[time].push(dataToAdd);
    } else {
      fileData[time] = [dataToAdd];
    }
    fs.writeFileSync(errorFile, JSON.stringify(fileData));
  } catch (error) {
    console.error("error while logging error", error);
  }
};

const updatePCRFileData = (data) => {
  const { hours, minutes } = getTime();
  const time = `${hours} ${minutes}`;

  try {
    const fileData = JSON.parse(fs.readFileSync(pcrFile));

    if (time in fileData) {
      fileData[time].push(data);
    } else {
      fileData[time] = [data];
    }

    fs.writeFileSync(pcrFile, JSON.stringify(fileData));
  } catch (error) {
    logError("failed to write pcr data for time - " + time, error);
    console.error("failed to write pcr data for time - " + time);
  }
};

const getData = async () => {
  const { year, month, date, hours, minutes } = getTime();
  const time = `${hours} ${minutes}`;
  const fileName = path.resolve(year, month, date, `${time}.json`);

  for (let i = 0; i < 2; i++) {
    if (i == 1) {
      console.log("trying again for - " + time);
    }

    try {
      const resData = (
        await axios.get(
          "https://www.nseindia.com/api/option-chain-indices?symbol=BANKNIFTY"
        )
      ).data;

      const { timestamp, underlyingValue } = resData.records;

      const filtered = resData.filtered;

      const { CE, PE } = filtered;
      const pcr = PE.totOI / CE.totOI;
      const moreVol = CE.totVol > PE.totVol ? "CE" : "PE";
      const pcrDiff = Math.abs(pcr - oldPCR);

      const fileData = {
        timestamp,
        underlyingValue,
        filtered,
        pcr,
        moreVol,
        pcrDiff,
      };

      const pcrFileData = {
        pcr,
      };

      // update oldpcr if diff between oldpcr and current pcr is >= 0.2
      if (oldPCR === 0) {
        oldPCR = pcr;
      } else if (Math.abs(pcr - oldPCR) >= 0.2) {
        oldPCR = pcr;
        console.log("pcr updated for - " + time);
        fileData["pcrUpdated"] = true;
        pcrFileData["pcrUpdated"] = true;
      }

      // write the options data in respective file
      fs.writeFileSync(fileName, JSON.stringify(fileData));

      // update pcr file data
      updatePCRFileData(pcrFileData);

      console.log("data got for - " + time);
      break;
    } catch (error) {
      logError("failed to get data for time - " + time, error);
      console.error("failed to get data for time - " + time);
    }
  }
};

console.log("started getting data");

// fetch data every minute
getData();
cron.schedule("*/5 * * * *", () => {
  try {
    getData();
  } catch (error) {
    logError("Error occurred in getting data for time - " + time, error);
  }
});
