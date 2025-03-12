const https = require("https");
const fs = require("fs");

const download = async (url, filepath) => {
  try {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    fs.writeFileSync(filepath, buffer);
  } catch (error) {
    console.error("다운로드 오류:", error);
  }
};

const imageList = fs.readFileSync("images.txt", "utf8").split("\n");
const imageListWithoutExtension = imageList
  .map((image) => image.split("/")[1])
  .filter((image) => image)
  .map((image) => image.replace("\r", ""));

const downloadAll = async () => {
  for await (const image of imageListWithoutExtension) {
    const url = `https://image.tmdb.org/t/p/original/${image}`;
    const filepath = `./uploads/${image}`;
    if (fs.existsSync(filepath)) {
      console.log(`${image} 이미 존재합니다.`);
      continue;
    }
    await download(url, filepath);
  }
};

downloadAll();
