require("dotenv").config();
const express = require("express");
const multer = require("multer");
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

// 🔹 환경 변수 로드
const PORT = process.env.PORT || 8000;
const UPLOAD_DIR = process.env.UPLOAD_DIR || "uploads";
const CACHE_DIR = process.env.CACHE_DIR || "cache";
const SECRET_KEY = process.env.SECRET_KEY || "default-secret";
const PRESIGNED_EXPIRATION =
  parseInt(process.env.PRESIGNED_EXPIRATION, 10) || 300;

// 🔹 서버 설정
const app = express();

// 폴더가 없으면 생성
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR);

// 🔹 Multer 설정 (파일 업로드)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    console.log("file", file.filename, file);
    const webpFilename = `${file.originalname}`;
    cb(null, webpFilename);
  },
});

const upload = multer({ storage });

// 🔹 1️⃣ 다중 이미지 업로드 API (WebP 변환 후 저장)
app.post("/upload", upload.array("images"), async (req, res) => {
  const { key, expires, signature } = req.query;

  // 🔸 Presigned URL 검증
  if (!key || !expires || !signature) {
    return res.status(400).json({ error: "Invalid request parameters" });
  }

  const expectedSignature = crypto
    .createHmac("sha256", SECRET_KEY)
    .update(`${key}:${expires}`)
    .digest("hex");

  if (signature !== expectedSignature) {
    return res.status(403).json({ error: "Invalid signature" });
  }

  if (Date.now() / 1000 > Number(expires)) {
    return res.status(403).json({ error: "Presigned URL expired" });
  }

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: "이미지를 업로드하세요." });
  }

  const uploadedFiles = [];

  try {
    for (const file of req.files) {
      const originalPath = path.join(UPLOAD_DIR, file.filename);
      const webpPath = originalPath.split(".").slice(0, -1).join(".") + ".webp";

      if (!originalPath.includes(".webp")) {
        await sharp(file.path).toFormat("webp").toFile(webpPath);
      }

      uploadedFiles.push({
        originalName: file.originalname,
        filename: path.basename(webpPath),
      });
    }

    res.json({ message: "업로드 성공", files: uploadedFiles });
  } catch (error) {
    console.error("WebP 변환 오류:", error);
    res.status(500).json({ error: "이미지 처리 중 오류 발생" });
  }
});

// 🔹 2️⃣ 이미지 리사이징 및 캐싱 API
app.get("/images/*", async (req, res) => {
  const filename = decodeURIComponent(req.params[0]); // 전체 경로 받아오기
  const width = parseInt(req.query.width, 10);

  // 원본 이미지 경로 절대 경로로 설정
  const originalPath = path.resolve(UPLOAD_DIR, filename);
  if (!fs.existsSync(originalPath))
    return res.status(404).json({ error: "이미지를 찾을 수 없습니다." });

  // 원본 이미지 크기 가져오기
  const metadata = await sharp(originalPath).metadata();
  const originalWidth = metadata.width;

  // width가 없거나 원본보다 크면 원본 반환
  if (!width || width >= originalWidth) return res.sendFile(originalPath);

  // 캐시 폴더 경로 절대 경로로 설정
  const imageCacheDir = path.resolve(CACHE_DIR, path.dirname(filename)); // 기존 폴더 구조 유지
  const cachedPath = path.resolve(
    imageCacheDir,
    `${path.basename(filename, path.extname(filename))}_${width}.webp`
  );

  // 캐시된 파일이 있으면 바로 제공
  if (fs.existsSync(cachedPath)) return res.sendFile(cachedPath);

  // 캐시 폴더가 없으면 생성
  if (!fs.existsSync(imageCacheDir))
    fs.mkdirSync(imageCacheDir, { recursive: true });

  try {
    // 이미지 리사이징 후 캐시에 저장
    await sharp(originalPath)
      .resize({ width })
      .toFormat("webp")
      .toFile(cachedPath);
    res.sendFile(cachedPath);
  } catch (error) {
    console.error("리사이징 오류:", error);
    res.status(500).json({ error: "이미지 처리 중 오류 발생" });
  }
});
// 🔹 3️⃣ 서버 실행
app.listen(PORT, () => console.log(`✅ 서버 실행: http://localhost:${PORT}`));
